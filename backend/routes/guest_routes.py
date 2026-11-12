# backend/routes/guest_routes.py
from flask import Blueprint, request, jsonify
import os
import re
import requests
import stripe
import traceback
from datetime import datetime
from services.guest_service import GuestService

guest_bp = Blueprint('guest', __name__, url_prefix='/api/guest')

# ✅ NEW: used by /confirm-email below, which talks to the `payments` table
# directly (a different table than GuestService manages), so it gets its
# own small Supabase REST helper rather than going through GuestService.
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
_EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

def _supabase_headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
    }

def get_client_ip():
    forwarded_for = request.headers.get('X-Forwarded-For', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    real_ip = request.headers.get('X-Real-IP', '')
    if real_ip:
        return real_ip.strip()
    return request.remote_addr


@guest_bp.route('/init', methods=['POST'])
def init_session():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    ip = get_client_ip()
    print(f"[GuestRoute] /init  guest={guest_id}  ip={ip}")

    result = GuestService.init_session(guest_id, ip_address=ip)
    return jsonify(result), 200 if result['success'] else 500


@guest_bp.route('/log-activity', methods=['POST'])
def log_guest_activity():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')
    event_type = data.get('event_type', 'unknown')
    metadata = data.get('metadata', {})

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    result = GuestService.log_activity(guest_id, event_type, metadata)
    return jsonify(result), 200 if result['success'] else 500


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE: Payment success
# ✅ FIXED: If amount/plan_name not provided by frontend, fetches them from
# Stripe using the stripe_session_id so the DB is always fully populated.
# ─────────────────────────────────────────────────────────────────────────────
@guest_bp.route('/payment', methods=['POST'])
def save_payment():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    payment_data = data.get('payment_data', {})
    plan_name      = payment_data.get('plan_name', '')
    stripe_session = payment_data.get('stripe_session_id', '')
    amount_paid    = payment_data.get('amount_paid', 0)

    # ✅ FIX: If plan_name or amount missing, fetch them directly from Stripe
    # This handles the case where PaymentSuccessHandler sends minimal data
    if stripe_session and (not plan_name or not amount_paid):
        try:
            stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
            session = stripe.checkout.Session.retrieve(stripe_session)

            if not plan_name:
                plan_name = session.metadata.get('plan_name', 'basic')
                print(f"[GuestRoute] Fetched plan_name from Stripe: {plan_name}")

            if not amount_paid and session.amount_total:
                amount_paid = session.amount_total
                print(f"[GuestRoute] Fetched amount from Stripe: {amount_paid}")

        except Exception as e:
            print(f"[GuestRoute] ⚠️ Could not fetch Stripe session details: {e}")
            # Continue with whatever we have — don't fail the whole request

    ip = get_client_ip()
    print(f"[GuestRoute] /payment  guest={guest_id}  plan={plan_name}  amount={amount_paid}  session={stripe_session}  ip={ip}")

    if GuestService._exists(guest_id):
        GuestService._update_ip(guest_id, ip)

    result = GuestService.save_payment(
        guest_id,
        plan_name=plan_name,
        stripe_session_id=stripe_session,
        amount=amount_paid
    )
    return jsonify(result), 200 if result['success'] else 500


@guest_bp.route('/resume', methods=['POST'])
def save_resume():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    ip = get_client_ip()
    if GuestService._exists(guest_id):
        GuestService._update_ip(guest_id, ip)

    result = GuestService.save_resume(guest_id, data.get('resume_data', {}))
    return jsonify(result), 200 if result['success'] else 500


@guest_bp.route('/analysis', methods=['POST'])
def save_analysis():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    ip = get_client_ip()
    if GuestService._exists(guest_id):
        GuestService._update_ip(guest_id, ip)

    result = GuestService.save_analysis(guest_id, data.get('analysis_data', {}))
    return jsonify(result), 200 if result['success'] else 500


@guest_bp.route('/blast/start', methods=['POST'])
def blast_start():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    ip = get_client_ip()
    if GuestService._exists(guest_id):
        GuestService._update_ip(guest_id, ip)

    result = GuestService.save_blast_initiated(guest_id, data.get('blast_data', {}))
    return jsonify(result), 200 if result['success'] else 500


@guest_bp.route('/blast/complete', methods=['POST'])
def blast_complete():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    ip = get_client_ip()
    if GuestService._exists(guest_id):
        GuestService._update_ip(guest_id, ip)

    result = GuestService.save_blast_completed(guest_id, data.get('results', {}))
    return jsonify(result), 200 if result['success'] else 500


@guest_bp.route('/confirm-email', methods=['POST'])
def confirm_guest_email():
    """
    ✅ NEW: Called by GuestEmailGate.jsx right after a guest pays and before
    they're allowed to upload their resume. Stripe's checkout email field is
    pre-filled with a placeholder ('guest@resumeblast.ai' — see payment.py)
    that guests don't always bother editing, so this is the one point where
    we get their real email directly from them and save it onto their
    payments row via stripe_session_id (the only reliable match key for a
    guest row — guest_id never survives onto payments, see _safe_uuid in
    payment.py, so it is not usable as a lookup key here).
    """
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        stripe_session_id = (data.get('stripe_session_id') or '').strip()

        if not email or not _EMAIL_RE.match(email):
            return jsonify({'success': False, 'error': 'Enter a valid email address'}), 400

        if not stripe_session_id:
            return jsonify({'success': False, 'error': 'Missing checkout session reference'}), 400

        resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/payments?stripe_session_id=eq.{stripe_session_id}",
            json={'user_email': email},
            headers=_supabase_headers(),
            timeout=10
        )
        if resp.status_code not in (200, 201, 204):
            print(f"[GuestRoute] ❌ confirm-email patch failed: {resp.status_code} {resp.text}")
            return jsonify({'success': False, 'error': 'Could not save your email. Please try again.'}), 500

        print(f"[GuestRoute] ✅ Confirmed guest email {email} for session={stripe_session_id}")
        return jsonify({'success': True}), 200

    except Exception as e:
        print(f"[GuestRoute] ❌ confirm-email error: {e}")
        return jsonify({'success': False, 'error': 'Could not save your email. Please try again.'}), 500


