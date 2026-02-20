# backend/routes/guest_routes.py
from flask import Blueprint, request, jsonify
from services.guest_service import GuestService

guest_bp = Blueprint('guest', __name__, url_prefix='/api/guest')


def get_client_ip():
    """
    Extract the real client IP from request headers.
    Handles Railway / Nginx / Cloudflare proxy chains via X-Forwarded-For.
    Frontend never sends IP — backend reads it here automatically.
    """
    forwarded_for = request.headers.get('X-Forwarded-For', '')
    if forwarded_for:
        # "client, proxy1, proxy2" — first entry is the real client
        return forwarded_for.split(',')[0].strip()

    real_ip = request.headers.get('X-Real-IP', '')
    if real_ip:
        return real_ip.strip()

    return request.remote_addr   # direct connection fallback


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE: Session init
# Called when a guest first lands on the app (before or at plan selection).
# Creates a fresh row for a brand-new guest_id.
# For returning guests (same localStorage ID) it increments visit_count only.
# IP is captured here and stored — frontend never sends it.
# ─────────────────────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE: Payment success  ← THIS WAS THE MISSING ROUTE
#
# Called by BlastConfig.jsx after Stripe redirects back with
#   ?payment=success&session_id=cs_live_xxx
#
# Saves: plan_name, payment_status='completed',
#        stripe_session_id, amount_paid
# Also logs 'payment_completed' event to activity_log array.
#
# Payload expected:
# {
#   "guest_id": "guest_xxx",
#   "payment_data": {
#     "plan_name": "basic",
#     "stripe_session_id": "cs_live_xxx",
#     "amount_paid": 999          ← price in cents
#   }
# }
# ─────────────────────────────────────────────────────────────────────────────
@guest_bp.route('/payment', methods=['POST'])
def save_payment():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    payment_data = data.get('payment_data', {})
    plan_name        = payment_data.get('plan_name', '')
    stripe_session   = payment_data.get('stripe_session_id', '')
    amount_paid      = payment_data.get('amount_paid', 0)

    ip = get_client_ip()
    print(f"[GuestRoute] /payment  guest={guest_id}  plan={plan_name}  session={stripe_session}  ip={ip}")

    # Update IP whenever guest interacts
    if GuestService._exists(guest_id):
        GuestService._update_ip(guest_id, ip)

    result = GuestService.save_payment(
        guest_id,
        plan_name=plan_name,
        stripe_session_id=stripe_session,
        amount=amount_paid
    )
    return jsonify(result), 200 if result['success'] else 500


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE: Resume upload
# Called after file upload + text extraction completes.
# Saves: file_name, file_url, file_size, file_type, extracted_text,
#        resume_status='uploaded'
# Also appends a compact record to resume_history JSONB array
# so every upload across all visits is preserved.
# ─────────────────────────────────────────────────────────────────────────────
@guest_bp.route('/resume', methods=['POST'])
def save_resume():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    ip = get_client_ip()
    print(f"[GuestRoute] /resume  guest={guest_id}  ip={ip}")

    if GuestService._exists(guest_id):
        GuestService._update_ip(guest_id, ip)

    result = GuestService.save_resume(guest_id, data.get('resume_data', {}))
    return jsonify(result), 200 if result['success'] else 500


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE: Resume analysis
# Called after AI analysis completes and result is displayed.
# Saves full analysis_data JSONB blob + all extracted flat columns:
#   ats_score, detected_role, seniority_level, years_of_experience,
#   recommended_industry, education_summary, candidate_name,
#   candidate_email, candidate_phone, location, linkedin_url,
#   top_skills, total_skills_count, resume_status='analyzed'
# ─────────────────────────────────────────────────────────────────────────────
@guest_bp.route('/analysis', methods=['POST'])
def save_analysis():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    ip = get_client_ip()
    print(f"[GuestRoute] /analysis  guest={guest_id}  ip={ip}")

    if GuestService._exists(guest_id):
        GuestService._update_ip(guest_id, ip)

    result = GuestService.save_analysis(guest_id, data.get('analysis_data', {}))
    return jsonify(result), 200 if result['success'] else 500


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE: Blast initiated
# Called in BlastConfig just before triggerEmailBlast() is called.
# Saves: blast_status='initiated', blast_industry,
#        blast_recipients_count, blast_plan, blast_initiated_at
# ─────────────────────────────────────────────────────────────────────────────
@guest_bp.route('/blast/start', methods=['POST'])
def blast_start():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    ip = get_client_ip()
    print(f"[GuestRoute] /blast/start  guest={guest_id}  ip={ip}")

    if GuestService._exists(guest_id):
        GuestService._update_ip(guest_id, ip)

    result = GuestService.save_blast_initiated(guest_id, data.get('blast_data', {}))
    return jsonify(result), 200 if result['success'] else 500


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE: Blast completed
# Called after triggerEmailBlast() returns results.
# Saves: blast_status='completed', blast_results JSONB, blast_completed_at
# ─────────────────────────────────────────────────────────────────────────────
@guest_bp.route('/blast/complete', methods=['POST'])
def blast_complete():
    data = request.get_json() or {}
    guest_id = data.get('guest_id', '')

    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    ip = get_client_ip()
    print(f"[GuestRoute] /blast/complete  guest={guest_id}  ip={ip}")

    if GuestService._exists(guest_id):
        GuestService._update_ip(guest_id, ip)

    result = GuestService.save_blast_completed(guest_id, data.get('results', {}))
    return jsonify(result), 200 if result['success'] else 500


# ─────────────────────────────────────────────────────────────────────────────
# ROUTE: Read guest row (admin / debug use)
# ─────────────────────────────────────────────────────────────────────────────
@guest_bp.route('/<guest_id>', methods=['GET'])
def get_session(guest_id):
    if not GuestService.is_guest(guest_id):
        return jsonify({'success': False, 'error': 'Invalid guest_id'}), 400

    row = GuestService.get(guest_id)
    if row:
        return jsonify({'success': True, 'data': row}), 200
    return jsonify({'success': False, 'error': 'Guest not found'}), 404