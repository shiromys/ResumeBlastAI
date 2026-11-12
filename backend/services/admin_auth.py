# backend/services/admin_auth.py
"""
✅ NEW: real, server-side admin authentication.

Until now, every /api/admin/* route trusted the caller completely — the
only "is this an admin" check anywhere in the app was a Postgres RPC
(`check_is_admin`) called from the React frontend purely to decide
whether to RENDER the admin UI. The Flask backend never re-verified
anything, so anyone who found/guessed an admin URL could call
POST /api/admin/users/delete (or any other admin route) with zero
credentials at all.

This module is the real check. It reads the caller's Supabase Auth
access token (sent as `Authorization: Bearer <token>` by the frontend —
see frontend/src/services/adminApi.js), asks Supabase who that token
actually belongs to, and resolves that email to a role:

  - 'super_admin' — one of the two permanently hardcoded addresses
    below. These can never be revoked or removed through the app; only
    they can see/use the "Manage Admin Access" screen, and only they
    can grant or revoke everyone else's access.
  - 'admin'       — anyone a super admin has granted access to, via the
    admin_users table (see routes/admin.py's /api/admin/admin-users*
    endpoints). Revocable at any time by a super admin.
  - None          — anyone else. No admin route executes for them.

SUPER_ADMIN_EMAILS is intentionally a Python constant, not a database
row: a super admin must always be able to get back in and grant/fix
admin access even if the admin_users table is empty, broken, or
mid-migration.
"""
import os
from functools import wraps

import requests
from flask import jsonify, request

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

# ✅ Permanently hardcoded super admins — see module docstring for why
# this lives in code, not in a database table. Keep lowercase; all
# comparisons below lowercase the incoming email first.
SUPER_ADMIN_EMAILS = {
    'shuchitha@shiroapps.com',
    'srikanth@shirotechnologies.com',
}


def _resolve_email_from_token(access_token):
    """
    Verifies a Supabase Auth access token and returns the email it
    belongs to, or None if it's missing/invalid/expired. Uses Supabase's
    own /auth/v1/user endpoint rather than decoding the JWT locally, so
    there's no separate signing secret this backend has to keep in sync.
    """
    if not access_token:
        return None
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                'Authorization': f'Bearer {access_token}',
                'apikey': SUPABASE_KEY,
            },
            timeout=8,
        )
        if resp.status_code != 200:
            return None
        email = (resp.json() or {}).get('email') or ''
        return email.strip().lower() or None
    except Exception as e:
        print(f"⚠️ [AdminAuth] token verification error: {e}")
        return None


def _granted_admin_role(email):
    """
    Looks up `email` in the admin_users table. Returns 'admin' if there's
    an active (non-revoked) row, else None. Deliberately never returns
    'super_admin' — that role only ever comes from SUPER_ADMIN_EMAILS
    above, no matter what ends up in this table.
    """
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/admin_users"
            f"?email=eq.{email}&revoked=eq.false&select=email&limit=1",
            headers={
                'apikey': SUPABASE_KEY,
                'Authorization': f'Bearer {SUPABASE_KEY}',
                'Accept': 'application/json',
            },
            timeout=8,
        )
        if resp.status_code == 200 and resp.json():
            return 'admin'
        return None
    except Exception as e:
        print(f"⚠️ [AdminAuth] admin_users lookup error: {e}")
        return None


def get_requesting_admin(req):
    """
    Resolves a Flask request's bearer token to {'email', 'role'}, or
    None if the caller isn't an admin at all (including: no token, an
    invalid/expired token, or a valid token for a real but non-admin
    user). `role` is always exactly 'super_admin' or 'admin'.
    """
    auth_header = req.headers.get('Authorization', '')
    token = auth_header[7:].strip() if auth_header.lower().startswith('bearer ') else ''
    email = _resolve_email_from_token(token)
    if not email:
        return None

    if email in SUPER_ADMIN_EMAILS:
        return {'email': email, 'role': 'super_admin'}

    granted = _granted_admin_role(email)
    if granted:
        return {'email': email, 'role': granted}

    return None


def admin_required(min_role='admin'):
    """
    Route-level decorator for admin-only endpoints that live OUTSIDE
    admin_bp (which instead guards itself in bulk via a
    @admin_bp.before_request hook — see routes/admin.py). Use this on
    any individual route in another blueprint that should be
    admin-restricted, e.g. the duplicate /api/admin/users/delete in
    user_management.py or /api/recruiter-activity/admin/all.

    Pass min_role='super_admin' to require a permanent super admin
    specifically rather than any granted admin.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)
            admin = get_requesting_admin(request)
            if not admin:
                return jsonify({'success': False, 'error': 'Admin authentication required'}), 401
            if min_role == 'super_admin' and admin.get('role') != 'super_admin':
                return jsonify({'success': False, 'error': 'Super admin access required'}), 403
            request.admin = admin
            return fn(*args, **kwargs)
        return wrapper
    return decorator