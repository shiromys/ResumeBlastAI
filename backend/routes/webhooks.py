# backend/routes/webhooks.py
# ============================================================
# UPDATED VERSION: Brevo Event Logging + Webhook Secret Validation
# ============================================================

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import os
import requests
import traceback
import uuid

webhooks_bp = Blueprint('webhooks', __name__, url_prefix='/api/webhooks')

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

# Brevo webhook authentication
BREVO_WEBHOOK_SECRET = os.getenv('BREVO_WEBHOOK_SECRET')

def get_supabase_headers():
    """Get headers for Supabase API requests"""
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

# ============================================================
# NEW HELPER FUNCTION - Logs Brevo events to brevo_event_logs table
# ============================================================
def _log_brevo_event(event_type, email_to, email_from, email_subject, timestamp, campaign_id=None, raw_data=None):
    try:
        if not email_to:
            print(f"⚠️ _log_brevo_event: email_to is required, skipping log")
            return False

        log_entry = {
            "campaign_id": campaign_id,
            "email_from": email_from or "no-reply@brevo.com",
            "email_to": email_to,
            "email_subject": email_subject or "[No Subject]",
            "event_type": event_type,
            "timestamp": timestamp or datetime.now(timezone.utc).isoformat(),
            "brevo_raw_data": raw_data or {}
        }

        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/brevo_event_logs",
            json=log_entry,
            headers=get_supabase_headers()
        )

        if resp.status_code in [200, 201]:
            print(f"✅ Brevo event logged: {event_type} → {email_to}")
            return True
        else:
            print(f"⚠️ Failed to log Brevo event: {resp.status_code} {resp.text}")
            return False

    except Exception as e:
        print(f"❌ Error logging Brevo event: {str(e)}")
        traceback.print_exc()
        return False


# ============================================================
# EXISTING FUNCTION - UNTOUCHED
# ============================================================
def update_recruiter_status(email, status, bounce_type, reason):
    try:
        update_data = {
            'email_status': status,
            'bounce_type': bounce_type,
            'bounce_date': datetime.utcnow().isoformat(),
            'bounce_reason': reason
        }
        
        tables_updated = 0
        params = {'email': f'eq.{email}'}
        
        url1 = f"{SUPABASE_URL}/rest/v1/freemium_recruiters"
        response1 = requests.patch(url1, headers=get_supabase_headers(), json=update_data, params=params)
        
        if response1.status_code in [200, 204]:
            result = response1.json() if response1.text else []
            if result or response1.status_code == 204:
                tables_updated += 1
        
        url2 = f"{SUPABASE_URL}/rest/v1/recruiters"
        response2 = requests.patch(url2, headers=get_supabase_headers(), json=update_data, params=params)
        
        if response2.status_code in [200, 204]:
            result = response2.json() if response2.text else []
            if result or response2.status_code == 204:
                tables_updated += 1
        
        url3 = f"{SUPABASE_URL}/rest/v1/recruiter_activity"
        response3 = requests.patch(url3, headers=get_supabase_headers(), json=update_data, params=params)
        
        if response3.status_code in [200, 204]:
            result = response3.json() if response3.text else []
            if result or response3.status_code == 204:
                tables_updated += 1
        
        if tables_updated == 0:
            return False
        else:
            return True
            
    except Exception as e:
        traceback.print_exc()
        return False

# ============================================================
# EXISTING FUNCTION - UNTOUCHED
# ============================================================
def delete_recruiter(email):
    try:
        params = {'email': f'eq.{email}'}
        deleted_count = 0
        
        url1 = f"{SUPABASE_URL}/rest/v1/freemium_recruiters"
        response1 = requests.delete(url1, headers=get_supabase_headers(), params=params)
        if response1.status_code in [200, 204]:
            deleted_count += 1
        
        url2 = f"{SUPABASE_URL}/rest/v1/recruiters"
        response2 = requests.delete(url2, headers=get_supabase_headers(), params=params)
        if response2.status_code in [200, 204]:
            deleted_count += 1
        
        url3 = f"{SUPABASE_URL}/rest/v1/recruiter_activity"
        response3 = requests.delete(url3, headers=get_supabase_headers(), params=params)
        if response3.status_code in [200, 204]:
            deleted_count += 1
        
        if deleted_count > 0:
            return True
        else:
            return False
            
    except Exception as e:
        traceback.print_exc()
        return False


