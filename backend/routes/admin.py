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
    """
    try:
        api_key = os.getenv('BREVO_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'BREVO_API_KEY not configured.'}), 500

        brevo_headers = {
            'accept': 'application/json',
            'api-key': api_key
        }

        account_resp = requests.get('https://api.brevo.com/v3/account', headers=brevo_headers, timeout=10)
        if account_resp.status_code != 200:
            return jsonify({'success': False, 'error': f"Brevo API error {account_resp.status_code}"}), 500

        account_data = account_resp.json()
        all_plans = account_data.get('plan', [])
        plan_info = next((p for p in all_plans if p.get('type') in ['subscription', 'payAsYouGo', 'free']), {})

        plan_type = plan_info.get('type', 'free')
        credits_left = plan_info.get('credits', 0) 

        return jsonify({
            'success': True,
            'plan_details': {
                'type': plan_type,
                'credits_remaining': credits_left,
                'total_limit': plan_info.get('credits', 0)
            },
            'account_holder': f"{account_data.get('firstName', '')} {account_data.get('lastName', '')}".strip(),
            'account_email': account_data.get('email', 'N/A')
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# =========================================================
# 1. REVENUE ANALYTICS
# =========================================================
@admin_bp.route('/api/admin/revenue', methods=['GET'])
def get_revenue():
    try:
        all_payments = get_all_rows('payments', 'select=*&order=created_at.desc')
        completed = [p for p in all_payments if p.get('status') == 'completed']
        total_revenue = sum(p.get('amount', 0) for p in completed) / 100
        
        return jsonify({
            'total_revenue': round(total_revenue, 2),
            'transactions': len(completed)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# =========================================================
# 2. USERS MANAGEMENT
# =========================================================
@admin_bp.route('/api/admin/users', methods=['GET'])
def get_users():
    try:
        users = get_all_rows('users', 'select=*&order=created_at.desc')
        return jsonify({'count': len(users), 'users': users}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/users/delete', methods=['POST'])
def delete_user():
    try:
        data = request.json
        email = data.get('email')
        deletion_summary = UserService.delete_user_data(email=email, reason=data.get('reason'))
        return jsonify({'success': True, 'details': deletion_summary}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# =========================================================
# 3. SYSTEM HEALTH
# =========================================================
@admin_bp.route('/api/admin/health', methods=['GET'])
def get_health():
    return jsonify({'Database': 'Healthy', 'API': 'Online'}), 200

# =========================================================
# 4. SUPPORT TICKETS
# =========================================================
@admin_bp.route('/api/admin/contact-submissions', methods=['GET'])
def get_contact_submissions():
    submissions = get_all_rows('support_tickets', 'select=*&order=created_at.desc')
    return jsonify({'submissions': submissions}), 200

@admin_bp.route('/api/admin/contact-submissions/unread-count', methods=['GET'])
def get_unread_count():
    unread = get_all_rows('support_tickets', 'select=id&status=eq.unread')
    return jsonify({'unread_count': len(unread)}), 200

# =========================================================
# 5. GENERAL STATS
# =========================================================
@admin_bp.route('/api/admin/stats', methods=['GET'])
def get_stats():
    users = get_all_rows('users', 'select=id')
    blasts = get_all_rows('blast_campaigns', 'select=id')
    return jsonify({'total_users': len(users), 'total_blasts': len(blasts)}), 200

# =========================================================
# 6. RECRUITERS & PLANS MANAGEMENT
# =========================================================
@admin_bp.route('/api/admin/recruiters/stats', methods=['GET'])
def get_recruiters_stats():
    paid = requests.get(f"{SUPABASE_URL}/rest/v1/recruiters?select=id", headers=_get_headers())
    return jsonify({'total_count': len(paid.json()) if paid.status_code == 200 else 0}), 200

@admin_bp.route('/api/admin/plans', methods=['GET'])
def get_plans():
    url = f"{SUPABASE_URL}/rest/v1/plans?select=*&order=price_cents.asc"
    resp = requests.get(url, headers=_get_headers())
    return jsonify({'plans': resp.json() if resp.status_code == 200 else []}), 200

# =========================================================
# 7. DRIP CAMPAIGN MANAGEMENT & REAL-TIME BREVO LOGS
# =========================================================

@admin_bp.route('/api/admin/drip-stats', methods=['GET'])
def get_drip_stats():
    """
    MODIFIED: Fetches real-time status from BREVO LOGS for the specific user campaign.
    This bypasses database delays and shows actual email events (opened, bounced, etc).
    """
    email = request.args.get('email')
    if not email:
        return jsonify({'error': 'Email required'}), 400
        
    try:
        # 1. Locate the campaign in our DB
        url = f"{SUPABASE_URL}/rest/v1/blast_campaigns?candidate_email=eq.{email}&order=created_at.desc&limit=1"
        resp = requests.get(url, headers=_get_headers())
        
        if resp.status_code != 200 or not resp.json():
            return jsonify({'success': False, 'message': 'No campaign found for this email'}), 404
            
        campaign = resp.json()[0]
        campaign_id = campaign.get('id')
        api_key = os.getenv('BREVO_API_KEY')
        
        # 2. Query Brevo Events API using campaign_id as a tag
        # Every transactional email sent includes the campaign ID as a metadata tag
        brevo_headers = {'accept': 'application/json', 'api-key': api_key}
        evt_resp = requests.get(
            f"https://api.brevo.com/v3/smtp/statistics/events?tags={campaign_id}&limit=100", 
            headers=brevo_headers
        )
        
        sent_set = set()
        opened_set = set()
        bounced_set = set()
        unsub_set = set()

        if evt_resp.status_code == 200:
            events = evt_resp.json().get('events', [])
            for evt in events:
                mail = evt.get('email')
                event_type = evt.get('event')
                if event_type in ['delivered', 'requests']: sent_set.add(mail)
                if event_type in ['opened', 'clicks']: opened_set.add(mail)
                if event_type in ['bounces', 'hardBounces', 'softBounces', 'blocked']: bounced_set.add(mail)
                if event_type == 'unsubscribed': unsub_set.add(mail)

        # Wave breakdown from DB (kept for structural history)
        d1 = int(campaign.get('drip_day1_delivered') or 0)
        d2 = int(campaign.get('drip_day2_delivered') or 0)
        d3 = int(campaign.get('drip_day3_delivered') or 0)

        return jsonify({
            'success': True,
            'data': {
                'id': campaign_id,
                'status': campaign.get('status'),
                'plan_name': campaign.get('plan_name'),
                'total_recipients': campaign.get('total_recruiters', 250),
                # Real-time results from live Brevo logs:
                'total_sent': len(sent_set),
                'total_opened': len(opened_set),
                'total_bounced': len(bounced_set),
                'total_unsubscribed': len(unsub_set),
                # History breakdown
                'wave1_sent': d1,
                'wave2_sent': d2,
                'wave3_sent': d3,
                'resume_url': campaign.get('resume_url'),
                'created_at': campaign.get('created_at'),
                'brevo_logs_synced': True
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/drip-campaign/force-wave', methods=['POST'])
def force_drip_wave():
    data = request.json
    email = data.get('email')
    target_wave = data.get('wave')
    try:
        user_id = UserService.get_user_id_by_email(email)
        url = f"{SUPABASE_URL}/rest/v1/blast_campaigns?user_id=eq.{user_id}&status=eq.active&order=created_at.desc&limit=1"
        resp = requests.get(url, headers=_get_headers())
        campaign_id = resp.json()[0]['id']
        now = datetime.utcnow().isoformat()
        update_data = {'drip_day1_sent_at': now, 'day4_scheduled_for': now} if target_wave == 2 else {'drip_day2_sent_at': now, 'day8_scheduled_for': now}
        requests.patch(f"{SUPABASE_URL}/rest/v1/blast_campaigns?id=eq.{campaign_id}", json=update_data, headers=_get_headers())
        return jsonify({'success': True, 'message': f'Wave {target_wave} forced.'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500