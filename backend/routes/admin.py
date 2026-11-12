from flask import Blueprint, request, jsonify
import os
import requests
import secrets
from datetime import datetime, timedelta, timezone
import time
import traceback
from urllib.parse import quote
from services.user_service import UserService
from services.guest_service import GuestService  # ✅ NEW: shared relink_to_user — same logic the guest self-serve setup flow uses
from routes.auth import _send_reset_code_email  # ✅ NEW: reuse the existing Brevo-based reset-code flow for guest conversion
from services.admin_auth import get_requesting_admin, SUPER_ADMIN_EMAILS  # ✅ NEW: real server-side admin auth
import stripe  # ✅ NEW: invoice lookup + refunds, same lazy per-request api_key pattern as routes/payment.py
from services.invoice_email_service import InvoiceEmailService  # ✅ NEW: reuse the exact receipt template customers were emailed

admin_bp = Blueprint('admin', __name__)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
BREVO_WEBHOOK_SECRET = os.getenv('BREVO_WEBHOOK_SECRET')

# ─────────────────────────────────────────────────────────────────────────
# ✅ NEW: server-side admin authentication guard.
#
# This runs before EVERY route on this blueprint, present and future — a
# brand-new route added to this file tomorrow is admin-protected by
# default with zero extra code, which is the right default now that this
# panel has more than one person's login behind it. See
# services/admin_auth.py for exactly what counts as "admin."
#
# Three paths are deliberately exempt, even though they live under
# /api/admin for historical/misnaming reasons — they are NOT admin-only:
#   - /api/admin/recruiters/add   — called by ordinary recruiters'
#     self-signup (frontend/src/services/recruiterAuthService.js), not
#     by the admin panel.
#   - /api/admin/users/count      — called by the recruiter dashboard's
#     candidate-pool counter (recruiterAnalyticsService.js).
#   - /api/admin/resumes/all      — called by the same recruiter
#     dashboard for skills aggregation (recruiterAnalyticsService.js).
#   Locking these three down would break recruiter signup and the
#   recruiter dashboard for every recruiter, not just protect admin
#   data. The real fix is renaming them off the /api/admin prefix
#   entirely — out of scope for this change, flagged here so it isn't
#   mistaken for an oversight.
#   - /api/admin/whoami           — must be callable by ANY logged-in
#     user, admin or not: it's how the frontend asks "am I an admin at
#     all," so it can't itself require already being one.
# ─────────────────────────────────────────────────────────────────────────
_PUBLIC_ADMIN_PATHS = {
    '/api/admin/recruiters/add',
    '/api/admin/users/count',
    '/api/admin/resumes/all',
    '/api/admin/whoami',
}


@admin_bp.before_request
def _require_admin_auth():
    if request.method == 'OPTIONS':
        return None  # let CORS preflight through untouched
    if request.path in _PUBLIC_ADMIN_PATHS:
        return None
    admin = get_requesting_admin(request)
    if not admin:
        return jsonify({'success': False, 'error': 'Admin authentication required'}), 401
    request.admin = admin  # available to any route below, e.g. for audit fields like granted_by
    return None


def _require_super_admin():
    """Returns the resolved admin dict if the caller is a super admin, else None."""
    admin = getattr(request, 'admin', None)
    if admin and admin.get('role') == 'super_admin':
        return admin
    return None

# ✅ RESTORED: used as the reply-to address on admin→customer ticket replies,
# so if the customer hits "Reply" in their inbox it lands back in the support
# inbox rather than the no-reply sender address. Same address support_ticket.py
# already notifies on new tickets. (This constant and the /reply endpoints
# below were accidentally dropped in the "guest users alert system" commit —
# that round was built from a stale local copy of this file that predated
# them — restoring them here, unrelated to anything else in this file.)
SUPPORT_EMAIL = 'support@shirotechnologies.com'

# ── CHANGE 1: split into write headers and read headers ──────────────────────
def _get_headers():
    """For write operations (POST / PATCH / DELETE)."""
    return {
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
    }

def _read_headers():
    """For read operations (GET) — Accept:application/json required by PostgREST."""
    return {
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Accept':        'application/json',
    }

# ── CHANGE 2: use _read_headers() inside get_all_rows ────────────────────────
def get_all_rows(table, query=''):
    """
    Standard query parameter pagination to prevent timeouts and fetch all real-time data.
    """
    try:
        all_results = []
        offset = 0
        limit = 1000
        
        while True:
            base_url = f"{SUPABASE_URL}/rest/v1/{table}"
            params = []
            if query:
                params = [p for p in query.split('&') if not p.startswith('limit=') and not p.startswith('offset=')]
            
            params.append(f"limit={limit}")
            params.append(f"offset={offset}")
            url = base_url + "?" + "&".join(params)
            
            resp = requests.get(url, headers=_read_headers())
            
            if resp.status_code in [200, 206]:
                data = resp.json()
                if not isinstance(data, list):
                    print(f"[Admin] get_all_rows unexpected response for {table}: {type(data)} — {str(data)[:200]}")
                    break
                if len(data) == 0:
                    break
                all_results.extend(data)
                
                if len(data) < limit:
                    break
                offset += limit
            else:
                print(f"[Admin] get_all_rows failed for {table}: {resp.status_code} — {resp.text[:200]}")
                break
                
        return all_results
    except Exception as e:
        traceback.print_exc()
        return []

