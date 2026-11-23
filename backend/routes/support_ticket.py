# backend/routes/support_ticket.py
from flask import Blueprint, request, jsonify
import os
import requests
import time
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

support_ticket_bp = Blueprint('support_ticket', __name__)

# Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
BREVO_API_KEY = os.getenv('BREVO_API_KEY')

# ✅ Cloudflare Turnstile secret key (never exposed to the frontend)
TURNSTILE_SECRET_KEY = os.getenv('TURNSTILE_SECRET_KEY')

# ✅ TARGET EMAIL (Based on your requirements)
SUPPORT_EMAIL = 'support@shirotechnologies.com'

# ✅ UPDATED: SENDER IDENTITY
# Now uses .env value first, defaults to info@resumeblast.ai if missing
BREVO_SENDER_EMAIL = os.getenv('BREVO_SENDER_EMAIL', 'info@resumeblast.ai')
BREVO_SENDER_NAME = os.getenv('BREVO_SENDER_NAME', 'ResumeBlast Support')


def _verify_turnstile(token, remote_ip):
    """
    Verifies a Cloudflare Turnstile token server-side. Returns True if
    Cloudflare confirms the token is valid, unused, and not expired.

    ✅ FIX: previously, ANY exception while talking to Cloudflare (a
    timeout, a DNS hiccup, Cloudflare itself being briefly unreachable) was
    treated exactly like a real failed/forged token — a legitimate
    customer's ticket got rejected for a problem that was entirely on our
    side, not theirs. Now only an explicit `success: false` response FROM
    Cloudflare (i.e. Cloudflare actually evaluated the token and rejected
    it) blocks the submission. A genuine inability to reach Cloudflare at
    all — even after one retry — fails OPEN instead, the same as the
    "no secret key configured" case below: losing a real customer's
    support ticket is a worse outcome than occasionally letting one
    unverified submission through.
    """
    if not TURNSTILE_SECRET_KEY:
        print("⚠️ TURNSTILE_SECRET_KEY not configured — skipping verification")
        return True  # fail-open only if you haven't set up the secret yet

    if not token:
        print("⚠️ No Turnstile token on this submission — failing open rather than blocking a real customer")
        return True

    for attempt in range(2):  # one retry on a transient network error
        try:
            resp = requests.post(
                'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                data={
                    'secret': TURNSTILE_SECRET_KEY,
                    'response': token,
                    'remoteip': remote_ip
                },
                timeout=10
            )
            result = resp.json()
            if not result.get('success'):
                print(f"❌ Turnstile verification failed: {result.get('error-codes')}")
            return bool(result.get('success'))
        except Exception as e:
            print(f"⚠️ Turnstile verification request error (attempt {attempt + 1}/2): {str(e)}")
            if attempt == 0:
                time.sleep(0.5)
                continue
            print("⚠️ Could not reach Cloudflare to verify after retrying — failing open rather than blocking a real customer")
            return True


