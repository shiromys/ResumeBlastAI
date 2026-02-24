from flask import Blueprint, request, jsonify
import stripe
import os
import requests
from datetime import datetime
from dotenv import load_dotenv
import traceback

# Load environment variables
load_dotenv(override=True)

payment_webhook_bp = Blueprint('payment_webhook', __name__)

# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX 1: Read env vars inside functions (not at module load time)
# Module-level constants like STRIPE_WEBHOOK_SECRET = os.getenv(...) are
# evaluated BEFORE app.py finishes loading .env, so they come back as None.
# Using helper functions ensures the value is read AFTER everything is loaded.
# ─────────────────────────────────────────────────────────────────────────────
def _get_stripe_key():
    return os.getenv('STRIPE_SECRET_KEY')

def _get_webhook_secret():
    return os.getenv('STRIPE_WEBHOOK_SECRET')

def _get_supabase_url():
    return os.getenv('SUPABASE_URL')

def _get_supabase_key():
    return os.getenv('SUPABASE_SERVICE_ROLE_KEY')


def _get_headers():
    supabase_key = _get_supabase_key()
    return {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIX 2: Route changed from /api/webhooks/stripe → /api/payment/webhook
# This matches exactly what you configured in the Stripe dashboard:
#   https://resumeblastai-production.up.railway.app/api/payment/webhook
# The old route /api/webhooks/stripe was never receiving any events from Stripe
# because the URL didn't match — that was the main reason webhook wasn't working.
# ─────────────────────────────────────────────────────────────────────────────
@payment_webhook_bp.route('/api/payment/webhook', methods=['POST'])
def stripe_webhook():
    payload    = request.data
    sig_header = request.headers.get('Stripe-Signature')

    webhook_secret = _get_webhook_secret()

    if not webhook_secret:
        print("❌ STRIPE_WEBHOOK_SECRET not configured in environment")
        return jsonify({'error': 'Webhook secret missing'}), 500

    # Verify the event came from Stripe (not a fake request)
    try:
        stripe.api_key = _get_stripe_key()
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except ValueError as e:
        print(f"❌ Invalid payload: {e}")
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        print(f"❌ Invalid signature: {e}")
        return jsonify({'error': 'Invalid signature'}), 400

    print("\n" + "=" * 70)
    print(f"📥 Stripe Webhook Event Received: {event['type']}")
    print("=" * 70)

    # ─────────────────────────────────────────────────────────────────────
    # ✅ FIX 3: Handle all 3 event types you registered in Stripe dashboard
    # Previously only checkout.session.completed was handled.
    # ─────────────────────────────────────────────────────────────────────
    if event['type'] == 'checkout.session.completed':
        try:
            handle_checkout_completed(event['data']['object'])
        except Exception:
            print("❌ Error in handle_checkout_completed:")
            traceback.print_exc()
            # Always return 200 — Stripe retries on non-200, causing duplicate sends

    elif event['type'] == 'payment_intent.succeeded':
        try:
            handle_payment_intent_succeeded(event['data']['object'])
        except Exception:
            print("❌ Error in handle_payment_intent_succeeded:")
            traceback.print_exc()

    elif event['type'] == 'payment_intent.payment_failed':
        try:
            handle_payment_intent_failed(event['data']['object'])
        except Exception:
            print("❌ Error in handle_payment_intent_failed:")
            traceback.print_exc()

    else:
        print(f"ℹ️ Unhandled event type (ignored): {event['type']}")

    # Always return 200 so Stripe doesn't retry
    return jsonify({'status': 'ok'}), 200


# ─────────────────────────────────────────────────────────────────────────────
# HANDLER 1: checkout.session.completed
# This is the most important event — fires when user completes Stripe checkout.
# ✅ FIX 4: Now also creates the drip campaign and triggers Day 1 blast.
# ─────────────────────────────────────────────────────────────────────────────
def handle_checkout_completed(session_payload):
    session_id = session_payload.get('id')

    print("\n" + "=" * 70)
    print(f"✅ Processing checkout.session.completed")
    print(f"   Session ID: {session_id}")
    print("=" * 70)

    supabase_url = _get_supabase_url()

    try:
        stripe.api_key = _get_stripe_key()

        # 1. Retrieve full session with payment details
        session = stripe.checkout.Session.retrieve(
            session_id,
            expand=[
                'payment_intent',
                'payment_intent.payment_method',
                'payment_intent.charges'
            ]
        )

        payment_intent = session.payment_intent
        if not payment_intent:
            print("❌ No payment_intent on session — skipping")
            return

        payment_intent_id = payment_intent.id
        print(f"✅ PaymentIntent: {payment_intent_id}")

        # 2. Extract card details
        card_brand = None
        card_last4 = None
        payment_method = payment_intent.payment_method

        if isinstance(payment_method, str):
            payment_method = stripe.PaymentMethod.retrieve(payment_method)

        if payment_method and hasattr(payment_method, 'card') and payment_method.card:
            card_brand = payment_method.card.brand
            card_last4 = payment_method.card.last4

        print(f"💳 Card: {card_brand} **** {card_last4}")

        # 3. Extract receipt URL
        receipt_url = None
        if payment_intent.charges and payment_intent.charges.data:
            receipt_url = payment_intent.charges.data[0].receipt_url
        print(f"🧾 Receipt: {receipt_url}")

        # 4. Extract plan and user from Stripe metadata
        plan_name = session.metadata.get('plan_name', 'basic')
        user_id   = session.metadata.get('user_id', '')
        print(f"📦 Plan: {plan_name} | User: {user_id}")

        # 5. Check payment record exists in Supabase
        check_resp = requests.get(
            f"{supabase_url}/rest/v1/payments?stripe_session_id=eq.{session_id}&select=id",
            headers=_get_headers()
        )

        if check_resp.status_code != 200 or not check_resp.json():
            print("⚠️ Payment record not found in DB — creating it now")
            # Create the payment record if frontend didn't create it (edge case)
            requests.post(
                f"{supabase_url}/rest/v1/payments",
                json={
                    "user_id":          user_id,
                    "stripe_session_id": session_id,
                    "amount":           session.amount_total,
                    "currency":         session.currency,
                    "status":           "completed",
                    "plan_name":        plan_name,
                    "initiated_at":     datetime.utcnow().isoformat(),
                    "completed_at":     datetime.utcnow().isoformat(),
                },
                headers=_get_headers()
            )
        else:
            print("✅ Payment record found — updating status to completed")

        # 6. Update payment record to completed
        update_data = {
            "status":             "completed",
            "payment_intent_id":  payment_intent_id,
            "completed_at":       datetime.utcnow().isoformat(),
            "payment_method":     "card",
            "card_brand":         card_brand,
            "card_last4":         card_last4,
            "receipt_url":        receipt_url,
            "amount":             session.amount_total,
            "currency":           session.currency,
            "plan_name":          plan_name,
        }
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}

        patch_resp = requests.patch(
            f"{supabase_url}/rest/v1/payments?stripe_session_id=eq.{session_id}",
            json=update_data,
            headers=_get_headers()
        )

        if patch_resp.status_code in [200, 204]:
            print("✅ Payment record updated successfully")
        else:
            print(f"❌ Payment update failed: {patch_resp.status_code} {patch_resp.text}")

        # ─────────────────────────────────────────────────────────────
        # ✅ FIX 4: Create drip campaign + trigger Day 1 blast
        # This is the critical part that was missing before.
        # The frontend (PaymentBlastTrigger.jsx) also does this as a
        # fallback, but the webhook is the reliable server-side trigger.
        # ─────────────────────────────────────────────────────────────
        _trigger_drip_campaign(
            user_id=user_id,
            plan_name=plan_name,
            stripe_session_id=session_id,
            supabase_url=supabase_url
        )

        print("\n" + "=" * 70)
        print("✅ checkout.session.completed PROCESSING COMPLETE")
        print("=" * 70)

    except Exception as e:
        print(f"❌ Fatal error in handle_checkout_completed: {e}")
        traceback.print_exc()
        raise


