import os
import stripe
import requests
import traceback
from flask import Blueprint, request, jsonify
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Import invoice service
from services.invoice_email_service import InvoiceEmailService

_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path, override=False)

payment_webhook_bp = Blueprint("payment_webhook", __name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# Safely initialize invoice service
try:
    _invoice_service = InvoiceEmailService()
except Exception as e:
    print(f"⚠️ Warning: InvoiceEmailService failed to initialize: {e}")
    _invoice_service = None

def _headers():
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }


def handle_checkout_completed(session: dict):
    """
    Called when Stripe fires checkout.session.completed.
    Saves payment record + sends receipt email via Brevo.
    """
    session_id   = session.get("id", "")
    
    # Safely fallback to {} if the payload explicitly sends `null`
    metadata     = session.get("metadata") or {}
    customer     = session.get("customer_details") or {}
    
    amount_total = session.get("amount_total", 0)           # cents
    currency     = session.get("currency", "usd")
    payment_status = session.get("payment_status", "")

    plan_name    = metadata.get("plan") or metadata.get("plan_name", "")
    user_id      = metadata.get("user_id", "")
    guest_id     = metadata.get("guest_id", "")

    # Read blast metadata stored by payment.py at checkout creation
    resume_url     = metadata.get("resume_url", "")
    candidate_name = metadata.get("candidate_name", "")
    job_role       = metadata.get("job_role", "")
    location       = metadata.get("location", "Remote")

    # ── Determine the customer email ────────────────────────────────────────
    customer_email = customer.get("email", "")
    customer_name  = customer.get("name", "")

    # Fallback: fetch email from Supabase if we have user_id
    if not customer_email and user_id and str(user_id).strip() not in ["None", "null", "undefined"]:
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/users?id=eq.{user_id}&select=email",
                headers=_headers()
            )
            if resp.status_code == 200 and resp.json():
                customer_email = resp.json()[0].get("email", "")
        except Exception as e:
            print(f"[Webhook] Could not fetch user email: {e}")

    print(f"\n[Webhook] checkout.session.completed")
    print(f"  session_id={session_id!r}")
    print(f"  plan={plan_name!r} user_id={user_id!r} guest_id={guest_id!r}")
    print(f"  amount={amount_total} {currency.upper()} status={payment_status}")
    print(f"  customer_email={customer_email!r}")

    if payment_status != "paid":
        print(f"[Webhook] Payment not paid (status={payment_status}) — skipping")
        return

    # ── ✅ FIX 1: Update payments table status to 'completed' ────────────────
    # Changed 'customer_email' -> 'user_email' and 'customer_name' -> 'user_name' to resolve PGRST204 Schema Cache mismatch.
    payment_completed = {
        "status":         "completed",
        "plan_name":      plan_name,
        "amount":         amount_total,
        "currency":       currency,
        "user_email":     customer_email,
        "user_name":      customer_name or (customer_email.split("@")[0] if customer_email else "unknown"),
        "completed_at":   datetime.utcnow().isoformat(),
    }

    try:
        existing = requests.get(
            f"{SUPABASE_URL}/rest/v1/payments?stripe_session_id=eq.{session_id}&select=id,status",
            headers=_headers()
        )
        
        if existing.status_code == 200 and existing.json():
            # Record exists as 'initiated' — patch it to 'completed'
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/payments?stripe_session_id=eq.{session_id}",
                json=payment_completed,
                headers=_headers()
            )
            print(f"[Webhook] Payment record patched to 'completed' for session {session_id}")
        else:
            # No record at all — insert a full new completed record
            # We enforce checking that UUID inputs are valid strings, otherwise we pass None
            db_user_id = user_id if (user_id and str(user_id).strip() not in ["None", "null", "undefined"]) else None
            db_guest_id = guest_id if (guest_id and str(guest_id).strip() not in ["None", "null", "undefined"]) else None
            
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/payments",
                json={
                    "stripe_session_id": session_id,
                    "user_id":           db_user_id,
                    "guest_id":          db_guest_id,
                    **payment_completed,
                },
                headers=_headers()
            )
            if resp.status_code in [200, 201]:
                print(f"[Webhook] Payment record inserted (new)")
            else:
                print(f"[Webhook] Failed to save payment: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"[Webhook] DB error saving payment: {e}")

    # ── Receipt email via Brevo ─────────────────────────────────
    if customer_email and _invoice_service:
        try:
            receipt_result = _invoice_service.send_payment_receipt(
                recipient_email   = customer_email,
                recipient_name    = customer_name or customer_email.split("@")[0],
                amount_cents      = amount_total,
                currency          = currency,
                plan_name         = plan_name,
                stripe_session_id = session_id,
                payment_date      = datetime.utcnow().strftime("%B %d, %Y"),
            )
            if receipt_result["success"]:
                print(f"[Webhook] ✅ Receipt email sent to {customer_email}")
            else:
                print(f"[Webhook] ⚠️ Receipt email failed: {receipt_result.get('error')}")
        except Exception as e:
            print(f"[Webhook] ⚠️ Receipt email exception (non-blocking): {e}")

    # ── ✅ FIX 2: Resolve User and Resume Context For Historical Resends ──────
    active_user_id = user_id or guest_id or ""
    
    # Sanitize variable inputs to weed out corrupted text tokens from old frontends
    if str(active_user_id).strip() in ["None", "null", "undefined"]:
        active_user_id = ""

    # Fallback A: If metadata lacks an internal user identity, look up user ID via email
    if not active_user_id and customer_email:
        try:
            print(f"[Webhook] Missing user identity metadata. Querying profile matching: {customer_email}...")
            user_resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/users?email=eq.{customer_email}&select=id",
                headers=_headers()
            )
            if user_resp.status_code == 200 and user_resp.json():
                active_user_id = user_resp.json()[0].get("id", "")
                print(f"[Webhook] Dynamic Recovery successful! Found User ID: {active_user_id}")
        except Exception as e:
            print(f"[Webhook] ⚠️ Profile mapping lookup fault (non-blocking): {e}")

    # Fallback B: If metadata lacks a resume_url, locate the latest record they uploaded before checking out
    if not resume_url and active_user_id:
        try:
            print(f"[Webhook] Missing resume_url asset string. Scanning user document database logs...")
            resume_resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/resumes?user_id=eq.{active_user_id}&order=created_at.desc&limit=1",
                headers=_headers()
            )
            if resume_resp.status_code == 200 and resume_resp.json():
                found_resume_record = resume_resp.json()[0]
                resume_url = found_resume_record.get("file_url", "")
                
                # Rehydrate metadata attributes if empty
                analysis_data = found_resume_record.get("analysis_data", {})
                if not candidate_name: candidate_name = analysis_data.get("candidate_name", "")
                if not job_role:       job_role = analysis_data.get("detected_role", "")
                print(f"[Webhook] Dynamic Recovery successful! Pulled target asset: {resume_url}")
        except Exception as e:
            print(f"[Webhook] ⚠️ Asset collection lookup fault (non-blocking): {e}")

    # ── Authoritative blast campaign runner ──
    FREE_PLANS_WH = {"free", "freemium"}
    if resume_url and plan_name and plan_name.lower() not in FREE_PLANS_WH:
        try:
            from routes.blast import send_blast_internal  # import here to avoid circular import

            print(f"[Webhook] 🚀 Triggering blast: plan={plan_name} user={active_user_id!r}")

            blast_result = send_blast_internal(
                plan_name      = plan_name,
                user_id        = active_user_id,
                resume_url     = resume_url,
                candidate_name = candidate_name,
                job_role       = job_role,
                location       = location,
                stripe_session = session_id,
            )

            if blast_result.get("already_processed"):
                print(f"[Webhook] ℹ️  Blast already handled by frontend — skipped (idempotent)")
            elif blast_result.get("success"):
                print(f"[Webhook] ✅ Blast triggered: campaign={blast_result.get('drip_campaign_id')} sent={blast_result.get('successful_sends', 0)}")
            else:
                print(f"[Webhook] ⚠️ Blast trigger failed (non-blocking): {blast_result.get('error')}")

        except Exception as e:
            # Non-blocking — never let a blast failure return 500 to Stripe (causes retries)
            print(f"[Webhook] ⚠️ Blast trigger exception (non-blocking): {e}")
            traceback.print_exc()
    elif not resume_url:
        print(f"[Webhook] ❌ Operation Aborted: Unable to map a valid resume file path string for user target.")


