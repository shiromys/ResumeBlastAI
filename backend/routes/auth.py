# backend/routes/auth.py
from flask import Blueprint, request, jsonify
import os
import requests

auth_bp = Blueprint('auth', __name__)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

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
        # Query the deleted_users table
        url = f"{SUPABASE_URL}/rest/v1/deleted_users?email=eq.{email}"
        
        response = requests.get(url, headers=_get_headers(), timeout=5)
        
        if response.status_code == 200:
            results = response.json()
            if results and len(results) > 0:
                # User found in deleted_users table
                blacklist_entry = results[0]
                reason = blacklist_entry.get('reason', 'Account suspended')
                print(f"🚫 Blacklisted user attempt: {email} - Reason: {reason}")
                return True, reason
        
        return False, None
        
    except Exception as e:
        print(f"⚠️ Error checking blacklist: {e}")
        # If DB check fails, we usually fail open (allow), 
        # but you can change to True if you want strict security on errors.
        return False, None

@auth_bp.route('/api/auth/check-blacklist', methods=['POST'])
def check_blacklist():
    """
    Check if a user email is blacklisted before allowing signup/login.
    This is the main gatekeeper.
    """
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
                # ✅ EXACT MESSAGE REQUESTED
                'message': "For the signup/login contact support"
            }), 200 # Returning 200 with success:False so frontend handles it gracefully
        
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
                # ✅ EXACT MESSAGE REQUESTED
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
                # ✅ EXACT MESSAGE REQUESTED
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
                # ✅ EXACT MESSAGE REQUESTED
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
    return jsonify({
        'success': True,
        'message': 'Auth API is online'
    }), 200