@guest_bp.route('/session-email/<stripe_session_id>', methods=['GET'])
def get_session_email(stripe_session_id):
    """
    ✅ NEW: Read-only lookup of the real email captured at Stripe checkout
    for this session (payments.user_email). Now that Stripe Checkout itself
    collects a mandatory, editable email from guests (see payment.py — the
    'guest@resumeblast.ai' placeholder is no longer sent as customer_email),
    this replaces the old GuestEmailGate confirm-email step: the frontend
    calls this once, silently, right after a guest returns from payment, and
    carries the result forward (localStorage) to pre-fill/lock the email on
    the later "Complete Account Setup" step — no separate prompt needed.
    """
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/payments?stripe_session_id=eq.{stripe_session_id}&select=user_email&limit=1",
            headers=_supabase_headers(),
            timeout=10
        )
        rows = resp.json() if resp.status_code in (200, 206) else []
        email = (rows[0].get('user_email') if rows else '') or ''
        if email.strip().lower() == 'guest@resumeblast.ai':
            email = ''  # stale placeholder from before this fix — treat as unknown
        return jsonify({'success': True, 'email': email.strip()}), 200
    except Exception as e:
        print(f"[GuestRoute] ❌ session-email lookup error: {e}")
        return jsonify({'success': False, 'error': str(e), 'email': ''}), 200


@guest_bp.route('/complete-account', methods=['POST'])
def complete_guest_account():
    """
    ✅ NEW: Self-serve account setup shown to a guest right after their blast
    completes (ResumeAnalysis.jsx). Creates their real account using the
    SAME email already captured at Stripe checkout (sent here read-only —
    the frontend field is locked, matching the requirement that the paying
    email and the account email can never diverge) plus the name + password
    they choose, then immediately relinks their guest payment/campaign to
    this one user_id via GuestService.relink_to_user — the same helper the
    admin's "Convert" button uses. One email -> one account -> one user_id,
    always, so a guest can never end up with two identities later.
    """
    try:
        data       = request.get_json() or {}
        email      = (data.get('email') or '').strip().lower()
        first_name = (data.get('first_name') or '').strip()
        last_name  = (data.get('last_name') or '').strip()
        password   = data.get('password') or ''
        stripe_session_id = (data.get('stripe_session_id') or '').strip()

        if not email or not _EMAIL_RE.match(email):
            return jsonify({'success': False, 'error': 'A valid email is required'}), 400
        if not first_name:
            return jsonify({'success': False, 'error': 'First name is required'}), 400
        if len(password) < 8:
            return jsonify({'success': False, 'error': 'Password must be at least 8 characters'}), 400

        full_name = f"{first_name} {last_name}".strip()

        # One email -> one account. If this email already has one (e.g. the
        # guest retried setup, or an admin already converted them), don't
        # create a second Auth user — just relink to the existing one.
        existing = requests.get(
            f"{SUPABASE_URL}/rest/v1/users?email=ilike.{email}&select=id&limit=1",
            headers=_supabase_headers(),
            timeout=10
        )
        existing_rows = existing.json() if existing.status_code in (200, 206) else []

        if existing_rows:
            user_id = existing_rows[0]['id']
        else:
            create_resp = requests.post(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                json={
                    'email':         email,
                    'password':      password,
                    'email_confirm': True,
                    'user_metadata': {'full_name': full_name},
                },
                headers=_supabase_headers(),
                timeout=15
            )
            if create_resp.status_code not in (200, 201):
                print(f"[GuestRoute] ❌ complete-account auth create failed: "
                      f"{create_resp.status_code} {create_resp.text}")
                return jsonify({'success': False, 'error': 'Could not create your account. Please try again.'}), 502

            created = create_resp.json()
            user_id = created.get('id') or (created.get('user') or {}).get('id')
            if not user_id:
                return jsonify({'success': False, 'error': 'Account created but no user id was returned'}), 502

            # Same users-row shape the normal signup flow writes
            # (frontend/src/services/authService.js), so this account
            # behaves identically to a self-registered one.
            requests.post(
                f"{SUPABASE_URL}/rest/v1/users",
                json={
                    'id':         user_id,
                    'email':      email,
                    'full_name':  full_name,
                    'role':       'job_seeker',
                    'created_at': datetime.utcnow().isoformat(),
                },
                headers=_supabase_headers(),
                timeout=10
            )

        # One user_id everywhere — relink the guest's payment/campaign now,
        # immediately, rather than leaving it to a later admin action.
        GuestService.relink_to_user(email, user_id, stripe_session_id)

        return jsonify({'success': True, 'user_id': user_id}), 200

    except Exception as e:
        print(f"[GuestRoute] ❌ complete-account error: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Something went wrong completing your account.'}), 500


@guest_bp.route('/<guest_id>', methods=['GET'])
def get_session(guest_id):
    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    row = GuestService.get(guest_id)
    if row:
        return jsonify({'success': True, 'data': row}), 200
    return jsonify({'success': False, 'error': 'Guest not found'}), 404