# ============================================================
# EXISTING HELPER FUNCTION - UNTOUCHED
# ============================================================
def _update_blast_campaign_counter(campaign_id, field, increment=1):
    try:
        if not campaign_id:
            return False

        fetch_url = (
            f"{SUPABASE_URL}/rest/v1/blast_campaigns"
            f"?id=eq.{campaign_id}"
            f"&select=id,{field}"
        )
        resp = requests.get(fetch_url, headers=get_supabase_headers())

        if resp.status_code != 200 or not resp.json():
            return False

        row = resp.json()[0]
        current = row.get(field, 0) or 0
        new_value = current + increment

        patch_url = f"{SUPABASE_URL}/rest/v1/blast_campaigns?id=eq.{campaign_id}"
        patch_resp = requests.patch(
            patch_url,
            headers=get_supabase_headers(),
            json={field: new_value}
        )

        if patch_resp.status_code in [200, 204]:
            return True
        else:
            return False

    except Exception as e:
        traceback.print_exc()
        return False


# ============================================================
# EXISTING ROUTE - UNTOUCHED
# ============================================================
@webhooks_bp.route('/brevo/bounce', methods=['POST', 'OPTIONS'])
def handle_brevo_webhook():
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data'}), 400
        
        event = data.get('event', '')
        email = data.get('email', '')
        
        if event in ['hard_bounce', 'soft_bounce']:
            bounce_type = 'hard' if event == 'hard_bounce' else 'soft'
            update_recruiter_status(
                email=email,
                status=event,
                bounce_type=bounce_type,
                reason=data.get('reason', 'Bounce via Brevo webhook')
            )
        
        return jsonify({'status': 'ok'}), 200
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ============================================================
# UPDATED ROUTE - NOW LOGS ALL EVENTS + FIXED TIMEZONE
# ============================================================
@webhooks_bp.route('/brevo/events', methods=['POST', 'OPTIONS'])
def handle_brevo_email_events():
    if request.method == 'OPTIONS':
        return '', 204
    
    auth_header = request.headers.get('Authorization', '')
    token = request.args.get('token', '')
    
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        
    if token != BREVO_WEBHOOK_SECRET:
        print("❌ Invalid or missing webhook token")
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data'}), 400

        event   = data.get('event', '')
        email   = data.get('email', '')
        
        tag         = data.get('tag', '')
        campaign_id = tag.strip() if tag else None
        
        if campaign_id:
            try:
                uuid.UUID(campaign_id)
            except ValueError:
                campaign_id = None
        
        email_from = data.get('email_from', 'no-reply@brevo.com')
        email_subject = data.get('subject', '[No Subject]')
        
        # ✅ FIXED: Bypass Brevo's timestamp to eliminate timezone/epoch crashes.
        # Grabbing the server's exact UTC time ensures Supabase perfectly accepts the record.
        timestamp = datetime.now(timezone.utc).isoformat()

        print(f"\n{'='*70}")
        print(f"🔔 BREVO EMAIL EVENT RECEIVED")
        print(f"{'='*70}")
        print(f"  Event:       {event}")
        print(f"  Email:       {email}")
        print(f"  Campaign ID: {campaign_id}")
        print(f"  Subject:     {email_subject}")
        print(f"{'='*70}\n")

        _log_brevo_event(
            event_type=event,
            email_to=email,
            email_from=email_from,
            email_subject=email_subject,
            timestamp=timestamp,
            campaign_id=campaign_id,
            raw_data=data
        )

        if event == 'delivered':
            if campaign_id: _update_blast_campaign_counter(campaign_id, 'delivered_count')

        elif event == 'opened':
            if campaign_id: _update_blast_campaign_counter(campaign_id, 'opened_count')

        elif event == 'click':
            if campaign_id: _update_blast_campaign_counter(campaign_id, 'clicked_count')

        elif event == 'hard_bounce':
            if campaign_id: _update_blast_campaign_counter(campaign_id, 'bounced_count')
            if email: update_recruiter_status(email=email, status='hard_bounce', bounce_type='hard', reason=f"Hard bounce via Brevo event: {data.get('reason', '')}")

        elif event == 'soft_bounce':
            if campaign_id: _update_blast_campaign_counter(campaign_id, 'bounced_count')
            if email: update_recruiter_status(email=email, status='soft_bounce', bounce_type='soft', reason=f"Soft bounce via Brevo event: {data.get('reason', '')}")

        elif event == 'blocked':
            if email: update_recruiter_status(email=email, status='blocked', bounce_type='blocked', reason=f"Blocked via Brevo event: {data.get('reason', '')}")

        elif event == 'spam':
            if campaign_id: _update_blast_campaign_counter(campaign_id, 'spam_count')
            if email: update_recruiter_status(email=email, status='blocked', bounce_type='spam', reason='Spam complaint via Brevo events webhook')

        elif event == 'unsubscribed':
            if email: update_recruiter_status(email=email, status='blocked', bounce_type='unsubscribed', reason='Unsubscribed via Brevo events webhook')

        return jsonify({'status': 'ok', 'event': event, 'campaign_id': campaign_id}), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@webhooks_bp.route('/resend/bounce', methods=['POST', 'OPTIONS'])