# ─────────────────────────────────────────────────────────────────────────────
# ✅ NEW: Drip campaign trigger — called after successful checkout
# Fetches resume data from Supabase and starts the drip campaign
# ─────────────────────────────────────────────────────────────────────────────
def _trigger_drip_campaign(user_id, plan_name, stripe_session_id, supabase_url):
    """
    Creates a drip campaign record and fires Day 1 blast.
    Works for both registered users (UUID) and guests (guest_XXX string).
    """
    print(f"\n[Drip] 🚀 Triggering drip campaign for user={user_id} plan={plan_name}")

    try:
        # 1. Check if drip campaign already exists for this session (idempotency)
        existing = requests.get(
            f"{supabase_url}/rest/v1/blast_campaigns"
            f"?stripe_session_id=eq.{stripe_session_id}&select=id,drip_day1_sent_at",
            headers=_get_headers()
        )

        if existing.status_code == 200 and existing.json():
            row = existing.json()[0]
            if row.get('drip_day1_sent_at'):
                print(f"[Drip] ⏭️ Day 1 already sent for session {stripe_session_id} — skipping")
                return
            else:
                # Campaign exists but Day 1 not sent yet — use existing campaign_id
                campaign_id = row['id']
                print(f"[Drip] ℹ️ Campaign exists ({campaign_id}) but Day 1 not sent — triggering")
                _fire_day1(campaign_id)
                return

        # 2. Fetch the most recent resume for this user
        is_guest = str(user_id).startswith('guest_')

        resume_data = _fetch_latest_resume(user_id, supabase_url, is_guest)
        if not resume_data:
            print(f"[Drip] ⚠️ No resume found for user {user_id} — cannot create drip campaign")
            return

        # 3. Create the drip campaign record
        from routes.drip_campaign import create_drip_campaign

        campaign_result = create_drip_campaign({
            "user_id":          user_id,
            "user_type":        "guest" if is_guest else "registered",
            "resume_id":        resume_data.get('id'),
            "stripe_session_id": stripe_session_id,
            "plan_name":        plan_name,
            "candidate_name":   resume_data.get('candidate_name', ''),
            "candidate_email":  resume_data.get('candidate_email', ''),
            "candidate_phone":  resume_data.get('candidate_phone', ''),
            "job_role":         resume_data.get('detected_role', 'Professional'),
            "resume_url":       resume_data.get('file_url', ''),
            "resume_name":      resume_data.get('file_name', 'Resume.pdf'),
            "years_experience": resume_data.get('years_experience', ''),
            "key_skills":       resume_data.get('key_skills', ''),
            "location":         resume_data.get('location', 'Remote'),
        })

        if not campaign_result.get('success'):
            print(f"[Drip] ❌ Failed to create campaign: {campaign_result}")
            return

        campaign_id = campaign_result['campaign_id']
        print(f"[Drip] ✅ Campaign created: {campaign_id}")

        # 4. Fire Day 1 blast immediately
        _fire_day1(campaign_id)

    except Exception as e:
        print(f"[Drip] ❌ Error triggering drip campaign: {e}")
        traceback.print_exc()


