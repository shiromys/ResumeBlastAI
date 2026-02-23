from flask import Blueprint, request, jsonify
import os
import stripe
from datetime import datetime
import requests
from dotenv import load_dotenv
from pathlib import Path

# ✅ FIX: Use absolute import to prevent ModuleNotFoundError when running from app.py
from services.guest_service import GuestService

# ✅ FIX: Load .env for local development only (Railway ignores this, uses its own env vars)
_env_path = Path(__file__).resolve().parent.parent / '.env'
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path, override=False)

payment_bp = Blueprint('payment', __name__)

# ✅ FIX: Helper functions to read env vars fresh at request time (not at import time)
def _get_stripe_key():
    return os.getenv('STRIPE_SECRET_KEY')

def _get_supabase_url():
    return os.getenv('SUPABASE_URL')

def _get_supabase_key():
    return os.getenv('SUPABASE_SERVICE_ROLE_KEY')

def _get_frontend_url():
    return os.getenv('FRONTEND_URL', 'http://localhost:5173')

# ✅ Debug print at startup to confirm keys are loaded
_stripe_key = os.getenv('STRIPE_SECRET_KEY')
_supabase_url = os.getenv('SUPABASE_URL')
print(f"🔑 payment.py STRIPE_SECRET_KEY: {'✅ SET (' + _stripe_key[:15] + '...)' if _stripe_key else '❌ NOT SET'}")
print(f"🔑 payment.py SUPABASE_URL: {'✅ SET' if _supabase_url else '❌ NOT SET'}")


def _get_headers():
    supabase_key = _get_supabase_key()
    return {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }

@payment_bp.route('/api/plans/public', methods=['GET'])
def get_public_plans():
    """Fetch active plans for the frontend"""
    try:
        supabase_url = _get_supabase_url()
        url = f"{supabase_url}/rest/v1/plans?is_active=eq.true&order=price_cents.asc"
        resp = requests.get(url, headers=_get_headers())
        if resp.status_code == 200:
            return jsonify({'plans': resp.json()}), 200
        else:
            return jsonify({'plans': []}), 200
    except Exception as e:
        print(f"Error fetching plans: {e}")
        return jsonify({'error': str(e)}), 500

# =========================================================
# CREATE CHECKOUT SESSION
# =========================================================
@payment_bp.route('/api/create-checkout-session', methods=['POST'])
def create_checkout_session():
    try:
        # ✅ FIX: Set stripe key fresh at every request (not at module load time)
        stripe.api_key = _get_stripe_key()

        if not stripe.api_key:
            print("❌ STRIPE_SECRET_KEY is not set in environment!")
            return jsonify({"success": False, "error": "Payment system not configured"}), 500

        supabase_url = _get_supabase_url()
        frontend_url = _get_frontend_url()

        data = request.get_json()
        user_email = data.get('email')
        user_id = data.get('user_id')
        plan_type = data.get('plan', 'basic').lower()

        # ✅ Capture disclaimer acceptance
        disclaimer_accepted = data.get('disclaimer_accepted', False)

        # 1. Fetch Plan details from Database
        plan_amount = 999
        plan_display_name = 'Basic Plan'
        plan_limit = 250

        try:
            url = f"{supabase_url}/rest/v1/plans?key_name=eq.{plan_type}&limit=1"
            plan_resp = requests.get(url, headers=_get_headers())

            if plan_resp.status_code == 200 and plan_resp.json():
                db_plan = plan_resp.json()[0]
                plan_amount = db_plan.get('price_cents', 999)
                plan_display_name = db_plan.get('display_name', f"{plan_type.capitalize()} Plan")
                plan_limit = db_plan.get('recruiter_limit', 250)
            else:
                if plan_type == 'pro':
                    plan_amount = 1299
                    plan_display_name = 'Pro Plan (500 Recruiters)'
                    plan_limit = 500
        except Exception:
            if plan_type == 'pro':
                plan_amount = 1299
                plan_limit = 500

        # ✅ MODIFIED: Added user_id to metadata so verify_payment knows who to update
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': f"ResumeBlast {plan_display_name}",
                        'description': f'AI-powered resume distribution to {plan_limit} recruiters',
                    },
                    'unit_amount': plan_amount,
                },
                'quantity': 1,
            }],
            mode='payment',
            customer_email=user_email,
            client_reference_id=str(user_id),
            metadata={'plan_name': plan_type, 'user_id': str(user_id)},
            success_url=f'{frontend_url}?payment=success&session_id={{CHECKOUT_SESSION_ID}}',
            cancel_url=f'{frontend_url}?payment=cancelled',
        )

        payment_record = {
            "user_id": user_id,
            "user_email": user_email,
            "user_name": user_email.split('@')[0] if user_email else "unknown",
            "stripe_session_id": checkout_session.id,
            "amount": plan_amount,
            "currency": "usd",
            "status": "initiated",
            "plan_name": plan_type,
            # ✅ Store disclaimer status
            "disclaimer_accepted": disclaimer_accepted,
            "initiated_at": datetime.utcnow().isoformat()
        }

        requests.post(
            f"{supabase_url}/rest/v1/payments",
            json=payment_record,
            headers=_get_headers()
        )

        return jsonify({
            "success": True,
            "id": checkout_session.id,
            "url": checkout_session.url
        })

    except Exception as e:
        print("❌ Checkout Error:", str(e))
        return jsonify({"success": False, "error": str(e)}), 500


