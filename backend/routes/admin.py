from flask import Blueprint, request, jsonify
import os
import requests
from datetime import datetime, timedelta, timezone
import time
import traceback
from urllib.parse import quote
from services.user_service import UserService

admin_bp = Blueprint('admin', __name__)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
BREVO_WEBHOOK_SECRET = os.getenv('BREVO_WEBHOOK_SECRET')

def _get_headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
    }

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
            
            resp = requests.get(url, headers=_get_headers())
            
            if resp.status_code in [200, 206]:
                data = resp.json()
                if not isinstance(data, list) or len(data) == 0:
                    break
                all_results.extend(data)
                
                if len(data) < limit:
                    break
                offset += limit
            else:
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
        end_date_str = request.args.get('end_date')

        # Memory optimization: Only fetch required columns to prevent API timeouts
        query = 'select=id,amount,status,created_at,refund_amount,user_email,stripe_payment_intent_id'
        all_payments = get_all_rows('payments', query)

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
                # Robust parsing for Stripe Unix Epochs AND Supabase ISO strings
                if isinstance(date_str, (int, float)) or (isinstance(date_str, str) and date_str.replace('.','',1).isdigit()):
                    return datetime.fromtimestamp(float(date_str), tz=timezone.utc)
                
                date_str = str(date_str).replace('Z', '+00:00')
                dt = datetime.fromisoformat(date_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except: 
                return None

        filtered_payments = all_payments
        if start_date_str and end_date_str:
            try:
                start_dt = datetime.strptime(start_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
                end_dt = datetime.strptime(end_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc) + timedelta(days=1)
                
                filtered_payments = [
                    p for p in all_payments 
                    if parse_date(p.get('created_at')) and start_dt <= parse_date(p.get('created_at')) < end_dt
                ]
            except Exception as e:
                pass

        valid_success = ['completed', 'paid', 'success', 'succeeded']
        
        completed = []
        for p in filtered_payments:
            status = (p.get('status') or '').lower()
            if status in valid_success:
                completed.append(p)
        
        failed = [p for p in filtered_payments if (p.get('status') or '').lower() in ['failed', 'error', 'canceled', 'cancelled']]
        refunded = [p for p in filtered_payments if (p.get('status') or '').lower() == 'refunded']

        total_revenue = sum(safe_float(p.get('amount')) for p in completed) / 100
        
        today_payments = [
            p for p in all_payments 
            if (p.get('status') or '').lower() in valid_success 
            and parse_date(p.get('created_at')) 
            and parse_date(p.get('created_at')) >= today_start
        ]
        today_revenue = sum(safe_float(p.get('amount')) for p in today_payments) / 100

        last_7_payments = [
            p for p in all_payments 
            if (p.get('status') or '').lower() in valid_success 
            and parse_date(p.get('created_at')) 
            and parse_date(p.get('created_at')) >= seven_days_ago
        ]
        last_7_revenue = sum(safe_float(p.get('amount')) for p in last_7_payments) / 100

        daily_breakdown = []
        for i in range(7):
            day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            
            day_payments_list = [
                p for p in all_payments 
                if (p.get('status') or '').lower() in valid_success 
                and parse_date(p.get('created_at')) 
                and day_start <= parse_date(p.get('created_at')) < day_end
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
        resp = requests.get(url, headers=_get_headers())
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
# 3. BREVO LOGS ENDPOINTS (UPDATED WITH DATE PARSING)
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

        # ✅ FIXED: Robustly handle YYYY-MM-DD, DD-MM-YYYY, and MM/DD/YYYY to match the frontend
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
        resp = requests.get(base_url, headers=_get_headers(), params=params)

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
        resp = requests.get(url, headers=_get_headers(), params=params)

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
            if requests.get(f"{SUPABASE_URL}/rest/v1/", headers=_get_headers(), timeout=5).status_code not in [200, 204, 206]: supabase_status = "Degraded"
        except: supabase_status = "Unreachable"
        return jsonify({'Database': supabase_status, 'Payments': "Configured" if os.getenv('STRIPE_SECRET_KEY') else "Missing", 'Email Service': "Configured" if (os.getenv('BREVO_API_KEY') or os.getenv('RESEND_API_KEY')) else "Missing", 'AI Service': "Configured" if os.getenv('ANTHROPIC_API_KEY') else "Missing", 'API': 'Online'}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/server-status', methods=['GET'])
def get_server_status():
    start_time = time.time()
    try:
        requests.get(f"{SUPABASE_URL}/rest/v1/", headers=_get_headers(), timeout=2)
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

@admin_bp.route('/api/admin/stats', methods=['GET'])
def get_stats():
    try:
        def safe_float(val):
            try: return float(val) if val is not None else 0.0
            except: return 0.0
        payments = get_all_rows('payments', 'select=amount,status')
        return jsonify({'total_users': len(get_all_rows('users', 'select=id')), 'active_users': len(get_all_rows('users', 'select=id&account_status=eq.active')), 'total_blasts': len(get_all_rows('blast_campaigns', 'select=id')), 'total_resume_uploads': len(get_all_rows('resumes', 'select=id')), 'total_revenue': round(sum(safe_float(p.get('amount')) for p in payments if (p.get('status') or '').lower() in ['completed', 'paid', 'success', 'succeeded']) / 100, 2)}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/recruiters/stats', methods=['GET'])
def get_recruiters_stats():
    try:
        paid_res = requests.get(f"{SUPABASE_URL}/rest/v1/recruiters?select=id", headers=_get_headers())
        free_res = requests.get(f"{SUPABASE_URL}/rest/v1/freemium_recruiters?select=id", headers=_get_headers())
        paid_count = len(paid_res.json()) if paid_res.status_code in [200, 206] else 0
        free_count = len(free_res.json()) if free_res.status_code in [200, 206] else 0
        return jsonify({'paid_count': paid_count, 'freemium_count': free_count, 'total_count': paid_count + free_count}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

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
        resp = requests.get(f"{SUPABASE_URL}/rest/v1/plans?select=*", headers=_get_headers())
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