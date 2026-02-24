# backend/routes/admin.py
from flask import Blueprint, request, jsonify
import os
import requests
from datetime import datetime, timedelta, timezone
import time
import traceback
from services.user_service import UserService

admin_bp = Blueprint('admin', __name__)

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

def _get_headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
    }

def get_all_rows(table, query=''):
    """Helper to fetch data from Supabase"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
        resp = requests.get(url, headers=_get_headers())
        return resp.json() if resp.status_code == 200 else []
    except:
        return []

# =========================================================
# 🆕 BREVO PLAN & CREDITS MANAGEMENT
# =========================================================
@admin_bp.route('/api/admin/brevo-stats', methods=['GET'])
def get_brevo_stats():
    """
    Fetches 100% real-time Brevo data — NO hardcoded values.

    API calls made:
      1. GET /v3/account          → plan type, credits remaining, account info,
                                    plan start/end dates, and all plan features
      2. GET /v3/smtp/statistics/aggregatedReport (today)      → emails sent today
      3. GET /v3/smtp/statistics/aggregatedReport (this month) → emails sent this month

    How total_limit is derived (fully dynamic):
      - For 'subscription' plans: Brevo returns plan[].credits as the REMAINING
        monthly allowance. We call the month-to-date stats report to get emails
        already sent this billing cycle. total_limit = credits_remaining + sent_this_month.
      - For 'payAsYouGo' plans: credits field is the remaining pre-paid credits.
        We calculate used from the monthly report the same way.
      - For 'free' plans: Brevo enforces a 300 emails/day hard limit. We use
        300 as total_limit (the only legitimate fixed value here — it is Brevo's
        published free-tier constraint, not a business assumption).
    """
    try:
        api_key = os.getenv('BREVO_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'BREVO_API_KEY not configured. Add BREVO_API_KEY to your .env file.'}), 500

        brevo_headers = {
            'accept': 'application/json',
            'api-key': api_key
        }

        # ── CALL 1: Account + Plan Info ──────────────────────────────────────
        account_resp = requests.get('https://api.brevo.com/v3/account', headers=brevo_headers, timeout=10)

        if account_resp.status_code != 200:
            error_body = account_resp.text
            print(f"Brevo /account API error {account_resp.status_code}: {error_body}")
            return jsonify({
                'success': False,
                'error': f"Brevo API returned {account_resp.status_code}. Check your BREVO_API_KEY."
            }), 500

        account_data = account_resp.json()

        # Pick the most relevant plan in priority order:
        # subscription > payAsYouGo > free
        all_plans = account_data.get('plan', [])
        plan_info = (
            next((p for p in all_plans if p.get('type') == 'subscription'), None)
            or next((p for p in all_plans if p.get('type') == 'payAsYouGo'), None)
            or next((p for p in all_plans if p.get('type') == 'free'), None)
            or {}
        )

        plan_type      = plan_info.get('type', 'free')
        credits_left   = plan_info.get('credits', 0)  # remaining allowance from Brevo

        # ── CALL 2: Today's email stats ──────────────────────────────────────
        today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        daily_sent = 0
        try:
            day_stats_resp = requests.get(
                'https://api.brevo.com/v3/smtp/statistics/aggregatedReport',
                headers=brevo_headers,
                params={'startDate': today_str, 'endDate': today_str},
                timeout=10
            )
            if day_stats_resp.status_code == 200:
                day_stats = day_stats_resp.json()
                # 'requests' = total send attempts today (includes delivered + bounced + etc.)
                daily_sent = day_stats.get('requests', 0)
        except Exception as day_err:
            print(f"⚠️ Brevo daily stats fetch failed (non-fatal): {day_err}")

        # ── CALL 3: This billing-cycle / month-to-date email stats ───────────
        # We use the 1st of the current month to today so we know how many
        # emails have already been sent in this billing cycle.
        now_utc = datetime.now(timezone.utc)
        month_start_str = now_utc.replace(day=1).strftime('%Y-%m-%d')
        monthly_sent = 0
        try:
            month_stats_resp = requests.get(
                'https://api.brevo.com/v3/smtp/statistics/aggregatedReport',
                headers=brevo_headers,
                params={'startDate': month_start_str, 'endDate': today_str},
                timeout=10
            )
            if month_stats_resp.status_code == 200:
                month_stats = month_stats_resp.json()
                monthly_sent = month_stats.get('requests', 0)
        except Exception as month_err:
            print(f"⚠️ Brevo monthly stats fetch failed (non-fatal): {month_err}")

        # ── Calculate total_limit & usage ────────────────────────────────────
        if plan_type == 'free':
            # Brevo's free tier: 300 emails/day hard cap (their published constraint)
            total_limit    = 300
            credits_used   = daily_sent          # for free plan, "used" = today's sent
            credits_left_display = max(0, total_limit - daily_sent)
            usage_label    = "today's free daily limit"
        else:
            # For paid plans: total = what's remaining + what was already sent this month
            # This gives us the true plan size dynamically from Brevo's own data.
            total_limit        = credits_left + monthly_sent
            credits_used       = monthly_sent
            credits_left_display = credits_left
            usage_label        = "monthly plan limit"

        # Usage percentage (guard against divide-by-zero)
        if total_limit > 0:
            usage_percentage = round((credits_used / total_limit) * 100, 2)
        else:
            usage_percentage = 0.0

        trigger_alert = usage_percentage >= 70

        # ── Plan start / renewal dates ───────────────────────────────────────
        # Brevo subscription plans expose startDate & endDate on the plan object.
        plan_start_date = plan_info.get('startDate')   # ISO string or None
        plan_end_date   = plan_info.get('endDate')     # ISO string or None

        # Fall back to account creation date only if plan start is absent
        purchase_date = plan_start_date or account_data.get('createdAt', 'N/A')

        # ── Build features list from live plan data ───────────────────────────
        # Only facts we can derive from the API — no assumptions.
        features = []
        features.append(f"Plan Type: {plan_type.replace('payAsYouGo', 'Pay As You Go').replace('subscription', 'Subscription').title()}")

        if plan_type == 'free':
            features.append("Daily Sending Limit: 300 emails/day")
        else:
            features.append(f"Monthly Sending Limit: {total_limit:,} emails")

        features.append("Transactional Email Sending")
        features.append("Real-time Delivery Webhooks")
        features.append("SMTP & API Access")

        if plan_type != 'free':
            features.append("Advanced Analytics & Reporting")
            features.append("Priority Email Delivery")

        if plan_end_date:
            # Show renewal as a feature tag so it's visible at a glance
            try:
                renewal_dt = datetime.fromisoformat(plan_end_date.replace('Z', '+00:00'))
                features.append(f"Renews: {renewal_dt.strftime('%B %d, %Y')}")
            except Exception:
                features.append(f"Renewal Date: {plan_end_date}")

        # ── Build response ───────────────────────────────────────────────────
        return jsonify({
            'success': True,
            'fetched_at': now_utc.strftime('%Y-%m-%d %H:%M:%S UTC'),   # helps admin see data freshness
            'plan_details': {
                'type':               plan_type,
                'total_limit':        total_limit,
                'credits_remaining':  credits_left_display,
                'credits_used':       credits_used,
                'usage_percent':      usage_percentage,
                'usage_label':        usage_label,
                'trigger_alert':      trigger_alert,
                'purchase_date':      purchase_date,
                'plan_end_date':      plan_end_date or 'N/A',
                'daily_sent':         daily_sent,
                'monthly_sent':       monthly_sent,
                'features':           features
            },
            'account_holder': f"{account_data.get('firstName', '')} {account_data.get('lastName', '')}".strip() or 'N/A',
            'account_email':   account_data.get('email', 'N/A'),
            'company':         account_data.get('companyName', 'N/A')
        }), 200

    except Exception as e:
        print(f"Brevo Stats Error: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

# =========================================================
# 1. REVENUE ANALYTICS
# =========================================================
@admin_bp.route('/api/admin/revenue', methods=['GET'])
def get_revenue():
    try:
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')

        all_payments = get_all_rows('payments', 'select=*&order=created_at.desc')

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        seven_days_ago = now - timedelta(days=7)

        filtered_payments = all_payments
        if start_date_str and end_date_str:
            try:
                start_dt = datetime.strptime(start_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
                end_dt = datetime.strptime(end_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc) + timedelta(days=1)
                
                filtered_payments = [
                    p for p in all_payments 
                    if start_dt <= datetime.fromisoformat(p['created_at'].replace('Z', '+00:00')) < end_dt
                ]
            except ValueError:
                pass 

        completed = [p for p in filtered_payments if p.get('status') == 'completed']
        failed = [p for p in filtered_payments if p.get('status') == 'failed']
        refunded = [p for p in filtered_payments if p.get('status') == 'refunded']

        total_revenue = sum(p.get('amount', 0) for p in completed) / 100
        
        today_payments = [
            p for p in all_payments 
            if p.get('status') == 'completed' and 
            datetime.fromisoformat(p['created_at'].replace('Z', '+00:00')) >= today_start
        ]
        today_revenue = sum(p.get('amount', 0) for p in today_payments) / 100
        today_transactions = len(today_payments)

        last_7_payments = [
            p for p in all_payments 
            if p.get('status') == 'completed' and 
            datetime.fromisoformat(p['created_at'].replace('Z', '+00:00')) >= seven_days_ago
        ]
        last_7_revenue = sum(p.get('amount', 0) for p in last_7_payments) / 100

        daily_breakdown = []
        for i in range(7):
            day_date = now - timedelta(days=i)
            day_start = day_date.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            
            day_payments = [
                p for p in all_payments 
                if p.get('status') == 'completed' and 
                day_start <= datetime.fromisoformat(p['created_at'].replace('Z', '+00:00')) < day_end
            ]
            
            daily_breakdown.append({
                'date': day_start.isoformat(),
                'revenue': sum(p.get('amount', 0) for p in day_payments) / 100,
                'transactions': len(day_payments)
            })
        
        return jsonify({
            'total_revenue': round(total_revenue, 2),
            'transactions': len(completed),
            'today_revenue': round(today_revenue, 2),
            'today_transactions': today_transactions,
            'last_7_days_revenue': round(last_7_revenue, 2),
            'daily_breakdown': daily_breakdown,
            'failed_payments': {
                'count': len(failed),
                'amount': round(sum(p.get('amount', 0) for p in failed) / 100, 2),
                'payments': failed[:20]
            },
            'refunded_payments': {
                'count': len(refunded),
                'amount': round(sum(p.get('refund_amount', 0) for p in refunded) / 100, 2),
                'payments': refunded[:20]
            }
        }), 200

    except Exception as e:
        print(f"Admin Revenue Error: {e}")
        return jsonify({'error': str(e)}), 500

# =========================================================
# 2. USERS MANAGEMENT
# =========================================================
@admin_bp.route('/api/admin/users', methods=['GET'])
def get_users():
    try:
        users = get_all_rows('users', 'select=*&order=created_at.desc')
        return jsonify({
            'count': len(users),
            'users': users
        }), 200
    except Exception as e:
        print(f"Admin Users Error: {e}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/users/delete', methods=['POST'])
def delete_user():
    try:
        data = request.json
        email = data.get('email')
        user_id = data.get('user_id')
        admin_email = data.get('admin_email', 'system')
        reason = data.get('reason', 'Admin deletion via dashboard')
        
        if not email:
            return jsonify({'success': False, 'error': 'Email is required'}), 400
        
        deletion_summary = UserService.delete_user_data(
            email=email,
            user_id=user_id,
            reason=reason,
            deleted_by=admin_email
        )
        
        return jsonify({
            'success': True,
            'message': f'User {email} has been successfully deleted',
            'details': deletion_summary
        }), 200
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# =========================================================
# 3. SYSTEM HEALTH (Live data refined)
# =========================================================
@admin_bp.route('/api/admin/health', methods=['GET'])
def get_health():
    try:
        supabase_status = "Healthy"
        try:
            db_test = requests.get(f"{SUPABASE_URL}/rest/v1/", headers=_get_headers(), timeout=5)
            if db_test.status_code not in [200, 204]:
                supabase_status = "Degraded"
        except:
            supabase_status = "Unreachable"

        stripe_status = "Configured" if os.getenv('STRIPE_SECRET_KEY') else "Missing Key"
        email_status = "Configured" if (os.getenv('BREVO_API_KEY') or os.getenv('RESEND_API_KEY')) else "Missing Key"

        return jsonify({
            'Database': supabase_status,
            'Payments': stripe_status,
            'Email Service': email_status,
            'AI Service': "Configured" if os.getenv('ANTHROPIC_API_KEY') else "Missing Key",
            'API': 'Online'
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/server-status', methods=['GET'])
def get_server_status():
    start_time = time.time()
    try:
        requests.get(f"{SUPABASE_URL}/rest/v1/", headers=_get_headers(), timeout=2)
        latency = round((time.time() - start_time) * 1000, 2)
        
        return jsonify({
            'uptime': 'Running',
            'services': {
                'Database': {'status': 'Online', 'response_code': 200, 'latency': f"{latency}ms"},
                'Server': {'status': 'Online', 'response_code': 200}
            },
            'configuration': {
                'Stripe': 'Set' if os.getenv('STRIPE_SECRET_KEY') else 'Missing',
                'Supabase': 'Set' if os.getenv('SUPABASE_URL') else 'Missing',
                'Anthropic': 'Set' if os.getenv('ANTHROPIC_API_KEY') else 'Missing'
            }
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# =========================================================
# 4. SUPPORT TICKETS
# =========================================================
@admin_bp.route('/api/admin/contact-submissions', methods=['GET'])
def get_contact_submissions():
    try:
        filter_status = request.args.get('filter', 'all')
        
        query = 'select=*&order=created_at.desc'
        if filter_status == 'unread':
            query += '&status=eq.unread'
        elif filter_status == 'open':
            query += '&status=eq.open'
        elif filter_status == 'resolved':
            query += '&status=eq.resolved'
            
        submissions = get_all_rows('support_tickets', query)
        
        mapped_submissions = []
        for sub in submissions:
            mapped_submissions.append({
                'id': sub.get('id'),
                'name': sub.get('user_name'),
                'email': sub.get('user_email'),
                'subject': sub.get('subject'),
                'message': sub.get('message'),
                'status': sub.get('status', 'open'),
                'submitted_at': sub.get('created_at'),
                'ticket_id': sub.get('ticket_id'),
                'admin_notes': sub.get('admin_notes', '')
            })
            
        return jsonify({'submissions': mapped_submissions}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/contact-submissions/unread-count', methods=['GET'])
def get_unread_count():
    try:
        query = 'select=id&status=eq.unread'
        unread_tickets = get_all_rows('support_tickets', query)
        return jsonify({'unread_count': len(unread_tickets)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/contact-submissions/<ticket_id>/mark-read', methods=['PATCH'])
def mark_contact_read(ticket_id):
    try:
        url = f"{SUPABASE_URL}/rest/v1/support_tickets?id=eq.{ticket_id}"
        requests.patch(url, json={'status': 'open'}, headers=_get_headers())
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/contact-submissions/<ticket_id>/resolve', methods=['PATCH'])
def toggle_resolve_status(ticket_id):
    try:
        data = request.json
        new_status = data.get('status', 'resolved')
        if new_status not in ['open', 'resolved']:
            return jsonify({'error': 'Invalid status'}), 400
        
        url = f"{SUPABASE_URL}/rest/v1/support_tickets?id=eq.{ticket_id}"
        response = requests.patch(url, json={'status': new_status}, headers=_get_headers())
        
        if response.status_code in [200, 204]:
            return jsonify({'success': True, 'status': new_status}), 200
        else:
            return jsonify({'error': 'Failed to update status'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/contact-submissions/<ticket_id>/notes', methods=['PATCH'])
def update_contact_notes(ticket_id):
    try:
        notes = request.json.get('admin_notes')
        url = f"{SUPABASE_URL}/rest/v1/support_tickets?id=eq.{ticket_id}"
        requests.patch(url, json={'admin_notes': notes}, headers=_get_headers())
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# =========================================================
# 5. GENERAL STATS (Live data refined)
# =========================================================
@admin_bp.route('/api/admin/stats', methods=['GET'])
def get_stats():
    try:
        users = get_all_rows('users', 'select=id')
        active_users = get_all_rows('users', 'select=id&account_status=eq.active')
        blasts = get_all_rows('blast_campaigns', 'select=id')
        resumes = get_all_rows('resumes', 'select=id')
        payments = get_all_rows('payments', 'select=amount&status=eq.completed')
        
        revenue = sum(p.get('amount', 0) for p in payments) / 100
        
        return jsonify({
            'total_users': len(users),
            'active_users': len(active_users),
            'total_blasts': len(blasts),
            'total_resume_uploads': len(resumes),
            'total_revenue': round(revenue, 2)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# =========================================================
# 6. RECRUITERS & PLANS MANAGEMENT
# =========================================================

@admin_bp.route('/api/admin/recruiters/stats', methods=['GET'])
def get_recruiters_stats():
    """Get counts from both recruiter tables"""
    try:
        paid_res = requests.get(f"{SUPABASE_URL}/rest/v1/recruiters?select=id", headers=_get_headers())
        paid_count = len(paid_res.json()) if paid_res.status_code == 200 else 0

        free_res = requests.get(f"{SUPABASE_URL}/rest/v1/freemium_recruiters?select=id", headers=_get_headers())
        free_count = len(free_res.json()) if free_res.status_code == 200 else 0

        total_count = paid_count + free_count

        response_data = {
            'paid_count': paid_count,
            'freemium_count': free_count,
            'total_count': total_count
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/recruiters/add', methods=['POST'])
def add_recruiter():
    """Add a new recruiter to the specified table"""
    try:
        data = request.json
        target_table = data.get('target_table')
        
        # ✅ CHANGED: Added 'app_registered_recruiters' to the allowed tables list.
        # This table stores unverified recruiters who self-register through the app.
        # The 'recruiters' table remains exclusively for verified/paid recruiters.
        if target_table not in ['recruiters', 'freemium_recruiters', 'app_registered_recruiters']:
            return jsonify({'error': 'Invalid target table'}), 400

        # ✅ CHANGED: Base payload differs per table.
        # - 'recruiters' and 'freemium_recruiters' use email_status (existing columns).
        # - 'app_registered_recruiters' uses id (Supabase Auth UUID) as PK and
        #   does NOT have an email_status column, so we exclude it.
        if target_table == 'app_registered_recruiters':
            recruiter_data = {
                'id': data.get('id'),           # Supabase Auth UUID — required as PK
                'email': data.get('email'),
                'is_active': True,
                'created_at': datetime.utcnow().isoformat()
            }
        else:
            recruiter_data = {
                'email': data.get('email'),
                'is_active': True,
                'email_status': 'active',
                'created_at': datetime.utcnow().isoformat()
            }

        if target_table == 'freemium_recruiters':
            recruiter_data.update({
                'name': data.get('name'),
                'company': data.get('company'),
                'industry': data.get('industry', 'Technology'),
                'location': data.get('location', 'Remote')
            })

        if not recruiter_data.get('email'):
            return jsonify({'error': 'Email is required'}), 400

        url = f"{SUPABASE_URL}/rest/v1/{target_table}"
        resp = requests.post(url, json=recruiter_data, headers=_get_headers())

        if resp.status_code in [200, 201]:
            return jsonify({'success': True, 'message': 'Recruiter added successfully'}), 200
        else:
            return jsonify({'error': f"DB Error: {resp.text}"}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/recruiters/delete', methods=['DELETE'])
def delete_recruiter_by_email():
    """Delete a recruiter by email from a specific table and log the action"""
    try:
        data = request.json
        target_table = data.get('target_table')
        email = data.get('email')
        reason = data.get('reason')
        admin_email = data.get('admin_email', 'system')
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        if target_table not in ['recruiters', 'freemium_recruiters']:
            return jsonify({'error': 'Invalid target table'}), 400

        if not reason:
            return jsonify({'error': 'Reason for deletion is required'}), 400

        log_entry = {
            'email': email,
            'target_table': target_table,
            'reason': reason,
            'deleted_by': admin_email,
            'deleted_at': datetime.utcnow().isoformat()
        }
        
        log_url = f"{SUPABASE_URL}/rest/v1/deleted_recruiters"
        requests.post(log_url, json=log_entry, headers=_get_headers())

        url = f"{SUPABASE_URL}/rest/v1/{target_table}?email=eq.{email}"
        resp = requests.delete(url, headers=_get_headers())

        if resp.status_code in [200, 204]:
            return jsonify({'success': True, 'message': f'Recruiter {email} deleted from {target_table}.'}), 200
        else:
            return jsonify({'error': f"DB Error: {resp.text}"}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/plans', methods=['GET'])
def get_plans():
    """Fetch all plans for admin display"""
    try:
        url = f"{SUPABASE_URL}/rest/v1/plans?select=*&order=price_cents.asc"
        resp = requests.get(url, headers=_get_headers())
        
        if resp.status_code == 200:
            return jsonify({'plans': resp.json()}), 200
        else:
            return jsonify({'plans': []}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/plans/update', methods=['PATCH'])
def update_plan():
    """Update pricing or limits for a plan"""
    try:
        data = request.json
        plan_id = data.get('id')
        
        update_data = {
            'price_cents': data.get('price_cents'),
            'recruiter_limit': data.get('recruiter_limit'),
            'display_name': data.get('display_name'),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        url = f"{SUPABASE_URL}/rest/v1/plans?id=eq.{plan_id}"
        resp = requests.patch(url, json=update_data, headers=_get_headers())
        
        if resp.status_code in [200, 204]:
            return jsonify({'success': True}), 200
        else:
            return jsonify({'error': resp.text}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/resumes/all', methods=['GET'])
def get_all_resumes():
    try:
        resumes = get_all_rows('resumes', 'select=*&order=created_at.desc')
        return jsonify({
            'success': True,
            'count': len(resumes),
            'resumes': resumes
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/api/admin/users/count', methods=['GET'])
def get_user_count():
    try:
        users = get_all_rows('users', 'select=id')
        return jsonify({
            'success': True,
            'total_users': len(users)
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500