@payment_bp.route('/api/payment/verify', methods=['POST'])
def verify_payment():
    try:
        # ✅ FIX: Set stripe key fresh at every request
        stripe.api_key = _get_stripe_key()

        if not stripe.api_key:
            return jsonify({"error": "Payment system not configured"}), 500

        print("\n================ PAYMENT VERIFY =================")
        data = request.get_json()
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
        card_brand = None
        card_last4 = None
        receipt_url = None

        if payment_intent.payment_method:
            pm = payment_intent.payment_method
            if isinstance(pm, str):
                pm = stripe.PaymentMethod.retrieve(pm)
            if pm.card:
                card_brand = pm.card.brand
                card_last4 = pm.card.last4

        if payment_intent.latest_charge:
            charge = stripe.Charge.retrieve(payment_intent.latest_charge)
            receipt_url = charge.receipt_url

        # ✅ GET user_id and plan from metadata
        plan_name = session.metadata.get('plan_name', 'basic')
        user_id = session.metadata.get('user_id')

        update_data = {
            "status": "completed",
            "payment_intent_id": payment_intent.id,
            "completed_at": datetime.utcnow().isoformat(),
            "payment_method": "card",
            "card_brand": card_brand,
            "card_last4": card_last4,
            "receipt_url": receipt_url,
            "amount": session.amount_total,
            "currency": session.currency,
            "plan_name": plan_name
        }

        update_data = {k: v for k, v in update_data.items() if v is not None}

        supabase_url = _get_supabase_url()
        resp = requests.patch(
            f"{supabase_url}/rest/v1/payments?stripe_session_id=eq.{session_id}",
            json=update_data,
            headers=_get_headers()
        )

        # ✅ MODIFIED: Specifically update the guest_users table if it's a guest session
        # This ensures the guest's record moves from 'pending' to 'completed'
        if user_id and GuestService.is_guest(user_id):
            print(f"[Guest Payment] Updating guest status for: {user_id}")
            GuestService.save_payment(
                guest_id=user_id,
                plan_name=plan_name,
                stripe_session_id=session_id,
                amount=session.amount_total
            )

        if resp.status_code not in [200, 204]:
            print(f"❌ Supabase payment update failed: {resp.status_code} {resp.text}")
            return jsonify({"error": "Supabase update failed"}), 500

        return jsonify({"success": True})

    except Exception as e:
        print("❌ VERIFY PAYMENT CRASH:", str(e))
        return jsonify({"error": str(e)}), 500