def _fetch_latest_resume(user_id, supabase_url, is_guest):
    """Fetch the most recent resume for this user from Supabase."""
    try:
        # Try fetching by user_id first
        resp = requests.get(
            f"{supabase_url}/rest/v1/resumes"
            f"?user_id=eq.{user_id}"
            f"&order=created_at.desc&limit=1"
            f"&select=id,file_url,file_name,candidate_name,candidate_email,"
            f"candidate_phone,detected_role,years_experience,key_skills,location,analysis_data",
            headers=_get_headers()
        )

        if resp.status_code == 200 and resp.json():
            row = resp.json()[0]
            # Flatten analysis_data into the row for convenience
            analysis = row.get('analysis_data') or {}
            if not row.get('candidate_name') and analysis.get('candidate_name'):
                row['candidate_name'] = analysis['candidate_name']
            if not row.get('candidate_email') and analysis.get('candidate_email'):
                row['candidate_email'] = analysis['candidate_email']
            if not row.get('detected_role') and analysis.get('detected_role'):
                row['detected_role'] = analysis['detected_role']
            if not row.get('key_skills') and analysis.get('top_skills'):
                skills = analysis['top_skills']
                row['key_skills'] = ', '.join(skills) if isinstance(skills, list) else str(skills)
            return row

        print(f"[Drip] ⚠️ No resume found for user_id={user_id}")
        return None

    except Exception as e:
        print(f"[Drip] ❌ Error fetching resume: {e}")
        return None


