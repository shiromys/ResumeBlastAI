# backend/routes/auth.py
from flask import Blueprint, request, jsonify
import os
import requests
import random
import time

auth_bp = Blueprint('auth', __name__)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
BREVO_API_KEY = os.getenv('BREVO_API_KEY')
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

# ─────────────────────────────────────────────
# In-memory store for password reset codes
# { email: { code: str, expires_at: float, used: bool } }
# ─────────────────────────────────────────────
_reset_codes = {}

def _get_headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    }

def is_user_blacklisted(email):
    """
    Check if user email is in the deleted_users table.
    Returns: (is_blacklisted: bool, reason: str)
    """
    try:
        email = email.lower().strip()
        url = f"{SUPABASE_URL}/rest/v1/deleted_users?email=eq.{email}"
        response = requests.get(url, headers=_get_headers(), timeout=5)
        if response.status_code == 200:
            results = response.json()
            if results and len(results) > 0:
                blacklist_entry = results[0]
                reason = blacklist_entry.get('reason', 'Account suspended')
                print(f"🚫 Blacklisted user attempt: {email} - Reason: {reason}")
                return True, reason
        return False, None
    except Exception as e:
        print(f"⚠️ Error checking blacklist: {e}")
        return False, None


# ─────────────────────────────────────────────
# Existing endpoints (unchanged)
# ─────────────────────────────────────────────

@auth_bp.route('/api/auth/check-blacklist', methods=['POST'])
def check_blacklist():
    """Check if a user email is blacklisted before allowing signup/login."""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        if not email:
            return jsonify({'success': False, 'error': 'Email is required'}), 400
        is_blacklisted_flag, reason = is_user_blacklisted(email)
        if is_blacklisted_flag:
            print(f"🚫 Blocking access for: {email}")
            return jsonify({
                'success': False,
                'is_blacklisted': True,
                'reason': reason,
                'message': "For the signup/login contact support"
            }), 200
        return jsonify({
            'success': True,
            'is_blacklisted': False,
            'message': 'Account is in good standing'
        }), 200
    except Exception as e:
        print(f"❌ Error checking blacklist: {e}")
        return jsonify({'success': False, 'error': 'Error checking account status'}), 500


@auth_bp.route('/api/auth/signup/validate', methods=['POST'])
def validate_signup():
    """Validate user email specifically for signup"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        if not email:
            return jsonify({'allowed': False, 'message': 'Email is required'}), 400
        is_blacklisted_flag, _ = is_user_blacklisted(email)
        if is_blacklisted_flag:
            return jsonify({
                'allowed': False,
                'is_blacklisted': True,
                'message': "For the signup/login contact support"
            }), 403
        return jsonify({'allowed': True, 'message': 'Email is eligible for signup'}), 200
    except Exception as e:
        print(f"❌ Error validating signup: {e}")
        return jsonify({'allowed': True, 'message': 'Validation check completed'}), 200


@auth_bp.route('/api/auth/login/validate', methods=['POST'])
def validate_login():
    """Validate user email specifically for login"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        if not email:
            return jsonify({'allowed': False, 'message': 'Email is required'}), 400
        is_blacklisted_flag, _ = is_user_blacklisted(email)
        if is_blacklisted_flag:
            return jsonify({
                'allowed': False,
                'is_blacklisted': True,
                'message': "For the signup/login contact support"
            }), 403
        return jsonify({'allowed': True, 'message': 'Login allowed'}), 200
    except Exception as e:
        print(f"❌ Error validating login: {e}")
        return jsonify({'allowed': True, 'message': 'Validation check completed'}), 200