def handle_resend_webhook():
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.json
        if not data: return jsonify({'error': 'No data provided'}), 400
        
        event_type = data.get('type')
        event_data = data.get('data', {})
        to_field = event_data.get('to', [])
        email = to_field[0] if isinstance(to_field, list) and len(to_field) > 0 else None
        
        if not email: return jsonify({'error': 'Email address missing'}), 400
        
        if event_type == 'email.bounced':
            bounce_type = event_data.get('bounce_type', 'hard')
            reason = event_data.get('bounce_reason', 'Email bounced')
            update_recruiter_status(email=email, status='hard_bounce', bounce_type=bounce_type, reason=f"Resend bounce: {reason}")
            
        elif event_type == 'email.complained':
            update_recruiter_status(email=email, status='blocked', bounce_type='spam', reason='Spam complaint via Resend')
        
        return jsonify({'status': 'success', 'event': event_type}), 200
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@webhooks_bp.route('/test', methods=['GET'])
def test_webhook():
    return jsonify({
        'success': True,
        'message': 'Webhook routes are active',
        'endpoints': {
            'brevo_bounce_only': '/api/webhooks/brevo/bounce',
            'brevo_all_events':  '/api/webhooks/brevo/events',
            'resend_freemium':   '/api/webhooks/resend/bounce'
        },
        'brevo_events_tracked': ['delivered', 'opened', 'click', 'hard_bounce', 'soft_bounce', 'blocked', 'spam', 'unsubscribed'],
        'tables': {
            'freemium': 'freemium_recruiters',
            'premium_recruiters': 'recruiters',
            'premium_activity': 'recruiter_activity',
            'blast_stats': 'blast_campaigns',
            'brevo_logs': 'brevo_event_logs'
        },
        'supabase_configured': bool(SUPABASE_URL and SUPABASE_KEY),
        'brevo_webhook_secret_configured': bool(BREVO_WEBHOOK_SECRET)
    })

@webhooks_bp.route('/manual-bounce', methods=['POST'])
def manual_bounce():
    try:
        data = request.json
        email = data.get('email')
        status = data.get('status', 'hard_bounce')
        bounce_type = data.get('bounce_type', 'hard')
        reason = data.get('reason', 'Manually marked as bounced')
        
        if not email: return jsonify({'error': 'Email address required'}), 400
        valid_statuses = ['active', 'soft_bounce', 'hard_bounce', 'blocked', 'spam']
        if status not in valid_statuses: return jsonify({'error': f'Invalid status'}), 400
        
        result = update_recruiter_status(email, status, bounce_type, reason)
        if result: return jsonify({'success': True, 'message': f'Email {email} marked as {status}'}), 200
        else: return jsonify({'success': False, 'message': f'Email {email} not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500