# ── ROUTE WITH SIGNATURE VERIFICATION ───────────────────────────────────────
@payment_webhook_bp.route("/api/webhooks/stripe", methods=["POST"])
def stripe_webhook():
    payload = request.get_data()
    sig_header = request.headers.get("Stripe-Signature", "")
    endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    # ✅ Fail fast if webhook secret is missing (often the cause of live-mode errors)
    if not endpoint_secret:
        print("❌ CRITICAL: STRIPE_WEBHOOK_SECRET is not set in environment!")
        return jsonify({"error": "Webhook secret missing"}), 500

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except ValueError as e:
        print("❌ Webhook Error: Invalid payload")
        return jsonify({"error": "Invalid payload"}), 400
    except stripe.error.SignatureVerificationError as e:
        print("❌ Webhook Error: Invalid signature (Check your STRIPE_WEBHOOK_SECRET)")
        return jsonify({"error": "Invalid signature"}), 400
    except Exception as e:
        print(f"❌ Webhook Exception: {str(e)}")
        return jsonify({"error": str(e)}), 400

    # ✅ Wrap internal processing in a try/except to prevent 500 crashes
    try:
        if event["type"] == "checkout.session.completed":
            handle_checkout_completed(event["data"]["object"])
    except Exception as e:
        print(f"❌ CRITICAL ERROR processing checkout.session.completed:")
        traceback.print_exc()
        return jsonify({"error": "Internal processing error"}), 500

    return jsonify({"received": True}), 200