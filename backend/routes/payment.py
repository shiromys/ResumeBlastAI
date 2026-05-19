from flask import Blueprint, request, jsonify
import os
import stripe
from datetime import datetime
import requests
from dotenv import load_dotenv
from pathlib import Path

from services.guest_service import GuestService

_env_path = Path(__file__).resolve().parent.parent / '.env'
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path, override=False)

payment_bp = Blueprint('payment', __name__)

def _get_stripe_key():
    return os.getenv('STRIPE_SECRET_KEY')

def _get_supabase_url():
    return os.getenv('SUPABASE_URL')

def _get_supabase_key():
    return os.getenv('SUPABASE_SERVICE_ROLE_KEY')

def _get_frontend_url():
    return os.getenv('FRONTEND_URL', 'http://localhost:5173')

_stripe_key = os.getenv('STRIPE_SECRET_KEY')
_supabase_url = os.getenv('SUPABASE_URL')
print(f"🔑 payment.py STRIPE_SECRET_KEY: {'✅ SET (' + _stripe_key[:15] + '...)' if _stripe_key else '❌ NOT SET'}")
print(f"🔑 payment.py SUPABASE_URL: {'✅ SET' if _supabase_url else '❌ NOT SET'}")


# ── FIX 1: Separate headers for INSERT vs PATCH ──────────────────────────────
# Previously both used 'resolution=merge-duplicates' which caused Supabase to
# silently drop inserts when no unique constraint was declared to PostgREST.
def _insert_headers():
    """Headers for POST (INSERT) — standard return=representation."""
    key = _get_supabase_key()
    return {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }

def _patch_headers():
    """Headers for PATCH (UPDATE)."""
    key = _get_supabase_key()
    return {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }

def _read_headers():
    """Headers for GET (SELECT)."""
    key = _get_supabase_key()
    return {
        'apikey': key,
        'Authorization': f'Bearer {key}',
    }


# ── FIX 3: UUID sanitizer ─────────────────────────────────────────────────────
# Prevents 422 errors when frontend sends "", "null", "undefined" as user_id.
def _safe_uuid(value):
    """Return value only if it looks like a valid non-empty UUID, else None."""
    if not value:
        return None
    s = str(value).strip()
    if s in ('', 'null', 'None', 'undefined'):
        return None
    # Basic UUID length check (36 chars with dashes)
    if len(s) < 32:
        return None
    return s


# ── FIX 5: Upsert helper ─────────────────────────────────────────────────────
# Called by both create_checkout_session AND verify_payment.
# Checks if the row exists first, then INSERT or PATCH as needed.
def _upsert_payment(supabase_url, session_id, record):
    """
    Safe upsert: check existence → INSERT if missing, PATCH if present.
    Logs every outcome so Railway logs always show what happened.
    """
    try:
        check = requests.get(
            f"{supabase_url}/rest/v1/payments?stripe_session_id=eq.{session_id}&select=id,status",
            headers=_read_headers(),
            timeout=10
        )
        exists = check.status_code == 200 and len(check.json()) > 0

        if exists:
            resp = requests.patch(
                f"{supabase_url}/rest/v1/payments?stripe_session_id=eq.{session_id}",
                json=record,
                headers=_patch_headers(),
                timeout=10
            )
            if resp.status_code in [200, 204]:
                print(f"[Payment] ✅ PATCH success for session {session_id}")
            else:
                print(f"[Payment] ❌ PATCH failed: {resp.status_code} — {resp.text}")
            return resp.status_code in [200, 204]
        else:
            resp = requests.post(
                f"{supabase_url}/rest/v1/payments",
                json=record,
                headers=_insert_headers(),
                timeout=10
            )
            if resp.status_code in [200, 201]:
                print(f"[Payment] ✅ INSERT success for session {session_id}")
            else:
                print(f"[Payment] ❌ INSERT failed: {resp.status_code} — {resp.text}")
            return resp.status_code in [200, 201]

    except Exception as e:
        print(f"[Payment] ❌ _upsert_payment exception: {e}")
        return False


@payment_bp.route('/api/plans/public', methods=['GET'])
def get_public_plans():
    try:
        supabase_url = _get_supabase_url()
        url = f"{supabase_url}/rest/v1/plans?is_active=eq.true&order=price_cents.asc"
        resp = requests.get(url, headers=_read_headers())
        if resp.status_code == 200:
            return jsonify({'plans': resp.json()}), 200
        else:
            return jsonify({'plans': []}), 200
    except Exception as e:
        print(f"Error fetching plans: {e}")
        return jsonify({'error': str(e)}), 500