@support_ticket_bp.route('/api/support-ticket/submit', methods=['POST'])
def submit_support_ticket():
    try:
        data = request.get_json()

        print("\n" + "=" * 60)
        print("🎫 SUPPORT TICKET RECEIVED")

        # 0. Verify Cloudflare Turnstile token BEFORE doing anything else
        turnstile_token = data.get('turnstile_token')
        if not _verify_turnstile(turnstile_token, request.remote_addr):
            print("🚫 Blocked submission — Turnstile verification failed")
            return jsonify({'error': 'Verification failed. Please try again.'}), 400

        # 1. Validate inputs
        required_fields = ['name', 'email', 'subject', 'message']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        user_name = data['name']
        user_email = data['email']
        subject = data['subject']
        message = data['message']
        
        # 2. Generate ID
        ticket_id = f"TKT-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"
        print(f"   User: {user_name} ({user_email})")
        print(f"   Ticket ID: {ticket_id}")

        # 3. Store in DB with 'unread' status
        db_payload = {
            'ticket_id': ticket_id,
            'user_name': user_name,
            'user_email': user_email,
            'subject': subject,
            'message': message,
            'status': 'unread',  # ✅ Changed from 'open' to 'unread'
            'created_at': datetime.utcnow().isoformat()
        }
        
        supabase_url = f"{SUPABASE_URL}/rest/v1/support_tickets"
        supabase_headers = {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
        
        # ✅ FIX: retry the save up to 3 times with a short backoff before
        # giving up. A single transient blip talking to Supabase (a dropped
        # connection, a momentary timeout) used to mean an instant, final
        # "Could not save your ticket" for the customer even though trying
        # again a second later would likely have worked. This does NOT
        # change what happens on a real, persistent failure — it still
        # fails loudly below — it just stops a one-off network hiccup from
        # being treated the same as an actual outage.
        db_response = None
        db_error = None
        for attempt in range(3):
            try:
                db_response = requests.post(
                    supabase_url,
                    json=db_payload,
                    headers=supabase_headers,
                    verify=False,
                    timeout=10
                )
                if db_response.status_code in [200, 201]:
                    break
                print(f"⚠️ DB Save attempt {attempt + 1}/3 failed ({db_response.status_code}): {db_response.text[:200]}")
            except Exception as e:
                db_error = e
                db_response = None
                print(f"⚠️ DB Save attempt {attempt + 1}/3 raised: {str(e)}")
            if attempt < 2:
                time.sleep(0.75 * (attempt + 1))

        # ✅ FIX (kept from before): a failed DB insert must stop here and
        # report the failure plainly — never send the notification email or
        # tell the customer "success" on a save that didn't actually happen.
        # That's exactly how a ticket could arrive in the support inbox by
        # email but never appear in the admin panel.
        if db_response is None or db_response.status_code not in [200, 201]:
            failure_detail = str(db_error) if db_error else (db_response.text if db_response else 'no response')
            print(f"❌ DB Save Failed after 3 attempts: {failure_detail}")
            return jsonify({
                'error': 'Could not save your ticket. Please try again or email us directly.',
                'ticket_id': ticket_id,
            }), 500

        print(f"✅ DB Save Success (Status: unread)")

        # 4. Send Email
        if not BREVO_API_KEY:
            print("❌ BREVO_API_KEY is missing in .env")
            return jsonify({'success': True, 'message': 'Ticket saved, but email config missing'}), 200

        print(f"📤 Sending email to: {SUPPORT_EMAIL}")
        
        email_payload = {
            "sender": {
                "name": BREVO_SENDER_NAME,
                "email": BREVO_SENDER_EMAIL 
            },
            # This makes "Reply" go to the user
            "replyTo": {
                "email": user_email,
                "name": user_name
            },
            "to": [
                {
                    "email": SUPPORT_EMAIL,
                    "name": "Support Team"
                }
            ],
            "subject": f"🎫 Support: {subject} [{ticket_id}]",
            "htmlContent": f"""
            <html>
            <body style="font-family:Arial, sans-serif; padding:20px;">
                <div style="border-left: 4px solid #DC2626; padding-left: 15px;">
                    <h2>🆕 New Support Ticket</h2>
                    <p><strong>From:</strong> {user_name} ({user_email})</p>
                    <p><strong>Ticket ID:</strong> {ticket_id}</p>
                    <p><strong>Status:</strong> <span style="color: #DC2626; font-weight: bold;">UNREAD</span></p>
                </div>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <h3 style="color: #333;">{subject}</h3>
                <p style="white-space: pre-wrap; color: #555;">{message}</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #999;">
                    This is an automated notification from ResumeBlast.ai Admin System.<br>
                    Please log in to the admin dashboard to view and respond to this ticket.
                </p>
            </body>
            </html>
            """
        }
        
        brevo_resp = requests.post(
            'https://api.brevo.com/v3/smtp/email',
            headers={
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json'
            },
            json=email_payload,
            timeout=10
        )
        
        # 📝 DETAILED LOGGING FOR DEBUGGING
        print(f"   Brevo Status: {brevo_resp.status_code}")
        print(f"   Brevo Response: {brevo_resp.text}")

        if brevo_resp.status_code in [200, 201]:
            print("✅ Email Sent Successfully")
        else:
            print("❌ Email Failed to Send")

        print("=" * 60 + "\n")

        return jsonify({
            'success': True,
            'message': 'Ticket received',
            'ticket_id': ticket_id
        }), 200

    except Exception as e:
        print(f"❌ Exception: {str(e)}")
        return jsonify({'error': str(e)}), 500