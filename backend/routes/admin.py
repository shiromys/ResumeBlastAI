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
            # ✅ FIX: Use root ping instead of table query to avoid 504/400 errors
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
        # ✅ FIX: Root health check is more reliable for server status
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

        return jsonify({
            'paid_recruiters_count': paid_count,
            'freemium_recruiters_count': free_count
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/recruiters/add', methods=['POST'])
def add_recruiter():
    """Add a new recruiter to the specified table"""
    try:
        data = request.json
        target_table = data.get('target_table')
        
        if target_table not in ['recruiters', 'freemium_recruiters']:
            return jsonify({'error': 'Invalid target table'}), 400

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
    """Delete a recruiter by email from a specific table"""
    try:
        data = request.json
        target_table = data.get('target_table')
        email = data.get('email')
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        if target_table not in ['recruiters', 'freemium_recruiters']:
            return jsonify({'error': 'Invalid target table'}), 400

        url = f"{SUPABASE_URL}/rest/v1/{target_table}?email=eq.{email}"
        resp = requests.delete(url, headers=_get_headers())

        if resp.status_code in [200, 204]:
            return jsonify({'success': True, 'message': f'Recruiter {email} deleted from {target_table}'}), 200
        else:
            return jsonify({'error': f"DB Error: {resp.text}"}), 500

    except Exception as e:
        print(f"Error deleting recruiter: {e}")
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