@payment_bp.route('/api/create-checkout-session', methods=['POST'])
def create_checkout_session():
    try:
        stripe.api_key = _get_stripe_key()

        if not stripe.api_key:
            print("❌ STRIPE_SECRET_KEY is not set in environment!")
            return jsonify({"success": False, "error": "Payment system not configured"}), 500

        supabase_url = _get_supabase_url()
        frontend_url = _get_frontend_url()

        data = request.get_json()
        user_email = data.get('email')
        user_id    = data.get('user_id')
        plan_type  = data.get('plan', 'basic').lower()
        disclaimer_accepted = data.get('disclaimer_accepted', False)

        price_id     = data.get('price_id')
        front_amount = data.get('amount')

        # 1. Fetch plan details from database
        plan_amount       = 999
        plan_display_name = 'Basic Plan'
        plan_limit        = 250

        try:
            url = f"{supabase_url}/rest/v1/plans?key_name=eq.{plan_type}&limit=1"
            plan_resp = requests.get(url, headers=_read_headers())
            if plan_resp.status_code == 200 and plan_resp.json():
                db_plan           = plan_resp.json()[0]
                plan_amount       = db_plan.get('price_cents', 999)
                plan_display_name = db_plan.get('display_name', f"{plan_type.capitalize()} Plan")
                plan_limit        = db_plan.get('recruiter_limit', 250)
            else:
                if plan_type == 'pro':
                    plan_amount       = 1299
                    plan_display_name = 'Pro Plan (500 Recruiters)'
                    plan_limit        = 500
        except Exception:
            if plan_type == 'pro':
                plan_amount = 1299
                plan_limit  = 500

        if front_amount:
            plan_amount = front_amount

        is_guest = GuestService.is_guest(str(user_id))

        resume_url     = str(data.get('resume_url', ''))[:500]
        candidate_name = str(data.get('candidate_name', ''))[:100]
        job_role       = str(data.get('job_role', ''))[:100]
        location       = str(data.get('location', 'Remote'))[:100]

        metadata = {
            'plan':          plan_type,
            'plan_name':     plan_type,
            'user_id':       str(user_id) if not is_guest else "",
            'guest_id':      str(user_id) if is_guest else "",
            'disclaimer_accepted': str(disclaimer_accepted),
            'resume_url':    resume_url,
            'candidate_name': candidate_name,
            'job_role':       job_role,
            'location':       location,
        }

        if is_guest:
            success_url = (
                f'{frontend_url}?payment=success'
                f'&session_id={{CHECKOUT_SESSION_ID}}'
                f'&guest_id={user_id}'
            )
            print(f"[Payment] 🏷️ Guest checkout — embedding guest_id: {user_id}")
        else:
            success_url = f'{frontend_url}?payment=success&session_id={{CHECKOUT_SESSION_ID}}'

        if price_id:
            line_items = [{'price': price_id, 'quantity': 1}]
        else:
            line_items = [{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': f"ResumeBlast {plan_display_name}",
                        'description': f'AI-powered resume distribution to {plan_limit} recruiters',
                    },
                    'unit_amount': plan_amount,
                },
                'quantity': 1,
            }]

        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=line_items,
            mode='payment',
            customer_email=user_email,
            client_reference_id=str(user_id),
            metadata=metadata,
            invoice_creation={"enabled": True},
            success_url=success_url,
            cancel_url=f'{frontend_url}?payment=cancelled',
        )

        # ── FIX 1+2+3: safe UUID, correct headers, logged response ──────────
        safe_user_id  = _safe_uuid(user_id) if not is_guest else None
        safe_guest_id = _safe_uuid(user_id) if is_guest else None

        payment_record = {
            "stripe_session_id":  checkout_session.id,
            "user_id":            safe_user_id,
            "guest_id":           safe_guest_id,
            "user_email":         user_email,
            "user_name":          user_email.split('@')[0] if user_email else "unknown",
            "amount":             plan_amount,
            "currency":           "usd",
            "status":             "initiated",
            "plan_name":          plan_type,
            "disclaimer_accepted": disclaimer_accepted,
            "initiated_at":       datetime.utcnow().isoformat(),
        }

        # ── FIX 5: use safe upsert so the row is guaranteed to be created ──
        _upsert_payment(supabase_url, checkout_session.id, payment_record)

        return jsonify({
            "success": True,
            "id":      checkout_session.id,
            "url":     checkout_session.url,
        })

    except Exception as e:
        print("❌ Checkout Error:", str(e))
        return jsonify({"success": False, "error": str(e)}), 500