def _fire_day1(campaign_id):
    """Run Day 1 blast in a background thread so webhook returns fast."""
    import threading

    def _run():
        try:
            from services.drip_scheduler import run_day1_blast
            result = run_day1_blast(campaign_id)
            print(f"[Drip] ✅ Day 1 blast result for {campaign_id}: {result}")
        except Exception as e:
            print(f"[Drip] ❌ Day 1 blast error for {campaign_id}: {e}")
            traceback.print_exc()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    print(f"[Drip] 🚀 Day 1 blast started in background thread for campaign {campaign_id}")


# ─────────────────────────────────────────────────────────────────────────────
# HANDLER 2: payment_intent.succeeded
# Secondary confirmation that money was actually charged.
# Updates the payment record with final confirmed status.
# ─────────────────────────────────────────────────────────────────────────────
def handle_payment_intent_succeeded(payment_intent):
    pi_id = payment_intent.get('id')
    print(f"\n✅ payment_intent.succeeded: {pi_id}")

    supabase_url = _get_supabase_url()

    try:
        # Update payment record if it exists for this payment_intent
        resp = requests.patch(
            f"{supabase_url}/rest/v1/payments?payment_intent_id=eq.{pi_id}",
            json={
                "status":       "confirmed",
                "confirmed_at": datetime.utcnow().isoformat(),
            },
            headers=_get_headers()
        )
        if resp.status_code in [200, 204]:
            print(f"✅ Payment confirmed in DB for PI: {pi_id}")
        else:
            # Not an error — payment record may have been matched by session_id already
            print(f"ℹ️ No payment record found for PI {pi_id} (may have been updated by checkout event)")

    except Exception as e:
        print(f"❌ Error in handle_payment_intent_succeeded: {e}")
        traceback.print_exc()


# ─────────────────────────────────────────────────────────────────────────────
# HANDLER 3: payment_intent.payment_failed
# Fires when a card is declined or payment fails.
# Logs the failure in Supabase so admin can see failed attempts.
# ─────────────────────────────────────────────────────────────────────────────
def handle_payment_intent_failed(payment_intent):
    pi_id          = payment_intent.get('id')
    failure_message = payment_intent.get('last_payment_error', {}).get('message', 'Unknown error')
    failure_code    = payment_intent.get('last_payment_error', {}).get('code', 'unknown')

    print(f"\n❌ payment_intent.payment_failed: {pi_id}")
    print(f"   Reason: {failure_message} (code: {failure_code})")

    supabase_url = _get_supabase_url()

    try:
        resp = requests.patch(
            f"{supabase_url}/rest/v1/payments?payment_intent_id=eq.{pi_id}",
            json={
                "status":          "failed",
                "failure_reason":  failure_message,
                "failure_code":    failure_code,
                "failed_at":       datetime.utcnow().isoformat(),
            },
            headers=_get_headers()
        )
        if resp.status_code in [200, 204]:
            print(f"✅ Payment failure logged in DB for PI: {pi_id}")
        else:
            print(f"ℹ️ No payment record found for failed PI: {pi_id}")

    except Exception as e:
        print(f"❌ Error in handle_payment_intent_failed: {e}")
        traceback.print_exc()