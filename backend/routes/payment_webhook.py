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
    
    # ✅ FIX: Safely fallback to {} if the payload explicitly sends `null`
    metadata     = session.get("metadata") or {}
    customer     = session.get("customer_details") or {}
    
    amount_total = session.get("amount_total", 0)           # cents
    currency     = session.get("currency", "usd")
    payment_status = session.get("payment_status", "")

    plan_name    = metadata.get("plan") or metadata.get("plan_name", "")
    user_id      = metadata.get("user_id", "")
    guest_id     = metadata.get("guest_id", "")

    # ── Determine the customer email ────────────────────────────────────────
    customer_email = customer.get("email", "")
    customer_name  = customer.get("name", "")

    # Fallback: fetch email from Supabase if we have user_id
    if not customer_email and user_id:
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

    # ── Save payment record to Supabase ─────────────────────────────────────
    payment_record = {
        "stripe_session_id": session_id,
        "user_id":           user_id if user_id else None,
        "guest_id":          guest_id if guest_id else None,
        "plan_name":         plan_name,
        "amount":            amount_total,
        "currency":          currency,
        "status":            "completed",
        "customer_email":    customer_email,
        "customer_name":     customer_name,
        "completed_at":      datetime.utcnow().isoformat(),
    }

    try:
        existing = requests.get(
            f"{SUPABASE_URL}/rest/v1/payments?stripe_session_id=eq.{session_id}&select=id",
            headers=_headers()
        )
        
        if existing.status_code == 200 and existing.json():
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/payments?stripe_session_id=eq.{session_id}",
                json=payment_record,
                headers=_headers()
            )
            print(f"[Webhook] Payment record updated for session {session_id}")
        else:
            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/payments",
                json=payment_record,
                headers=_headers()
            )
            if resp.status_code in [200, 201]:
                print(f"[Webhook] Payment record saved (new insert)")
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
        # Returning 500 forces Stripe to retry. If we don't want retries on bad code, return 200.
        # But generally, 500 is correct for server errors so we don't drop the transaction entirely.
        return jsonify({"error": "Internal processing error"}), 500

    return jsonify({"received": True}), 200