from flask import Blueprint, request, jsonify
import os
import requests
from urllib.parse import quote

profile_bp = Blueprint('profile', __name__, url_prefix='/api/user')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')


def _read_headers():
    """For read operations (GET)."""
    return {
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Accept':        'application/json',
    }


def _write_headers():
    """For write operations (PATCH)."""
    return {
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
    }


# Fields the user is allowed to edit. Email is intentionally excluded (immutable).
PROFILE_FIELDS = ['first_name', 'last_name', 'phone', 'primary_skills']

# All four required for a profile to count as complete.
REQUIRED_FOR_COMPLETE = ['first_name', 'last_name', 'phone', 'primary_skills']


def _is_complete(row):
    """A profile is complete only when all required fields are non-empty."""
    return all((row.get(f) or '').strip() for f in REQUIRED_FOR_COMPLETE)


@profile_bp.route('/profile', methods=['GET'])
def get_profile():
    """
    Load the logged-in user's profile by email.
    Usage: GET /api/user/profile?email=someone@example.com
    """
    try:
        email = (request.args.get('email') or '').strip().lower()
        if not email:
            return jsonify({'success': False, 'error': 'email is required'}), 400

        url = (
            f"{SUPABASE_URL}/rest/v1/users"
            f"?email=eq.{quote(email)}"
            f"&select=id,email,first_name,last_name,phone,primary_skills,profile_completed"
        )
        resp = requests.get(url, headers=_read_headers(), timeout=8)

        if resp.status_code != 200:
            return jsonify({'success': False, 'error': f'lookup failed ({resp.status_code})'}), 500

        rows = resp.json()
        if not rows:
            return jsonify({'success': False, 'error': 'user not found'}), 404

        return jsonify({'success': True, 'profile': rows[0]}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@profile_bp.route('/profile', methods=['PATCH'])
def update_profile():
    """
    Save the logged-in user's profile fields.
    Email is never updatable here (immutability guard).
    Recomputes profile_completed automatically.
    Body: { email, first_name, last_name, phone, primary_skills }
    """
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        if not email:
            return jsonify({'success': False, 'error': 'email is required'}), 400

        # Build update payload ONLY from allowed fields — email can never be changed.
        payload = {}
        for f in PROFILE_FIELDS:
            if f in data:
                val = data.get(f)
                payload[f] = val.strip() if isinstance(val, str) else val

        if not payload:
            return jsonify({'success': False, 'error': 'no editable fields provided'}), 400

        # Fetch current row so we can compute completeness on the merged result.
        get_url = (
            f"{SUPABASE_URL}/rest/v1/users"
            f"?email=eq.{quote(email)}"
            f"&select=first_name,last_name,phone,primary_skills"
        )
        cur = requests.get(get_url, headers=_read_headers(), timeout=8)
        if cur.status_code != 200 or not cur.json():
            return jsonify({'success': False, 'error': 'user not found'}), 404

        merged = {**cur.json()[0], **payload}
        payload['profile_completed'] = _is_complete(merged)

        patch_url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{quote(email)}"
        upd = requests.patch(patch_url, headers=_write_headers(), json=payload, timeout=8)

        if upd.status_code not in (200, 204):
            return jsonify({'success': False, 'error': f'update failed ({upd.status_code})'}), 500

        updated = upd.json()[0] if upd.text and upd.json() else merged
        return jsonify({
            'success': True,
            'profile_completed': payload['profile_completed'],
            'profile': updated,
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500