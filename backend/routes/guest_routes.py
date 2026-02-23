# backend/routes/guest_routes.py
from flask import Blueprint, request, jsonify
import os
import stripe
from services.guest_service import GuestService

guest_bp = Blueprint('guest', __name__, url_prefix='/api/guest')

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


@guest_bp.route('/<guest_id>', methods=['GET'])
def get_session(guest_id):
    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    row = GuestService.get(guest_id)
    if row:
        return jsonify({'success': True, 'data': row}), 200
    return jsonify({'success': False, 'error': 'Guest not found'}), 404