@payment_bp.route('/api/payment/verify', methods=['POST'])
def verify_payment():
    try:
        stripe.api_key = _get_stripe_key()

        if not stripe.api_key:
            return jsonify({"error": "Payment system not configured"}), 500

        print("\n================ PAYMENT VERIFY =================")
        data       = request.get_json()
        session_id = data.get('session_id')

        if not session_id:
            return jsonify({"error": "session_id required"}), 400

        session = stripe.checkout.Session.retrieve(
            session_id,
            expand=['payment_intent', 'payment_intent.payment_method']
        )

        if session.payment_status != 'paid':
            return jsonify({"success": False})

        payment_intent = session.payment_intent
        card_brand  = None
        card_last4  = None
        receipt_url = None

        if payment_intent.payment_method:
            pm = payment_intent.payment_method
            if isinstance(pm, str):
                pm = stripe.PaymentMethod.retrieve(pm)
            if pm.card:
                card_brand = pm.card.brand
                card_last4 = pm.card.last4

        if payment_intent.latest_charge:
            charge      = stripe.Charge.retrieve(payment_intent.latest_charge)
            receipt_url = charge.receipt_url

        plan_name = session.metadata.get('plan_name', 'basic')
        user_id   = session.metadata.get('user_id')

        # Build the complete record with all known data from Stripe
        customer         = session.customer_details or {}
        customer_email   = customer.get('email', '') or ''
        customer_name    = customer.get('name', '')  or ''

        update_record = {
            "status":             "completed",
            "payment_intent_id":  payment_intent.id,
            "completed_at":       datetime.utcnow().isoformat(),
            "payment_method":     "card",
            "amount":             session.amount_total,
            "currency":           session.currency,
            "plan_name":          plan_name,
        }
        # Only add optional fields when available
        if card_brand:   update_record["card_brand"]   = card_brand
        if card_last4:   update_record["card_last4"]   = card_last4
        if receipt_url:  update_record["receipt_url"]  = receipt_url
        if customer_email: update_record["user_email"] = customer_email
        if customer_name:
            update_record["user_name"] = customer_name

        supabase_url = _get_supabase_url()

        # ── FIX 4+5: check existence first; INSERT if missing, PATCH if present
        check = requests.get(
            f"{supabase_url}/rest/v1/payments?stripe_session_id=eq.{session_id}&select=id,status",
            headers=_read_headers(),
            timeout=10
        )
        row_exists = check.status_code == 200 and len(check.json()) > 0

        if row_exists:
            # Normal path — row was created at checkout, just update status
            resp = requests.patch(
                f"{supabase_url}/rest/v1/payments?stripe_session_id=eq.{session_id}",
                json=update_record,
                headers=_patch_headers(),
                timeout=10
            )
            if resp.status_code in [200, 204]:
                print(f"[Payment] ✅ verify_payment PATCH success for {session_id}")
            else:
                print(f"[Payment] ❌ verify_payment PATCH failed: {resp.status_code} — {resp.text}")
                return jsonify({"error": "Supabase update failed"}), 500
        else:
            # ── FIX 4: Row was never created (Bug 1/2/3 struck earlier)
            # Build a full record from Stripe data and INSERT it now.
            print(f"[Payment] ⚠️ No existing row for {session_id} — inserting full record now")
            is_guest      = GuestService.is_guest(str(user_id or ''))
            safe_user_id  = _safe_uuid(user_id) if not is_guest else None
            safe_guest_id = _safe_uuid(user_id) if is_guest else None

            full_record = {
                "stripe_session_id":  session_id,
                "user_id":            safe_user_id,
                "guest_id":           safe_guest_id,
                "user_email":         customer_email or "",
                "user_name":          customer_name or (customer_email.split('@')[0] if customer_email else "unknown"),
                "amount":             session.amount_total,
                "currency":           session.currency,
                "plan_name":          plan_name,
                "initiated_at":       datetime.utcnow().isoformat(),
                **update_record,
            }
            resp = requests.post(
                f"{supabase_url}/rest/v1/payments",
                json=full_record,
                headers=_insert_headers(),
                timeout=10
            )
            if resp.status_code in [200, 201]:
                print(f"[Payment] ✅ verify_payment INSERT (recovery) success for {session_id}")
            else:
                print(f"[Payment] ❌ verify_payment INSERT failed: {resp.status_code} — {resp.text}")
                return jsonify({"error": "Supabase insert failed"}), 500

        if user_id and GuestService.is_guest(user_id):
            print(f"[Guest Payment] Updating guest status for: {user_id}")
            GuestService.save_payment(
                guest_id=user_id,
                plan_name=plan_name,
                stripe_session_id=session_id,
                amount=session.amount_total
            )

        return jsonify({"success": True})

    except Exception as e:
        print("❌ VERIFY PAYMENT CRASH:", str(e))
        return jsonify({"error": str(e)}), 500