@auth_bp.route('/api/auth/status', methods=['POST'])
def check_auth_status():
    """Double check status (used during session restoration)"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        if not email:
            return jsonify({'success': False, 'error': 'Email is required'}), 400
        is_blacklisted_flag, reason = is_user_blacklisted(email)
        if is_blacklisted_flag:
            return jsonify({
                'success': False,
                'is_blacklisted': True,
                'is_banned': True,
                'reason': reason,
                'message': "For the signup/login contact support"
            }), 403
        return jsonify({
            'success': True,
            'is_blacklisted': False,
            'is_banned': False,
            'message': 'Account status: Active'
        }), 200
    except Exception as e:
        print(f"❌ Error checking auth status: {e}")
        return jsonify({'success': False, 'error': 'Error checking account status'}), 500


@auth_bp.route('/api/auth/test', methods=['GET'])
def test_auth():
    return jsonify({'success': True, 'message': 'Auth API is online'}), 200


# ─────────────────────────────────────────────
# NEW: Forgot Password endpoints
# ─────────────────────────────────────────────

@auth_bp.route('/api/auth/send-reset-code', methods=['POST'])
def send_reset_code():
    """
    Generate a 6-digit reset code and send it to the user's email via Brevo.
    The code expires in 10 minutes.
    """
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()

        if not email:
            return jsonify({'success': False, 'error': 'Email is required'}), 400

        # ── Check that the user actually exists in Supabase auth ──
        # We query the users table; if they don't exist we still return a
        # generic success message (security: don't reveal account existence)
        url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{email}&select=id,email"
        resp = requests.get(url, headers=_get_headers(), timeout=5)
        user_exists = resp.status_code == 200 and len(resp.json()) > 0

        if user_exists:
            # Generate 6-digit code
            code = str(random.randint(100000, 999999))
            expires_at = time.time() + 600  # 10 minutes

            # Store in memory
            _reset_codes[email] = {
                'code': code,
                'expires_at': expires_at,
                'used': False
            }

            print(f"🔑 Reset code for {email}: {code}")

            # ── Send via Brevo transactional email ──
            brevo_payload = {
                "sender": {
                    "name": "ResumeBlast Support",
                    "email": "info@resumeblast.ai"
                },
                "to": [{"email": email}],
                "subject": "Your ResumeBlast Password Reset Code",
                "htmlContent": f"""
                <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9f9f9; border-radius: 8px;">
                  <h2 style="color: #1a1a2e; margin-bottom: 8px;">Password Reset Request</h2>
                  <p style="color: #555; font-size: 15px;">Use the verification code below to reset your ResumeBlast password. This code expires in <strong>10 minutes</strong>.</p>
                  <div style="background: #1a1a2e; color: #fff; font-size: 36px; font-weight: bold; letter-spacing: 10px; text-align: center; padding: 20px 32px; border-radius: 8px; margin: 24px 0;">
                    {code}
                  </div>
                  <p style="color: #888; font-size: 13px;">If you did not request a password reset, you can safely ignore this email.</p>
                  <p style="color: #888; font-size: 13px;">— The ResumeBlast Team</p>
                </div>
                """
            }

            brevo_resp = requests.post(
                'https://api.brevo.com/v3/smtp/email',
                json=brevo_payload,
                headers={
                    'api-key': BREVO_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout=10
            )

            if brevo_resp.status_code not in (200, 201):
                print(f"❌ Brevo error: {brevo_resp.status_code} {brevo_resp.text}")
                return jsonify({'success': False, 'error': 'Failed to send email. Please try again.'}), 500

            print(f"✅ Reset code email sent to {email}")

        # Always return success (security: don't reveal whether account exists)
        return jsonify({
            'success': True,
            'message': 'If an account with that email exists, a reset code has been sent.'
        }), 200

    except Exception as e:
        print(f"❌ Error sending reset code: {e}")
        return jsonify({'success': False, 'error': 'Failed to send reset code. Please try again.'}), 500


@auth_bp.route('/api/auth/verify-reset-code', methods=['POST'])
def verify_reset_code():
    """
    Verify the 6-digit reset code submitted by the user.
    Returns success/failure — does NOT reset the password here.
    Password update is done client-side via Supabase SDK after verification.
    """
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        code = data.get('code', '').strip()

        if not email or not code:
            return jsonify({'success': False, 'error': 'Email and code are required'}), 400

        entry = _reset_codes.get(email)

        if not entry:
            return jsonify({'success': False, 'error': 'No reset code found. Please request a new one.'}), 400

        if entry.get('used'):
            return jsonify({'success': False, 'error': 'This code has already been used.'}), 400

        if time.time() > entry['expires_at']:
            del _reset_codes[email]
            return jsonify({'success': False, 'error': 'Code has expired. Please request a new one.'}), 400

        if entry['code'] != code:
            return jsonify({'success': False, 'error': 'Invalid code. Please try again.'}), 400

        # Mark code as used so it cannot be reused
        _reset_codes[email]['used'] = True

        print(f"✅ Reset code verified for {email}")
        return jsonify({'success': True, 'message': 'Code verified successfully.'}), 200

    except Exception as e:
        print(f"❌ Error verifying reset code: {e}")
        return jsonify({'success': False, 'error': 'Verification failed. Please try again.'}), 500


@auth_bp.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """
    Update the user's password via Supabase Admin API.
    Only callable after the reset code has been verified (used=True in _reset_codes).
    """
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        new_password = data.get('new_password', '').strip()

        if not email or not new_password:
            return jsonify({'success': False, 'error': 'Email and new password are required'}), 400

        if len(new_password) < 6:
            return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400

        # Security gate: only allow if code was verified (entry exists and is marked used)
        entry = _reset_codes.get(email)
        if not entry or not entry.get('used'):
            return jsonify({'success': False, 'error': 'Please verify your reset code first.'}), 403

        # ── Look up the user's UUID from Supabase ──
        user_url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{email}&select=id"
        user_resp = requests.get(user_url, headers=_get_headers(), timeout=5)

        if user_resp.status_code != 200 or not user_resp.json():
            return jsonify({'success': False, 'error': 'User not found.'}), 404

        user_id = user_resp.json()[0]['id']

        # ── Update password via Supabase Admin Auth API ──
        admin_url = f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
        admin_headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': 'application/json'
        }
        update_resp = requests.put(
            admin_url,
            json={'password': new_password},
            headers=admin_headers,
            timeout=10
        )

        if update_resp.status_code not in (200, 201):
            print(f"❌ Supabase admin password update failed: {update_resp.status_code} {update_resp.text}")
            return jsonify({'success': False, 'error': 'Failed to update password. Please try again.'}), 500

        # Clean up the used reset code entry
        del _reset_codes[email]

        print(f"✅ Password successfully reset for {email}")
        return jsonify({'success': True, 'message': 'Password updated successfully.'}), 200

    except Exception as e:
        print(f"❌ Error resetting password: {e}")
        return jsonify({'success': False, 'error': 'Failed to reset password. Please try again.'}), 500