# =========================================================
# 1. REVENUE ANALYTICS
# =========================================================
@admin_bp.route('/api/admin/revenue', methods=['GET'])
def get_revenue():
    try:
        start_date_str = request.args.get('start_date')
        end_date_str   = request.args.get('end_date')

        all_payments = []
        offset = 0
        limit  = 1000
        while True:
            url = (
                f"{SUPABASE_URL}/rest/v1/payments"
                f"?select=id,amount,status,created_at,initiated_at,"
                f"completed_at,refund_amount,user_email,"
                f"payment_intent_id,plan_name"
                f"&limit={limit}&offset={offset}"
            )
            resp = requests.get(url, headers=_read_headers(), timeout=15)
            print(f"[Revenue] Supabase GET status={resp.status_code} offset={offset}")
            if resp.status_code not in [200, 206]:
                print(f"[Revenue] ERROR: {resp.status_code} {resp.text[:300]}")
                break
            batch = resp.json()
            if not isinstance(batch, list):
                print(f"[Revenue] Unexpected type: {type(batch)} {str(batch)[:200]}")
                break
            all_payments.extend(batch)
            print(f"[Revenue] Batch {len(batch)}, total {len(all_payments)}")
            if len(batch) < limit:
                break
            offset += limit
        print(f"[Revenue] Total rows: {len(all_payments)}")

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        seven_days_ago = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)

        def safe_float(val):
            try: 
                return float(val) if val is not None else 0.0
            except: 
                return 0.0

        def parse_date(date_str):
            if not date_str: 
                return None
            try: 
                if isinstance(date_str, (int, float)) or (isinstance(date_str, str) and date_str.replace('.','',1).isdigit()):
                    return datetime.fromtimestamp(float(date_str), tz=timezone.utc)
                date_str = str(date_str).replace('Z', '+00:00')
                dt = datetime.fromisoformat(date_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except: 
                return None

        def best_date(p):
            return (
                parse_date(p.get('initiated_at'))
                or parse_date(p.get('completed_at'))
                or parse_date(p.get('created_at'))
            )

        filtered_payments = all_payments
        if start_date_str and end_date_str:
            try:
                start_dt = datetime.strptime(start_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
                end_dt = datetime.strptime(end_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc) + timedelta(days=1)
                filtered_payments = [
                    p for p in all_payments 
                    if best_date(p) and start_dt <= best_date(p) < end_dt
                ]
            except Exception as e:
                print(f"[Revenue] Date filter error: {e}")

        valid_success = ['completed', 'paid', 'success', 'succeeded']
        
        completed = []
        for p in filtered_payments:
            status = (p.get('status') or '').lower()
            if status in valid_success:
                completed.append(p)
        
        failed = [p for p in filtered_payments if (p.get('status') or '').lower() in ['failed', 'error', 'canceled', 'cancelled']]
        refunded = [p for p in filtered_payments if (p.get('status') or '').lower() == 'refunded']

        print(f"[Revenue] completed={len(completed)} failed={len(failed)} refunded={len(refunded)}")

        total_revenue = sum(safe_float(p.get('amount')) for p in completed) / 100
        
        today_payments = [
            p for p in all_payments 
            if (p.get('status') or '').lower() in valid_success 
            and best_date(p)
            and best_date(p) >= today_start
        ]
        today_revenue = sum(safe_float(p.get('amount')) for p in today_payments) / 100

        last_7_payments = [
            p for p in all_payments 
            if (p.get('status') or '').lower() in valid_success 
            and best_date(p)
            and best_date(p) >= seven_days_ago
        ]
        last_7_revenue = sum(safe_float(p.get('amount')) for p in last_7_payments) / 100

        daily_breakdown = []
        for i in range(7):
            day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            
            day_payments_list = [
                p for p in all_payments 
                if (p.get('status') or '').lower() in valid_success 
                and best_date(p)
                and day_start <= best_date(p) < day_end
            ]
            
            daily_breakdown.append({
                'date': day_start.isoformat(),
                'revenue': round(sum(safe_float(p.get('amount')) for p in day_payments_list) / 100, 2),
                'transactions': len(day_payments_list)
            })
        
        daily_breakdown.reverse()

        return jsonify({
            'total_revenue': round(total_revenue, 2),
            'transactions': len(completed),
            'today_revenue': round(today_revenue, 2),
            'today_transactions': len(today_payments),
            'last_7_days_revenue': round(last_7_revenue, 2),
            'daily_breakdown': daily_breakdown,
            'failed_payments': {
                'count': len(failed),
                'amount': round(sum(safe_float(p.get('amount')) for p in failed) / 100, 2),
                'payments': failed[:20]
            },
            'refunded_payments': {
                'count': len(refunded),
                'amount': round(sum(safe_float(p.get('refund_amount')) for p in refunded) / 100, 2),
                'payments': refunded[:20]
            }
        }), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =========================================================
# 2. DRIP CAMPAIGNS
# =========================================================

@admin_bp.route('/api/admin/drip-stats', methods=['GET'])
def get_drip_stats():
    user_id = request.args.get('user_id', '').strip()
    email = request.args.get('email', '').strip()
    
    if not user_id and not email:
        return jsonify({'error': 'user_id or email required'}), 400
        
    try:
        campaign = None
        
        if user_id:
            res = get_all_rows('blast_campaigns', f'id=eq.{user_id}')
            if res and str(res[0].get('status')).lower() != 'cancelled':
                campaign = res[0]
            
            if not campaign:
                res = get_all_rows('blast_campaigns', f'user_id=eq.{user_id}&order=created_at.desc')
                for c in res:
                    if str(c.get('status')).lower() != 'cancelled':
                        campaign = c
                        break
            
            if not campaign and not user_id.startswith('guest_'):
                res = get_all_rows('blast_campaigns', f'user_id=eq.guest_{user_id}&order=created_at.desc')
                for c in res:
                    if str(c.get('status')).lower() != 'cancelled':
                        campaign = c
                        break
        
        if not campaign and email:
            res = get_all_rows('blast_campaigns', f'candidate_email=eq.{email}&order=created_at.desc')
            for c in res:
                if str(c.get('status')).lower() != 'cancelled':
                    campaign = c
                    break
        
        if not campaign:
            return jsonify({'success': False, 'message': 'Campaign not found'}), 404
        
        campaign_id = campaign.get('id')
        
        d1 = int(campaign.get('drip_day1_delivered') or 0)
        d2 = int(campaign.get('drip_day2_delivered') or 0)
        d3 = int(campaign.get('drip_day3_delivered') or 0)
        
        total_recipients = campaign.get('recipients_count') or campaign.get('total_recruiters')
        
        if not total_recipients:
            plan_name = str(campaign.get('plan_name') or '').lower().strip()
            all_plans = get_all_rows('plans', 'select=key_name,display_name,recruiter_limit')
            
            matching_plan = None
            for p in all_plans:
                k_name = str(p.get('key_name') or '').lower().strip()
                d_name = str(p.get('display_name') or '').lower().strip()
                if plan_name == k_name or plan_name == d_name:
                    matching_plan = p
                    break
            
            total_recipients = matching_plan.get('recruiter_limit') if matching_plan else 0

        actual_status = campaign.get('status', 'unknown')

        return jsonify({
            'success': True,
            'data': {
                'id': campaign_id,
                'status': actual_status,
                'plan_name': campaign.get('plan_name'),
                'total_recipients': total_recipients,
                'total_sent': d1 + d2 + d3,
                'wave1_sent': d1,
                'wave2_sent': d2,
                'wave3_sent': d3,
                'resume_url': campaign.get('resume_url'),
                'last_activity': campaign.get('drip_day1_last_date'),
                'created_at': campaign.get('created_at'),
                'user_id': campaign.get('user_id'),
                'user_email': campaign.get('candidate_email'),
                'brevo_sync': True,
                'fetched_at': datetime.now(timezone.utc).isoformat()
            }
        }), 200
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/api/admin/drip-campaign/force-wave', methods=['POST'])
def force_drip_wave():
    data = request.json
    campaign_id = data.get('campaign_id', '').strip()
    target_wave = data.get('wave')

    if not campaign_id or target_wave not in [2, 3]:
        return jsonify({'error': 'Invalid params'}), 400

    try:
        url = f"{SUPABASE_URL}/rest/v1/blast_campaigns?id=eq.{campaign_id}&select=id"
        resp = requests.get(url, headers=_read_headers())
        if resp.status_code not in [200, 206] or len(resp.json()) == 0:
            return jsonify({'error': 'Campaign not found'}), 404
        
        now = datetime.now(timezone.utc).isoformat()
        
        if target_wave == 2:
            update_data = {'drip_day1_sent_at': now, 'day4_scheduled_for': now, 'status': 'in_progress'}
        else:
            update_data = {'drip_day2_sent_at': now, 'day8_scheduled_for': now, 'status': 'in_progress'}

        patch_resp = requests.patch(f"{SUPABASE_URL}/rest/v1/blast_campaigns?id=eq.{campaign_id}", json=update_data, headers=_get_headers())
        
        if patch_resp.status_code in [200, 204]: return jsonify({'success': True, 'message': f'Wave {target_wave} forced.'}), 200
        else: return jsonify({'error': f'Failed: {patch_resp.text}'}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =========================================================
# 3. BREVO LOGS ENDPOINTS
# =========================================================
@admin_bp.route('/api/admin/brevo-logs', methods=['GET'])
def get_brevo_logs():
    try:
        limit = min(int(request.args.get('limit', 100)), 1000)
        offset = int(request.args.get('offset', 0))
        event_type = request.args.get('event_type', '').strip()
        email_to = request.args.get('email_to', '').strip()
        start_date = request.args.get('start_date', '').strip()
        end_date = request.args.get('end_date', '').strip()
        campaign_id = request.args.get('campaign_id', '').strip()

        params = [("select", "*")]

        if event_type: params.append(("event_type", f"eq.{event_type}"))
        if email_to: params.append(("email_to", f"ilike.%{email_to}%"))
        if campaign_id: params.append(("campaign_id", f"eq.{campaign_id}"))

        def parse_frontend_date(date_str, is_end_date=False):
            if not date_str: 
                return None
            for fmt in ('%Y-%m-%d', '%d-%m-%Y', '%m-%d-%Y', '%Y/%m/%d'):
                try:
                    dt = datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
                    if is_end_date: 
                        dt += timedelta(days=1)
                    return dt.strftime('%Y-%m-%dT%H:%M:%SZ')
                except ValueError: 
                    pass
            return None

        formatted_start = parse_frontend_date(start_date, False)
        if formatted_start: 
            params.append(("timestamp", f"gte.{formatted_start}"))

        formatted_end = parse_frontend_date(end_date, True)
        if formatted_end: 
            params.append(("timestamp", f"lt.{formatted_end}"))

        params.append(("order", "timestamp.desc"))
        params.append(("limit", str(limit)))
        params.append(("offset", str(offset)))

        base_url = f"{SUPABASE_URL}/rest/v1/brevo_event_logs"
        resp = requests.get(base_url, headers=_read_headers(), params=params)

        if resp.status_code in [200, 206]:
            logs = resp.json()
            total = len(logs)
            content_range = resp.headers.get('content-range', '')
            if '/' in content_range:
                try: total = int(content_range.split('/')[-1])
                except: pass

            return jsonify({
                'success': True,
                'total': total,
                'limit': limit,
                'offset': offset,
                'logs': logs
            }), 200
        else:
            return jsonify({'success': False, 'error': f'Query failed: {resp.text}'}), resp.status_code

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/api/admin/brevo-logs/summary', methods=['GET'])
def get_brevo_logs_summary():
    try:
        days = int(request.args.get('days', 7))
        email_to = request.args.get('email_to', '').strip()

        now = datetime.now(timezone.utc)
        start_date = (now - timedelta(days=days))
        
        params = [
            ("select", "*"),
            ("timestamp", f"gte.{start_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"),
            ("order", "timestamp.desc"),
            ("limit", "5000")
        ]
        
        if email_to: params.append(("email_to", f"ilike.%{email_to}%"))

        url = f"{SUPABASE_URL}/rest/v1/brevo_event_logs"
        resp = requests.get(url, headers=_read_headers(), params=params)

        if resp.status_code not in [200, 206]:
            return jsonify({'success': False, 'error': 'Failed to fetch logs'}), 400

        logs = resp.json()

        event_breakdown = {}
        daily_breakdown = {}

        for log in logs:
            event_type = log.get('event_type', 'unknown')
            timestamp = log.get('timestamp', '')

            event_breakdown[event_type] = event_breakdown.get(event_type, 0) + 1

            if timestamp:
                try:
                    date_key = timestamp[:10]
                    if date_key not in daily_breakdown: daily_breakdown[date_key] = {}
                    daily_breakdown[date_key][event_type] = daily_breakdown[date_key].get(event_type, 0) + 1
                except: pass

        top_events_by_date = []
        for date_key in sorted(daily_breakdown.keys(), reverse=True):
            day_data = daily_breakdown[date_key]
            day_data['date'] = date_key
            day_data['total'] = sum(day_data.values()) - 1
            top_events_by_date.append(day_data)

        return jsonify({
            'success': True,
            'summary': {
                'total_events': len(logs),
                'event_breakdown': event_breakdown,
                'date_range': {
                    'start': start_date.strftime('%Y-%m-%d'), 
                    'end': now.strftime('%Y-%m-%d')
                },
                'top_events_by_date': top_events_by_date[:30]
            }
        }), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

# =========================================================
# 4. BREVO STATS
# =========================================================
@admin_bp.route('/api/admin/brevo-stats', methods=['GET'])
def get_brevo_stats():
    try:
        api_key = os.getenv('BREVO_API_KEY')
        if not api_key: return jsonify({'success': False, 'error': 'BREVO_API_KEY not configured.'}), 500

        brevo_headers = {'accept': 'application/json', 'api-key': api_key}
        account_resp = requests.get('https://api.brevo.com/v3/account', headers=brevo_headers, timeout=10)
        
        if account_resp.status_code != 200: return jsonify({'success': False, 'error': f"Brevo API error {account_resp.status_code}"}), 500

        account_data = account_resp.json()
        all_plans = account_data.get('plan', [])
        plan_info = (next((p for p in all_plans if p.get('type') == 'subscription'), None)
                    or next((p for p in all_plans if p.get('type') == 'payAsYouGo'), None)
                    or next((p for p in all_plans if p.get('type') == 'free'), None) or {})

        plan_type = plan_info.get('type', 'free')
        credits_left = plan_info.get('credits', 0)
        now_utc = datetime.now(timezone.utc)
        today_str = now_utc.strftime('%Y-%m-%d')
        month_start_str = now_utc.replace(day=1).strftime('%Y-%m-%d')

        daily_sent, monthly_sent = 0, 0
        try:
            day_stats_resp = requests.get('https://api.brevo.com/v3/smtp/statistics/aggregatedReport', headers=brevo_headers, params={'startDate': today_str, 'endDate': today_str}, timeout=10)
            if day_stats_resp.status_code == 200: daily_sent = day_stats_resp.json().get('requests', 0)
            month_stats_resp = requests.get('https://api.brevo.com/v3/smtp/statistics/aggregatedReport', headers=brevo_headers, params={'startDate': month_start_str, 'endDate': today_str}, timeout=10)
            if month_stats_resp.status_code == 200: monthly_sent = month_stats_resp.json().get('requests', 0)
        except: pass

        if plan_type == 'free':
            total_limit, credits_used, usage_label = 300, daily_sent, "today's free daily limit"
        else:
            total_limit, credits_used, usage_label = credits_left + monthly_sent, monthly_sent, "monthly plan limit"

        usage_percentage = round((credits_used / total_limit) * 100, 2) if total_limit > 0 else 0.0

        return jsonify({
            'success': True,
            'fetched_at': now_utc.strftime('%Y-%m-%d %H:%M:%S UTC'),
            'plan_details': {
                'type': plan_type, 'total_limit': total_limit, 'credits_remaining': credits_left,
                'credits_used': credits_used, 'usage_percent': usage_percentage,
                'usage_label': usage_label, 'trigger_alert': usage_percentage >= 75,
                'daily_sent': daily_sent, 'monthly_sent': monthly_sent,
                'purchase_date': plan_info.get('startDate') or account_data.get('createdAt', 'N/A'),
                'plan_end_date': plan_info.get('endDate') or 'N/A',
                'features': ["Transactional Email", "REST API Access", "Email Templates"]
            },
            'account_holder': f"{account_data.get('firstName', '')} {account_data.get('lastName', '')}".strip() or 'N/A',
            'account_email': account_data.get('email', 'N/A'),
            'company': account_data.get('companyName', 'N/A')
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/api/admin/users', methods=['GET'])
def get_users():
    try: return jsonify({'count': len(get_all_rows('users', 'select=*')), 'users': get_all_rows('users', 'select=*')}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/users/delete', methods=['POST'])
def delete_user():
    try:
        data = request.json
        if not data.get('email'): return jsonify({'success': False, 'error': 'Email is required'}), 400
        return jsonify({'success': True, 'message': f"User {data.get('email')} deleted", 'details': UserService.delete_user_data(email=data.get('email'), user_id=data.get('user_id'), reason=data.get('reason', 'Admin deletion'), deleted_by=data.get('admin_email', 'system'))}), 200
    except Exception as e: return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/api/admin/health', methods=['GET'])
def get_health():
    try:
        supabase_status = "Healthy"
        try:
            if requests.get(f"{SUPABASE_URL}/rest/v1/", headers=_read_headers(), timeout=5).status_code not in [200, 204, 206]: supabase_status = "Degraded"
        except: supabase_status = "Unreachable"
        return jsonify({'Database': supabase_status, 'Payments': "Configured" if os.getenv('STRIPE_SECRET_KEY') else "Missing", 'Email Service': "Configured" if (os.getenv('BREVO_API_KEY') or os.getenv('RESEND_API_KEY')) else "Missing", 'AI Service': "Configured" if os.getenv('ANTHROPIC_API_KEY') else "Missing", 'API': 'Online'}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/server-status', methods=['GET'])
def get_server_status():
    start_time = time.time()
    try:
        requests.get(f"{SUPABASE_URL}/rest/v1/", headers=_read_headers(), timeout=2)
        return jsonify({'uptime': 'Running', 'services': {'Database': {'status': 'Online', 'response_code': 200, 'latency': f"{round((time.time() - start_time) * 1000, 2)}ms"}, 'Server': {'status': 'Online', 'response_code': 200}}, 'configuration': {'Stripe': 'Set' if os.getenv('STRIPE_SECRET_KEY') else 'Missing', 'Supabase': 'Set' if os.getenv('SUPABASE_URL') else 'Missing', 'Anthropic': 'Set' if os.getenv('ANTHROPIC_API_KEY') else 'Missing'}}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/contact-submissions', methods=['GET'])
def get_contact_submissions():
    try:
        filter_status = request.args.get('filter', 'all')
        query = 'select=*'
        if filter_status == 'unread': query += '&status=eq.unread'
        elif filter_status == 'open': query += '&status=eq.open'
        elif filter_status == 'resolved': query += '&status=eq.resolved'
        return jsonify({'submissions': [{'id': sub.get('id'), 'name': sub.get('user_name'), 'email': sub.get('user_email'), 'subject': sub.get('subject'), 'message': sub.get('message'), 'status': sub.get('status', 'open'), 'submitted_at': sub.get('created_at'), 'ticket_id': sub.get('ticket_id'), 'admin_notes': sub.get('admin_notes', '')} for sub in get_all_rows('support_tickets', query)]}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/contact-submissions/unread-count', methods=['GET'])
def get_unread_count():
    try: return jsonify({'unread_count': len(get_all_rows('support_tickets', 'select=id&status=eq.unread'))}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/contact-submissions/<ticket_id>/mark-read', methods=['PATCH'])
def mark_contact_read(ticket_id):
    try:
        requests.patch(f"{SUPABASE_URL}/rest/v1/support_tickets?id=eq.{ticket_id}", json={'status': 'open'}, headers=_get_headers())
        return jsonify({'success': True}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/contact-submissions/<ticket_id>/resolve', methods=['PATCH'])
def toggle_resolve_status(ticket_id):
    try:
        new_status = request.json.get('status', 'resolved')
        if new_status not in ['open', 'resolved']: return jsonify({'error': 'Invalid status'}), 400
        response = requests.patch(f"{SUPABASE_URL}/rest/v1/support_tickets?id=eq.{ticket_id}", json={'status': new_status}, headers=_get_headers())
        if response.status_code in [200, 204]: return jsonify({'success': True, 'status': new_status}), 200
        else: return jsonify({'error': 'Failed to update status'}), 500
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/contact-submissions/<ticket_id>/notes', methods=['PATCH'])
def update_contact_notes(ticket_id):
    try:
        requests.patch(f"{SUPABASE_URL}/rest/v1/support_tickets?id=eq.{ticket_id}", json={'admin_notes': request.json.get('admin_notes')}, headers=_get_headers())
        return jsonify({'success': True}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

# ✅ RESTORED: reply to a support ticket from the admin panel itself.
# Reuses the existing Brevo setup exactly as-is — same BREVO_API_KEY /
# BREVO_SENDER_NAME / BREVO_SENDER_EMAIL env vars that support_ticket.py
# already uses for the "new ticket" notification, so no new email config
# is needed. The reply is emailed straight to the customer's address on
# file for that ticket, and also saved to a separate support_ticket_replies
# table (no FK to support_tickets, kept deliberately additive) purely so
# the admin panel can show reply history for a ticket.
@admin_bp.route('/api/admin/contact-submissions/<ticket_id>/reply', methods=['POST'])
def reply_to_contact_submission(ticket_id):
    try:
        body = request.json or {}
        message = (body.get('message') or '').strip()
        if not message:
            return jsonify({'error': 'Reply message is required'}), 400

        # Look up the ticket to get the customer's email/name/subject.
        lookup = requests.get(f"{SUPABASE_URL}/rest/v1/support_tickets?id=eq.{ticket_id}&select=*", headers=_read_headers())
        rows = lookup.json() if lookup.status_code in [200, 206] else []
        if not rows:
            return jsonify({'error': 'Ticket not found'}), 404
        ticket = rows[0]

        user_email = ticket.get('user_email')
        user_name = ticket.get('user_name') or 'there'
        subject = ticket.get('subject') or 'your support ticket'
        ref_id = ticket.get('ticket_id') or str(ticket_id)
        if not user_email:
            return jsonify({'error': 'This ticket has no customer email on file'}), 400

        brevo_api_key = os.getenv('BREVO_API_KEY')
        if not brevo_api_key:
            return jsonify({'error': 'BREVO_API_KEY is not configured'}), 500

        sender_name = os.getenv('BREVO_SENDER_NAME', 'ResumeBlast Support')
        sender_email = os.getenv('BREVO_SENDER_EMAIL', 'info@resumeblast.ai')
        admin_name = body.get('admin_name') or 'ResumeBlast Support Team'

        email_payload = {
            "sender": {"name": sender_name, "email": sender_email},
            "replyTo": {"email": SUPPORT_EMAIL, "name": "Support Team"},
            "to": [{"email": user_email, "name": user_name}],
            "subject": f"Re: {subject} [{ref_id}]",
            "htmlContent": f"""
            <html>
            <body style="font-family:Arial, sans-serif; padding:20px;">
                <p>Hi {user_name},</p>
                <p style="white-space: pre-wrap; color:#374151;">{message}</p>
                <hr style="border:0;border-top:1px solid #eee;margin:20px 0;">
                <p style="font-size:12px;color:#999;">
                    Ticket reference: {ref_id}<br>
                    &mdash; {admin_name}, ResumeBlast.ai Support
                </p>
            </body>
            </html>
            """
        }

        brevo_resp = requests.post(
            'https://api.brevo.com/v3/smtp/email',
            headers={'accept': 'application/json', 'api-key': brevo_api_key, 'content-type': 'application/json'},
            json=email_payload,
            timeout=10
        )
        if brevo_resp.status_code not in [200, 201]:
            print(f"[Admin] ❌ Reply email failed to send: {brevo_resp.status_code} — {brevo_resp.text}")
            return jsonify({'error': 'Failed to send reply email'}), 502

        # Best-effort history save — the reply has already been sent at this
        # point, so a failure here should not be reported as the reply failing.
        try:
            requests.post(
                f"{SUPABASE_URL}/rest/v1/support_ticket_replies",
                json={
                    'ticket_row_id': str(ticket_id),
                    'ticket_id': ref_id,
                    'admin_name': admin_name,
                    'message': message,
                    'created_at': datetime.now(timezone.utc).isoformat(),
                },
                headers=_get_headers()
            )
        except Exception:
            traceback.print_exc()

        return jsonify({'success': True}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/contact-submissions/<ticket_id>/replies', methods=['GET'])
def get_contact_submission_replies(ticket_id):
    """Reply history for a ticket (oldest first), for the admin panel's thread view."""
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/support_ticket_replies?ticket_row_id=eq.{ticket_id}&select=*&order=created_at.asc",
            headers=_read_headers()
        )
        rows = resp.json() if resp.status_code in [200, 206] else []
        return jsonify({'replies': rows}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/stats', methods=['GET'])
def get_stats():
    try:
        def safe_float(val):
            try: return float(val) if val is not None else 0.0
            except: return 0.0
        payments = get_all_rows('payments', 'select=amount,status')
        return jsonify({'total_users': len(get_all_rows('users', 'select=id')), 'active_users': len(get_all_rows('users', 'select=id&account_status=eq.active')), 'total_blasts': len(get_all_rows('blast_campaigns', 'select=id')), 'total_resume_uploads': len(get_all_rows('resumes', 'select=id')), 'total_revenue': round(sum(safe_float(p.get('amount')) for p in payments if (p.get('status') or '').lower() in ['completed', 'paid', 'success', 'succeeded']) / 100, 2)}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500


# =========================================================
# ✅ FIXED: get_recruiters_stats
# =========================================================
@admin_bp.route('/api/admin/recruiters/stats', methods=['GET'])
def get_recruiters_stats():
    try:
        # ✅ PERMANENT FIX: Use Supabase count=exact header to get the real row
        # count from the database without fetching all rows.
        #
        # ROOT CAUSE OF BUG:
        #   Old code used len(paid_res.json()) — Supabase REST API returns max
        #   1000 rows by default. With 1130 recruiters, len() always capped at
        #   1000. The admin panel showed 1000 instead of the real 1130 count.
        #
        # HOW THIS FIX WORKS:
        #   PostgREST returns the total count in the 'content-range' response
        #   header when 'Prefer: count=exact' is sent. We request limit=1 to
        #   avoid fetching rows — only the count header matters.
        #   This returns the exact DB row count regardless of table size,
        #   and will always stay accurate as recruiters are added/removed.
        count_headers = {**_read_headers(), 'Prefer': 'count=exact'}

        paid_res = requests.get(
            f"{SUPABASE_URL}/rest/v1/recruiters?select=id&limit=1",
            headers=count_headers
        )
        free_res = requests.get(
            f"{SUPABASE_URL}/rest/v1/freemium_recruiters?select=id&limit=1",
            headers=count_headers
        )

        def _extract_count(response):
            """Extract exact count from PostgREST content-range header.
            Format: '0-0/1130' — total count is the number after the slash.
            Falls back to len(json) if header is missing (safe for small tables).
            """
            if response.status_code in [200, 206]:
                content_range = response.headers.get('content-range', '')
                if '/' in content_range:
                    try:
                        return int(content_range.split('/')[-1])
                    except (ValueError, IndexError):
                        pass
                try:
                    return len(response.json())
                except Exception:
                    pass
            return 0

        paid_count = _extract_count(paid_res)
        free_count = _extract_count(free_res)

        return jsonify({
            'paid_count':     paid_count,
            'freemium_count': free_count,
            'total_count':    paid_count + free_count
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/recruiters/add', methods=['POST'])
def add_recruiter():
    try:
        data = request.json
        target_table = data.get('target_table')
        if target_table not in ['recruiters', 'freemium_recruiters', 'app_registered_recruiters']: return jsonify({'error': 'Invalid table'}), 400
        
        recruiter_data = {'email': data.get('email'), 'is_active': True, 'created_at': datetime.utcnow().isoformat()}
        if target_table == 'app_registered_recruiters': recruiter_data['id'] = data.get('id')
        else: recruiter_data['email_status'] = 'active'
        
        if target_table == 'freemium_recruiters': recruiter_data.update({'name': data.get('name'), 'company': data.get('company'), 'industry': data.get('industry', 'Technology'), 'location': data.get('location', 'Remote')})
        if not recruiter_data.get('email'): return jsonify({'error': 'Email required'}), 400
        
        resp = requests.post(f"{SUPABASE_URL}/rest/v1/{target_table}", json=recruiter_data, headers=_get_headers())
        if resp.status_code in [200, 201]: return jsonify({'success': True, 'message': 'Added'}), 200
        else: return jsonify({'error': f"Error: {resp.text}"}), 500
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/recruiters/delete', methods=['DELETE', 'POST'])
def delete_recruiter_by_email():
    try:
        data = request.json
        target_table = data.get('target_table')
        email = data.get('email')
        
        if not email or target_table not in ['recruiters', 'freemium_recruiters']: return jsonify({'error': 'Invalid data'}), 400
        requests.post(f"{SUPABASE_URL}/rest/v1/deleted_recruiters", json={'email': email, 'target_table': target_table, 'reason': data.get('reason'), 'deleted_by': data.get('admin_email', 'system'), 'deleted_at': datetime.utcnow().isoformat()}, headers=_get_headers())
        resp = requests.delete(f"{SUPABASE_URL}/rest/v1/{target_table}?email=eq.{email}", headers=_get_headers())
        
        if resp.status_code in [200, 204]: return jsonify({'success': True, 'message': 'Deleted'}), 200
        else: return jsonify({'error': f"Error: {resp.text}"}), 500
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/plans', methods=['GET'])
def get_plans():
    try: 
        resp = requests.get(f"{SUPABASE_URL}/rest/v1/plans?select=*", headers=_read_headers())
        return jsonify({'plans': resp.json() if resp.status_code in [200, 206] else []}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/plans/update', methods=['PATCH'])
def update_plan():
    try:
        data = request.json
        resp = requests.patch(f"{SUPABASE_URL}/rest/v1/plans?id=eq.{data.get('id')}", json={'price_cents': data.get('price_cents'), 'recruiter_limit': data.get('recruiter_limit'), 'display_name': data.get('display_name'), 'updated_at': datetime.utcnow().isoformat()}, headers=_get_headers())
        if resp.status_code in [200, 204]: return jsonify({'success': True}), 200
        else: return jsonify({'error': resp.text}), 500
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/resumes/all', methods=['GET'])
def get_all_resumes():
    try: return jsonify({'success': True, 'count': len(get_all_rows('resumes', 'select=*')), 'resumes': get_all_rows('resumes', 'select=*')}), 200
    except Exception as e: return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/api/admin/users/count', methods=['GET'])
def get_user_count():
    try: return jsonify({'success': True, 'total_users': len(get_all_rows('users', 'select=id'))}), 200
    except Exception as e: return jsonify({'success': False, 'error': str(e)}), 500

# =========================================================
# 4b. GUEST USER ALERTS + CONVERSION
# =========================================================
# ✅ NEW: Surfaces guests who completed a paid blast purchase but have no
# linked public.users account — payments.user_id is the signal: it's set
# whenever identity resolution (registered OR guest) succeeds, and left
# NULL whenever it doesn't, which is exactly the Kamyar/Tyiesha pattern
# from earlier support tickets. A row disappears from this list the moment
# it's converted (user_id gets set), so there's no separate "dismissed"
# flag to maintain.

# ✅ NEW: Stripe pre-fills a guest checkout's email field with this literal
# placeholder (see payment.py), and guests don't always bother editing it —
# so this exact string can end up stored as payments.user_email for real.
GUEST_EMAIL_PLACEHOLDER = 'guest@resumeblast.ai'

def _is_usable_email(email):
    return bool(email) and email.strip().lower() != GUEST_EMAIL_PLACEHOLDER

def _guest_payment_rows():
    """
    Completed payments with no linked user_id, newest first.
    ✅ FIX: when payments.user_email is missing or is the placeholder above,
    fall back to blast_campaigns.candidate_email for the same
    stripe_session_id — that's parsed directly from the guest's uploaded
    resume, so it's a real, reachable email even when Stripe's isn't.
    GuestEmailGate.jsx now asks guests to confirm a real email before they
    can upload at all, fixing this at the source going forward; this
    fallback is the safety net for anyone who bypassed that gate, or for
    older payments from before it existed. A row is only included if it has
    a usable email from either source — nothing to act on otherwise.
    """
    rows = get_all_rows('payments', 'select=*&status=eq.completed&user_id=is.null&order=completed_at.desc')

    needs_fallback_sessions = [
        r['stripe_session_id'] for r in rows
        if not _is_usable_email(r.get('user_email')) and r.get('stripe_session_id')
    ]

    fallback_emails = {}
    if needs_fallback_sessions:
        ids_filter = ','.join(needs_fallback_sessions)
        campaign_rows = get_all_rows(
            'blast_campaigns',
            f"select=stripe_session_id,candidate_email&stripe_session_id=in.({ids_filter})"
        )
        for c in campaign_rows:
            email = (c.get('candidate_email') or '').strip()
            sid = c.get('stripe_session_id')
            if email and sid and sid not in fallback_emails:
                fallback_emails[sid] = email

    result = []
    for r in rows:
        email = r.get('user_email') or ''
        used_fallback = False
        if not _is_usable_email(email):
            fallback = fallback_emails.get(r.get('stripe_session_id'))
            if not fallback:
                continue  # no usable email from either source
            email, used_fallback = fallback, True
        row = dict(r)
        row['_resolved_email'] = email
        row['_email_from_resume_fallback'] = used_fallback
        result.append(row)

    # ✅ FIX: a guest who later self-registers (frontend/src/services/authService.js
    # signUp) gets a brand-new users row, but that flow has no idea the same email
    # already has an orphaned, unlinked payment — it never touches payments.user_id.
    # Only the admin's "Convert" button (convert_guest_user above) does that relink.
    # So without this check, someone who signed up themselves after paying as a
    # guest would show up as "guest" forever, even though they're fully registered.
    # Filter out anyone whose resolved email already matches a real users row.
    if result:
        registered_emails = {
            (u.get('email') or '').strip().lower()
            for u in get_all_rows('users', 'select=email')
        }
        result = [r for r in result if r['_resolved_email'].strip().lower() not in registered_emails]

    return result

@admin_bp.route('/api/admin/guest-users', methods=['GET'])
def get_guest_users():
    try:
        return jsonify({'guests': [{
            'id':                 r.get('id'),
            'email':              r.get('_resolved_email'),
            'email_source':       'resume' if r.get('_email_from_resume_fallback') else 'payment',
            'name':               r.get('user_name'),
            'plan_name':          r.get('plan_name'),
            'amount':             r.get('amount'),
            'currency':           r.get('currency'),
            'completed_at':       r.get('completed_at'),
            'stripe_session_id':  r.get('stripe_session_id'),
            'is_guest_checkout':  bool(r.get('guest_id')),
        } for r in _guest_payment_rows()]}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/guest-users/count', methods=['GET'])
def get_guest_users_count():
    try: return jsonify({'count': len(_guest_payment_rows())}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/guest-users/convert', methods=['POST'])
def convert_guest_user():
    """
    Flexible by design, per spec:
      - If a public.users row already exists for this email, just relink
        the orphaned payments/blast_campaigns rows to it.
      - If none exists, create a new Supabase Auth account via the admin
        invite endpoint (this also emails the guest a link to set their
        own password and log in — same outcome as a normal signup, just
        admin-initiated), write the matching public.users row in the same
        shape the normal signup flow uses, then relink.
    """
    try:
        body = request.json or {}
        email = (body.get('email') or '').strip().lower()
        # ✅ NEW: the email shown in the Guest Users list can come from
        # blast_campaigns.candidate_email instead of payments.user_email (see
        # _guest_payment_rows' resume fallback above) — in that case
        # payments.user_email is still the 'guest@resumeblast.ai' placeholder,
        # so an email-only relink below would never find that payments row.
        # stripe_session_id is the one reliable, always-correct key for it.
        stripe_session_id = (body.get('stripe_session_id') or '').strip()
        if not email:
            return jsonify({'error': 'Email is required'}), 400

        # Best-effort name for the new account, from their payment record.
        # Looked up by stripe_session_id when we have it (exact match,
        # works even when user_email is the placeholder); falls back to an
        # email sweep otherwise.
        if stripe_session_id:
            pay_lookup = requests.get(
                f"{SUPABASE_URL}/rest/v1/payments?stripe_session_id=eq.{stripe_session_id}&select=user_name",
                headers=_read_headers()
            )
        else:
            pay_lookup = requests.get(
                f"{SUPABASE_URL}/rest/v1/payments?user_email=ilike.{email}&status=eq.completed&order=completed_at.desc&limit=1&select=user_name",
                headers=_read_headers()
            )
        pay_rows = pay_lookup.json() if pay_lookup.status_code in [200, 206] else []
        guest_name = (pay_rows[0].get('user_name') if pay_rows else None) or email.split('@')[0]

        # 1. Does an account already exist for this email?
        existing = requests.get(
            f"{SUPABASE_URL}/rest/v1/users?email=ilike.{email}&select=id&limit=1",
            headers=_read_headers()
        )
        existing_rows = existing.json() if existing.status_code in [200, 206] else []

        created_new = False
        invite_email_sent = False
        if existing_rows:
            user_id = existing_rows[0]['id']
        else:
            # ✅ Create the Auth account directly (no Supabase invite/magic-link
            # email — that's Supabase's own email system). A random throwaway
            # password is set since Supabase requires one on creation; the
            # guest never sees or needs it, because right below we send them
            # the app's own Brevo-based reset code instead, so they set their
            # own password through the exact same flow/UI normal users already
            # use for "Forgot Password".
            create_resp = requests.post(
                f"{SUPABASE_URL}/auth/v1/admin/users",
                json={
                    'email':         email,
                    'password':      secrets.token_urlsafe(24),
                    'email_confirm': True,
                    'user_metadata': {'full_name': guest_name},
                },
                headers=_get_headers()
            )
            if create_resp.status_code not in [200, 201]:
                print(f"[Admin] ❌ Guest account creation failed: {create_resp.status_code} — {create_resp.text}")
                return jsonify({'error': 'Failed to create an account for this guest', 'details': create_resp.text}), 502

            created = create_resp.json()
            user_id = created.get('id') or (created.get('user') or {}).get('id')
            if not user_id:
                return jsonify({'error': 'Account created but no user id was returned'}), 502

            # Same users-row shape the normal signup flow writes
            # (frontend/src/services/authService.js), so this account
            # behaves identically to a self-registered one.
            requests.post(
                f"{SUPABASE_URL}/rest/v1/users",
                json={
                    'id':          user_id,
                    'email':       email,
                    'full_name':   guest_name,
                    'role':        'job_seeker',
                    'created_at':  datetime.now(timezone.utc).isoformat(),
                },
                headers=_get_headers()
            )
            created_new = True

            # Send the "set your password" code via Brevo — same template/
            # sender the public Forgot Password flow already uses.
            invite_email_sent, email_err = _send_reset_code_email(email)
            if not invite_email_sent:
                print(f"[Admin] ⚠️ Guest account created but reset-code email failed: {email_err}")

        # 2. Relink any orphaned data to the (new or existing) user_id.
        # ✅ Shared with the guest's own self-serve "Complete Account Setup"
        # flow (GuestService.relink_to_user) so both conversion paths behave
        # identically — one email, one user_id, never left half-linked.
        GuestService.relink_to_user(email, user_id, stripe_session_id)

        return jsonify({
            'success':            True,
            'user_id':            user_id,
            'created_new_account': created_new,
            'invite_email_sent':  invite_email_sent,
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =========================================================
# 4c. USER DETAIL VIEW (admin panel — click a user, see everything)
# =========================================================
# ✅ NEW: aggregates one user's full history across users, blast_campaigns,
# payments, support_tickets (+ their reply threads), and — best-effort,
# since guest_users has no email column of its own — their pre-signup guest
# history. Full design notes: implementation-plan-admin-user-detail-view.md
# in the project.

def _dedupe_by_id(rows):
    seen = set()
    out = []
    for r in rows:
        rid = r.get('id')
        if rid in seen:
            continue
        seen.add(rid)
        out.append(r)
    return out

def _campaign_total_recipients(campaign, plans_cache):
    """Same recipients-count-with-plan-limit-fallback logic as /api/admin/drip-stats."""
    total = campaign.get('recipients_count') or campaign.get('total_recruiters')
    if total:
        return total
    plan_name = str(campaign.get('plan_name') or '').lower().strip()
    for p in plans_cache:
        k_name = str(p.get('key_name') or '').lower().strip()
        d_name = str(p.get('display_name') or '').lower().strip()
        if plan_name == k_name or plan_name == d_name:
            return p.get('recruiter_limit') or 0
    return 0

@admin_bp.route('/api/admin/users/<user_id>/details', methods=['GET'])
def get_user_details(user_id):
    try:
        users = get_all_rows('users', f'select=*&id=eq.{user_id}')
        if not users:
            return jsonify({'error': 'User not found'}), 404
        user = users[0]
        email = (user.get('email') or '').strip()

        # Campaigns — keyed by user_id directly, with a candidate_email
        # fallback for any older row a relink missed. Dedupe by id.
        # ✅ FIX: quote() the email — an unquoted '+' (common in aliased
        # addresses like name+tag@gmail.com) is read as a literal space by
        # the HTTP layer, silently breaking the match for that one user.
        campaign_rows = get_all_rows('blast_campaigns', f'select=*&user_id=eq.{user_id}')
        if email:
            campaign_rows += get_all_rows('blast_campaigns', f'select=*&candidate_email=ilike.{quote(email)}')
        campaign_rows = _dedupe_by_id(campaign_rows)
        campaign_rows.sort(key=lambda c: c.get('initiated_at') or c.get('created_at') or '', reverse=True)

        plans_cache = get_all_rows('plans', 'select=key_name,display_name,recruiter_limit') if campaign_rows else []
        campaigns = [{
            'id':                  c.get('id'),
            'plan_name':           c.get('plan_name'),
            'status':              c.get('status'),
            'job_role':            c.get('job_role'),
            'candidate_name':      c.get('candidate_name'),
            'total_recipients':    _campaign_total_recipients(c, plans_cache),
            'total_sent':          int(c.get('drip_day1_delivered') or 0) + int(c.get('drip_day2_delivered') or 0) + int(c.get('drip_day3_delivered') or 0),
            'drip_day1_delivered': bool(c.get('drip_day1_delivered')),
            'drip_day2_delivered': bool(c.get('drip_day2_delivered')),
            'drip_day3_delivered': bool(c.get('drip_day3_delivered')),
            'initiated_at':        c.get('initiated_at'),
            'completed_at':        c.get('completed_at'),
        } for c in campaign_rows]

        # Payments — user_id first, ilike-email fallback (skipping the
        # guest@resumeblast.ai Stripe placeholder), same pattern as the
        # guest-users view above.
        payment_rows = get_all_rows('payments', f'select=*&user_id=eq.{user_id}')
        if _is_usable_email(email):
            existing_ids = {p.get('id') for p in payment_rows}
            for p in get_all_rows('payments', f'select=*&user_email=ilike.{quote(email)}'):
                if p.get('id') not in existing_ids:
                    payment_rows.append(p)
        payment_rows.sort(key=lambda p: p.get('completed_at') or p.get('initiated_at') or '', reverse=True)

        payments = [{
            'id':             p.get('id'),
            'plan_name':      p.get('plan_name'),
            'amount':         p.get('amount'),
            'currency':       p.get('currency'),
            'status':         p.get('status'),
            'payment_method': p.get('payment_method'),
            'card_brand':     p.get('card_brand'),
            'card_last4':     p.get('card_last4'),
            'refund_amount':  p.get('refund_amount'),
            'completed_at':   p.get('completed_at'),
            'receipt_url':    p.get('receipt_url'),
        } for p in payment_rows]

        # Support tickets — matched by email (no user_id column on this
        # table today; see the implementation plan doc's backfill idea) —
        # each with its reply thread.
        tickets = []
        if email:
            ticket_rows = get_all_rows('support_tickets', f'select=*&user_email=ilike.{quote(email)}&order=created_at.desc')
            for t in ticket_rows:
                replies_resp = requests.get(
                    f"{SUPABASE_URL}/rest/v1/support_ticket_replies?ticket_row_id=eq.{t.get('id')}&select=*&order=created_at.asc",
                    headers=_read_headers()
                )
                replies = replies_resp.json() if replies_resp.status_code in [200, 206] else []
                tickets.append({
                    'id':         t.get('id'),
                    'ticket_id':  t.get('ticket_id'),
                    'subject':    t.get('subject'),
                    'message':    t.get('message'),
                    'status':     t.get('status'),
                    'created_at': t.get('created_at'),
                    'replies':    replies if isinstance(replies, list) else [],
                })

        # Guest pre-signup history — best-effort. guest_users has no email
        # column, so try any guest_id captured on a payment row first, then
        # fall back to its JSONB metadata.candidate_email field.
        guest_history = None
        guest_id_hint = next((p.get('guest_id') for p in payment_rows if p.get('guest_id')), None)
        if guest_id_hint:
            g = get_all_rows('guest_users', f'select=*&id=eq.{quote(guest_id_hint)}')
            guest_history = g[0] if g else None
        if not guest_history and email:
            g = get_all_rows('guest_users', f'select=*&metadata->>candidate_email=ilike.{quote(email)}')
            guest_history = g[0] if g else None

        notes_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/user_admin_notes?user_id=eq.{user_id}&select=*&order=created_at.desc",
            headers=_read_headers()
        )
        notes = notes_resp.json() if notes_resp.status_code in [200, 206] else []

        return jsonify({
            'user':             user,
            'campaigns':        campaigns,
            'payments':         payments,
            'support_tickets':  tickets,
            'guest_history':    guest_history,
            'admin_notes':      notes if isinstance(notes, list) else [],
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────
# ✅ NEW: Invoice, receipt, and refund — so a rep never has to open the
# Stripe dashboard or dig through Supabase for "can you resend my invoice"
# or "I need a refund" tickets. All three key off a payments.id (the same
# id already shown per-row in UserDetailDrawer's Payments tab).
# ─────────────────────────────────────────────────────────────────────────

def _get_payment_row(payment_id):
    rows = get_all_rows('payments', f'select=*&id=eq.{payment_id}')
    return rows[0] if rows else None


@admin_bp.route('/api/admin/payments/<payment_id>/invoice', methods=['GET'])
def get_payment_invoice(payment_id):
    """
    ✅ NEW: "the invoice sent from Stripe." Looks up the Checkout Session
    this payment came from and returns Stripe's own hosted invoice link
    and PDF link — Stripe generates both automatically because
    routes/payment.py's create_checkout_session() already passes
    invoice_creation={"enabled": True}. Nothing is stored locally; this
    always asks Stripe live, so it's correct even if the invoice's status
    changes later (e.g. after a refund). Sessions created before that
    invoice_creation flag existed simply have no invoice — reported as
    such, not as an error.
    """
    try:
        payment = _get_payment_row(payment_id)
        if not payment:
            return jsonify({'success': False, 'error': 'Payment not found'}), 404

        session_id = payment.get('stripe_session_id')
        if not session_id:
            return jsonify({'success': True, 'available': False, 'reason': 'No Stripe checkout session on record for this payment'}), 200

        stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
        session = stripe.checkout.Session.retrieve(session_id, expand=['invoice'])
        invoice = session.invoice
        if not invoice:
            return jsonify({'success': True, 'available': False, 'reason': 'Stripe has no invoice for this checkout session'}), 200

        return jsonify({
            'success':          True,
            'available':        True,
            'hosted_invoice_url': invoice.hosted_invoice_url,
            'invoice_pdf':       invoice.invoice_pdf,
            'invoice_number':   invoice.number,
        }), 200

    except stripe.error.StripeError as e:
        print(f"⚠️ [Admin] Stripe error fetching invoice for payment {payment_id}: {e}")
        return jsonify({'success': False, 'error': f'Stripe error: {str(e)}'}), 502
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@admin_bp.route('/api/admin/payments/<payment_id>/receipt', methods=['GET'])
def get_payment_receipt(payment_id):
    """
    ✅ NEW: "the receipt sent from the application" — i.e. the Brevo email
    built by InvoiceEmailService.send_payment_receipt() after a successful
    payment. Renders the exact same template (via the new
    InvoiceEmailService.build_receipt_html() — see that file) using this
    payment row's own stored data, so what a rep sees here is guaranteed
    to match what the customer actually received, not a re-approximation
    of it. Returns raw HTML (not JSON) so the frontend can open it as a
    real page in a new tab — see adminFetch + Blob handling in
    UserDetailDrawer.jsx, since a plain window.open() can't carry the
    Authorization header this route requires.
    """
    try:
        payment = _get_payment_row(payment_id)
        if not payment:
            return jsonify({'success': False, 'error': 'Payment not found'}), 404

        recipient_email = payment.get('user_email') or ''
        recipient_name = payment.get('user_name') or ''
        svc = InvoiceEmailService()
        html = svc.build_receipt_html(
            recipient_name=recipient_name,
            recipient_email=recipient_email or 'customer@resumeblast.ai',
            amount_cents=payment.get('amount') or 0,
            currency=payment.get('currency') or 'usd',
            plan_name=payment.get('plan_name') or '',
            stripe_session_id=payment.get('stripe_session_id') or '',
            payment_date=(payment.get('completed_at') or '')[:10] or None,
        )
        return html, 200, {'Content-Type': 'text/html; charset=utf-8'}

    except Exception as e:
        traceback.print_exc()
        return f"<p>Failed to render receipt: {e}</p>", 500, {'Content-Type': 'text/html; charset=utf-8'}


@admin_bp.route('/api/admin/payments/<payment_id>/refund', methods=['POST'])
def refund_payment(payment_id):
    """
    ✅ NEW: issues a real Stripe refund so a rep never has to be given
    Stripe dashboard access just to process "I want a refund" tickets.
    Full refund only (no partial-amount UI yet — the common case here is
    "refund the whole purchase," and a partial refund can still be done
    in Stripe directly if ever needed). Updates the payments row so the
    Payments tab immediately reflects it without a page reload.
    """
    try:
        payment = _get_payment_row(payment_id)
        if not payment:
            return jsonify({'success': False, 'error': 'Payment not found'}), 404

        if payment.get('status') == 'refunded':
            return jsonify({'success': False, 'error': 'This payment has already been refunded'}), 400

        payment_intent_id = payment.get('payment_intent_id')
        if not payment_intent_id:
            return jsonify({'success': False, 'error': 'No Stripe payment_intent on record for this payment — cannot refund automatically'}), 400

        stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
        refund = stripe.Refund.create(payment_intent=payment_intent_id)

        # Only touching columns already confirmed to exist elsewhere in this
        # file (status, refund_amount) — not guessing at a refunded_at
        # column this sandbox has no way to verify against the live schema.
        update_resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/payments?id=eq.{payment_id}",
            json={
                'status':         'refunded',
                'refund_amount':  payment.get('amount'),
            },
            headers=_get_headers(), timeout=10
        )
        if update_resp.status_code not in (200, 204):
            # Stripe already refunded the money — surface this loudly rather
            # than silently leaving the DB row out of sync with reality.
            print(f"⚠️ [Admin] Refund succeeded in Stripe ({refund.id}) but updating payments row failed: {update_resp.status_code} {update_resp.text}")
            return jsonify({'success': True, 'refund_id': refund.id, 'warning': 'Refunded in Stripe, but the local record may not have updated — refresh to confirm'}), 200

        admin = getattr(request, 'admin', None)
        print(f"✅ [Admin] {admin['email'] if admin else 'unknown'} refunded payment {payment_id} (Stripe refund {refund.id})")
        return jsonify({'success': True, 'refund_id': refund.id}), 200

    except stripe.error.StripeError as e:
        print(f"⚠️ [Admin] Stripe error refunding payment {payment_id}: {e}")
        return jsonify({'success': False, 'error': f'Stripe error: {str(e)}'}), 502
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@admin_bp.route('/api/admin/users/<user_id>/dashboard-view', methods=['GET'])
def get_user_dashboard_view(user_id):
    """
    ✅ NEW: backs "View as this user" in UserDetailDrawer.jsx. Returns the
    same latest-campaign data UserDashboard.jsx itself would show, fetched
    with the service-role key — the real UserDashboard.jsx talks to
    Supabase directly with the ANON key under the SIGNED-IN USER's own
    RLS policy, which only lets someone read their own rows, so simply
    reusing that component's data-fetching for an arbitrary user_id from
    the admin's own session would just come back empty. This endpoint
    exists so "view as user" can get real data without faking a login as
    them. UserDashboard.jsx itself is completely untouched by this —
    AdminViewAsUser.jsx is a separate, read-only component that renders
    this data.
    """
    try:
        rows = get_all_rows('blast_campaigns', f'select=*&user_id=eq.{user_id}&order=created_at.desc&limit=1')
        return jsonify({'success': True, 'blast': rows[0] if rows else None}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@admin_bp.route('/api/admin/users/<user_id>/ban', methods=['POST'])
def ban_user_route(user_id):
    try:
        reason = ((request.json or {}).get('reason') or '').strip() or 'Admin action'
        UserService.ban_user(user_id, reason)
        return jsonify({'success': True}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@admin_bp.route('/api/admin/users/<user_id>/unban', methods=['POST'])
def unban_user_route(user_id):
    try:
        UserService.unban_user(user_id)
        return jsonify({'success': True}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@admin_bp.route('/api/admin/users/<user_id>/send-reset-code', methods=['POST'])
def send_reset_code_route(user_id):
    try:
        users = get_all_rows('users', f'select=email&id=eq.{user_id}')
        if not users or not users[0].get('email'):
            return jsonify({'success': False, 'error': 'No email on file for this user'}), 400
        ok, err = _send_reset_code_email(users[0]['email'])
        if not ok:
            return jsonify({'success': False, 'error': err}), 500
        return jsonify({'success': True}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@admin_bp.route('/api/admin/users/<user_id>/notes', methods=['POST'])
def add_user_note(user_id):
    try:
        body = request.json or {}
        message = (body.get('message') or '').strip()
        if not message:
            return jsonify({'success': False, 'error': 'Note message is required'}), 400
        admin_name = body.get('admin_name') or 'Admin'
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/user_admin_notes",
            json={
                'user_id':    user_id,
                'admin_name': admin_name,
                'message':    message,
                'created_at': datetime.now(timezone.utc).isoformat(),
            },
            headers=_get_headers()
        )
        if resp.status_code not in [200, 201]:
            return jsonify({'success': False, 'error': 'Failed to save note'}), 500
        resp_json = resp.json() if resp.text else []
        return jsonify({'success': True, 'note': resp_json[0] if resp_json else None}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# =========================================================
# 5. APP REGISTERED RECRUITERS
# =========================================================

@admin_bp.route('/api/admin/app-registered-recruiters/pending-count', methods=['GET'])
def get_pending_recruiters_count():
    try:
        res = requests.get(
            f"{SUPABASE_URL}/rest/v1/app_registered_recruiters?select=id,status",
            headers=_read_headers()
        )
        
        if res.status_code in [200, 206]:
            data = res.json()
            count = sum(1 for r in data if r.get('status') != 'added')
            return jsonify({'pending_count': count}), 200
            
        return jsonify({'pending_count': 0}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@admin_bp.route('/api/admin/app-registered-recruiters', methods=['GET'])
def get_app_registered_recruiters():
    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/app_registered_recruiters?select=*&order=created_at.desc",
            headers=_read_headers()
        )
        if response.status_code in [200, 206]:
            return jsonify({"success": True, "data": response.json()}), 200
            
        return jsonify({"success": False, "error": response.text}), response.status_code
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route('/api/admin/app-registered-recruiters/<string:recruiter_id>/approve', methods=['POST'])
def approve_app_registered_recruiter(recruiter_id):
    try:
        rec_response = requests.get(
            f"{SUPABASE_URL}/rest/v1/app_registered_recruiters?id=eq.{recruiter_id}&select=*",
            headers=_read_headers()
        )
        if rec_response.status_code not in [200, 206] or not rec_response.json():
            return jsonify({"success": False, "error": "Recruiter not found"}), 404
            
        recruiter = rec_response.json()[0]
        email = recruiter.get('work_email') or recruiter.get('email')
        
        if not email:
            return jsonify({"success": False, "error": "No email found for this recruiter"}), 400

        existing_response = requests.get(
            f"{SUPABASE_URL}/rest/v1/recruiters?email=eq.{email}&select=*",
            headers=_read_headers()
        )
        if existing_response.status_code in [200, 206] and existing_response.json():
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/app_registered_recruiters?id=eq.{recruiter_id}",
                json={'status': 'added'},
                headers=_get_headers()
            )
            return jsonify({"success": True, "message": "Recruiter already exists. Status updated."}), 200
             
        new_recruiter = {
            'email': email,
            'is_active': True,
            'email_status': 'active',
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        insert_response = requests.post(
            f"{SUPABASE_URL}/rest/v1/recruiters",
            json=new_recruiter,
            headers=_get_headers()
        )
        
        if insert_response.status_code not in [200, 201, 204]:
            return jsonify({"success": False, "error": f"Failed to add to recruiters: {insert_response.text}"}), 500
        
        update_response = requests.patch(
            f"{SUPABASE_URL}/rest/v1/app_registered_recruiters?id=eq.{recruiter_id}",
            json={'status': 'added'},
            headers=_get_headers()
        )
        
        if update_response.status_code in [200, 204]:
            return jsonify({"success": True, "message": "Recruiter approved and added successfully"}), 200
        else:
            return jsonify({"success": False, "error": "Added recruiter, but failed to update status. Have you added the 'status' column to the database?"}), 500
            
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

# =========================================================
# PROFILE MANAGEMENT (admin safety net)
# =========================================================
def _classify_user_type(user_id, paid_user_ids, resume_user_ids, email=None, paid_emails=None):
    """paid > analyzed-only > signup-only. Paid matches by user_id OR email."""
    email_l = (email or '').strip().lower()
    if user_id in paid_user_ids or (paid_emails and email_l in paid_emails):
        return 'paid'
    if user_id in resume_user_ids:
        return 'analyzed-only'
    return 'signup-only'


@admin_bp.route('/api/admin/profiles/incomplete', methods=['GET'])
def get_incomplete_profiles():
    """
    List users whose profile is not complete, each classified as
    paid / analyzed-only / signup-only, with their latest campaign status.
    """
    try:
        # Users missing a complete profile
        users = get_all_rows(
            'users',
            'profile_completed=eq.false&select=id,email,first_name,last_name,phone,primary_skills,created_at'
        )

        # Build lookup sets for classification
        campaigns = get_all_rows('blast_campaigns', 'select=user_id,status,created_at')
        payments = get_all_rows('payments', "status=eq.completed&select=user_id,user_email")
        resumes = get_all_rows('resumes', 'select=user_id')

        # PAID = has a COMPLETED payment. Many guest payments have NULL user_id
        # and are linked only by user_email, so match on BOTH.
        paid_ids = {p.get('user_id') for p in payments if p.get('user_id')}
        paid_emails = {(p.get('user_email') or '').strip().lower()
                       for p in payments if p.get('user_email')}
        paid_emails.discard('guest@resumeblast.ai')  # placeholder, not a real user
        resume_ids = {r.get('user_id') for r in resumes if r.get('user_id')}

        # latest campaign status per user
        latest_status = {}
        for c in campaigns:
            uid = c.get('user_id')
            if not uid:
                continue
            if uid not in latest_status or (c.get('created_at') or '') > latest_status[uid][1]:
                latest_status[uid] = (c.get('status'), c.get('created_at') or '')

        result = []
        for u in users:
            uid = u.get('id')
            result.append({
                'id': uid,
                'email': u.get('email'),
                'first_name': u.get('first_name'),
                'last_name': u.get('last_name'),
                'phone': u.get('phone'),
                'primary_skills': u.get('primary_skills'),
                'user_type': _classify_user_type(uid, paid_ids, resume_ids, u.get('email'), paid_emails),
                'campaign_status': latest_status.get(uid, (None,))[0],
                'created_at': u.get('created_at'),
            })

        # Sort: paid first, then analyzed-only, then signup-only
        order = {'paid': 0, 'analyzed-only': 1, 'signup-only': 2}
        result.sort(key=lambda r: order.get(r['user_type'], 3))

        counts = {
            'total': len(result),
            'paid': sum(1 for r in result if r['user_type'] == 'paid'),
            'analyzed_only': sum(1 for r in result if r['user_type'] == 'analyzed-only'),
            'signup_only': sum(1 for r in result if r['user_type'] == 'signup-only'),
        }

        return jsonify({'success': True, 'counts': counts, 'users': result}), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@admin_bp.route('/api/admin/profiles/create', methods=['POST'])
def admin_create_profile():
    """
    Admin manually fills a user's profile (email stays locked/unchanged).
    Body: { email, first_name, last_name, phone, primary_skills }
    """
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        if not email:
            return jsonify({'success': False, 'error': 'email is required'}), 400

        allowed = ['first_name', 'last_name', 'phone', 'primary_skills']
        payload = {}
        for f in allowed:
            if f in data:
                val = data.get(f)
                payload[f] = val.strip() if isinstance(val, str) else val

        if not payload:
            return jsonify({'success': False, 'error': 'no profile fields provided'}), 400

        # completeness = all four filled
        payload['profile_completed'] = all(
            (payload.get(f) or '').strip() for f in allowed
        )

        url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{quote(email)}"
        resp = requests.patch(url, json=payload, headers=_get_headers())

        if resp.status_code in (200, 204):
            return jsonify({
                'success': True,
                'profile_completed': payload['profile_completed'],
                'message': 'Profile saved'
            }), 200
        return jsonify({'success': False, 'error': f'update failed ({resp.status_code}): {resp.text[:200]}'}), 500

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@admin_bp.route('/api/admin/profiles/overview', methods=['GET'])
def get_profiles_overview():
    """
    Full structured breakdown of ALL users:
      paid vs non-paid  X  profile complete vs not completed.
    Returns counts + the user lists for each bucket.
    """
    try:
        users = get_all_rows(
            'users',
            'select=id,email,first_name,last_name,phone,primary_skills,profile_completed,created_at'
        )
        campaigns = get_all_rows('blast_campaigns', 'select=user_id,status,created_at')
        payments = get_all_rows('payments', "status=eq.completed&select=user_id,user_email")
        resumes = get_all_rows('resumes', 'select=user_id')

        # PAID = has a COMPLETED payment. Many guest payments have NULL user_id
        # and are linked only by user_email, so match on BOTH.
        paid_ids = {p.get('user_id') for p in payments if p.get('user_id')}
        paid_emails = {(p.get('user_email') or '').strip().lower()
                       for p in payments if p.get('user_email')}
        paid_emails.discard('guest@resumeblast.ai')  # placeholder, not a real user
        resume_ids = {r.get('user_id') for r in resumes if r.get('user_id')}

        latest_status = {}
        for c in campaigns:
            uid = c.get('user_id')
            if not uid:
                continue
            if uid not in latest_status or (c.get('created_at') or '') > latest_status[uid][1]:
                latest_status[uid] = (c.get('status'), c.get('created_at') or '')

        buckets = {
            'paid_complete': [],
            'paid_incomplete': [],
            'nonpaid_complete': [],
            'nonpaid_incomplete': [],
        }

        for u in users:
            uid = u.get('id')
            is_paid = uid in paid_ids or (u.get('email') or '').strip().lower() in paid_emails
            is_complete = bool(u.get('profile_completed'))
            entry = {
                'id': uid,
                'email': u.get('email'),
                'first_name': u.get('first_name'),
                'last_name': u.get('last_name'),
                'phone': u.get('phone'),
                'primary_skills': u.get('primary_skills'),
                'user_type': _classify_user_type(uid, paid_ids, resume_ids, u.get('email'), paid_emails),
                'campaign_status': latest_status.get(uid, (None,))[0],
                'created_at': u.get('created_at'),
            }
            key = ('paid' if is_paid else 'nonpaid') + ('_complete' if is_complete else '_incomplete')
            buckets[key].append(entry)

        counts = {
            'total': len(users),
            'paid': len(buckets['paid_complete']) + len(buckets['paid_incomplete']),
            'nonpaid': len(buckets['nonpaid_complete']) + len(buckets['nonpaid_incomplete']),
            'complete': len(buckets['paid_complete']) + len(buckets['nonpaid_complete']),
            'incomplete': len(buckets['paid_incomplete']) + len(buckets['nonpaid_incomplete']),
            'paid_complete': len(buckets['paid_complete']),
            'paid_incomplete': len(buckets['paid_incomplete']),
            'nonpaid_complete': len(buckets['nonpaid_complete']),
            'nonpaid_incomplete': len(buckets['nonpaid_incomplete']),
        }

        return jsonify({'success': True, 'counts': counts, 'buckets': buckets}), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────
# ✅ NEW: Admin access management — who can manage this panel at all.
# "shuchitha@shiroapps.com" and "srikanth@shirotechnologies.com" are the
# two permanent super admins (SUPER_ADMIN_EMAILS in services/admin_auth.py).
# Only they can see or use these three endpoints; granted admins (anyone
# they add below) get full use of the rest of the admin panel, but these
# three routes 403 for them just like for anyone else.
# ─────────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/whoami', methods=['GET'])
def admin_whoami():
    """
    ✅ NEW: tells the frontend whether the currently logged-in Supabase
    user is an admin at all, and if so which role. Called right after
    login so App.jsx knows whether to offer the Admin option, and so
    AdminDashboard.jsx knows whether to show the "Manage Admin Access"
    tab. This REPLACES the old client-side-only `check_is_admin` Postgres
    RPC as the source of truth — that RPC only ever drove UI state and
    was never re-checked by the backend, which is exactly the gap this
    whole auth layer closes. Deliberately open to any logged-in user
    (see _PUBLIC_ADMIN_PATHS above) — a non-admin just gets
    is_admin: false instead of a 401.
    """
    admin = get_requesting_admin(request)
    if not admin:
        return jsonify({'success': True, 'is_admin': False, 'role': None}), 200
    return jsonify({
        'success': True,
        'is_admin': True,
        'role': admin['role'],
        'email': admin['email'],
    }), 200


@admin_bp.route('/api/admin/admin-users', methods=['GET'])
def list_admin_users():
    """
    ✅ NEW: lists everyone with admin access — the two permanent super
    admins (always present, never editable) plus every row in
    admin_users, active and revoked, so a super admin can see history
    rather than just who's currently active. Super-admin only.
    """
    if not _require_super_admin():
        return jsonify({'success': False, 'error': 'Super admin access required'}), 403

    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/admin_users?select=*&order=granted_at.desc",
            headers=_read_headers(), timeout=10
        )
        granted = resp.json() if resp.status_code == 200 else []
    except Exception as e:
        print(f"⚠️ [Admin] admin_users list error: {e}")
        granted = []

    super_admins = [
        {'email': e, 'role': 'super_admin', 'revoked': False}
        for e in sorted(SUPER_ADMIN_EMAILS)
    ]
    return jsonify({'success': True, 'super_admins': super_admins, 'granted_admins': granted}), 200


@admin_bp.route('/api/admin/admin-users/grant', methods=['POST'])
def grant_admin_access():
    """
    ✅ NEW: the actual "give this person admin access" action.
    Super-admin only. Upserts an admin_users row by email — if that
    address was previously revoked, this re-activates it and keeps the
    row's history rather than creating a duplicate.
    """
    requester = _require_super_admin()
    if not requester:
        return jsonify({'success': False, 'error': 'Super admin access required'}), 403

    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        if not email or '@' not in email:
            return jsonify({'success': False, 'error': 'A valid email is required'}), 400
        if email in SUPER_ADMIN_EMAILS:
            return jsonify({'success': False, 'error': 'That address is already a permanent super admin'}), 400

        payload = {
            'email': email,
            'role': 'admin',
            'revoked': False,
            'granted_by': requester['email'],
            'granted_at': datetime.now(timezone.utc).isoformat(),
        }
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/admin_users?on_conflict=email",
            json=payload,
            headers={**_get_headers(), 'Prefer': 'resolution=merge-duplicates,return=representation'},
            timeout=10
        )
        if resp.status_code not in (200, 201):
            print(f"❌ [Admin] grant_admin_access upsert failed: {resp.status_code} {resp.text}")
            return jsonify({'success': False, 'error': 'Failed to grant access'}), 500

        print(f"✅ [Admin] {requester['email']} granted admin access to {email}")
        return jsonify({'success': True, 'email': email}), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@admin_bp.route('/api/admin/admin-users/revoke', methods=['POST'])
def revoke_admin_access():
    """
    ✅ NEW: the counterpart to grant. Super-admin only. Soft-revoke
    (revoked=true, not a row delete) so there's a record of who used to
    have access rather than silently erasing it. Refuses outright for
    either permanent super admin address, so this endpoint can never be
    used — accidentally or otherwise — to lock either of them out of
    their own panel.
    """
    requester = _require_super_admin()
    if not requester:
        return jsonify({'success': False, 'error': 'Super admin access required'}), 403

    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        if not email:
            return jsonify({'success': False, 'error': 'Email is required'}), 400
        if email in SUPER_ADMIN_EMAILS:
            return jsonify({'success': False, 'error': 'Super admin access cannot be revoked'}), 400

        resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/admin_users?email=eq.{quote(email)}",
            json={
                'revoked': True,
                'revoked_by': requester['email'],
                'revoked_at': datetime.now(timezone.utc).isoformat(),
            },
            headers=_get_headers(), timeout=10
        )
        if resp.status_code not in (200, 204):
            print(f"❌ [Admin] revoke_admin_access failed: {resp.status_code} {resp.text}")
            return jsonify({'success': False, 'error': 'Failed to revoke access'}), 500

        print(f"✅ [Admin] {requester['email']} revoked admin access from {email}")
        return jsonify({'success': True, 'email': email}), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500