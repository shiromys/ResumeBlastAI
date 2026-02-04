# backend/routes/webhooks.py
from flask import Blueprint, request, jsonify
from datetime import datetime
import os
import requests
import traceback

webhooks_bp = Blueprint('webhooks', __name__, url_prefix='/api/webhooks')

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

def get_supabase_headers():
    """Get headers for Supabase API requests"""
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

def update_recruiter_status(email, status, bounce_type, reason):
    """
    Update recruiter email status in ALL THREE tables
    
    Args:
        email: Recruiter email address
        status: Email status (active, soft_bounce, hard_bounce, blocked, spam)
        bounce_type: Type of bounce
        reason: Reason for bounce
    """
    try:
        # Prepare update data
        update_data = {
            'email_status': status,
            'bounce_type': bounce_type,
            'bounce_date': datetime.utcnow().isoformat(),
            'bounce_reason': reason
        }
        
        tables_updated = 0
        params = {'email': f'eq.{email}'}
        
        # Table 1: freemium_recruiters (freemium blasts via Resend)
        url1 = f"{SUPABASE_URL}/rest/v1/freemium_recruiters"
        response1 = requests.patch(url1, headers=get_supabase_headers(), json=update_data, params=params)
        
        if response1.status_code in [200, 204]:
            result = response1.json() if response1.text else []
            if result or response1.status_code == 204:
                print(f"✅ Updated {email} in freemium_recruiters table")
                tables_updated += 1
        
        # Table 2: recruiters (premium blasts via Brevo)
        url2 = f"{SUPABASE_URL}/rest/v1/recruiters"
        response2 = requests.patch(url2, headers=get_supabase_headers(), json=update_data, params=params)
        
        if response2.status_code in [200, 204]:
            result = response2.json() if response2.text else []
            if result or response2.status_code == 204:
                print(f"✅ Updated {email} in recruiters table")
                tables_updated += 1
        
        # Table 3: recruiter_activity (premium activity tracking)
        url3 = f"{SUPABASE_URL}/rest/v1/recruiter_activity"
        response3 = requests.patch(url3, headers=get_supabase_headers(), json=update_data, params=params)
        
        if response3.status_code in [200, 204]:
            result = response3.json() if response3.text else []
            if result or response3.status_code == 204:
                print(f"✅ Updated {email} in recruiter_activity table")
                tables_updated += 1
        
        if tables_updated == 0:
            print(f"⚠️ Email {email} not found in any recruiter table")
            return False
        else:
            print(f"✅ Updated {email} status to {status} in {tables_updated} table(s)")
            return True
            
    except Exception as e:
        print(f"❌ Error updating recruiter status: {str(e)}")
        traceback.print_exc()
        return False

def delete_recruiter(email):
    """
    Permanently delete a recruiter from ALL THREE tables
    
    Args:
        email: Recruiter email address
    """
    try:
        params = {'email': f'eq.{email}'}
        deleted_count = 0
        
        # Delete from freemium_recruiters
        url1 = f"{SUPABASE_URL}/rest/v1/freemium_recruiters"
        response1 = requests.delete(url1, headers=get_supabase_headers(), params=params)
        if response1.status_code in [200, 204]:
            print(f"✅ Deleted {email} from freemium_recruiters")
            deleted_count += 1
        
        # Delete from recruiters
        url2 = f"{SUPABASE_URL}/rest/v1/recruiters"
        response2 = requests.delete(url2, headers=get_supabase_headers(), params=params)
        if response2.status_code in [200, 204]:
            print(f"✅ Deleted {email} from recruiters")
            deleted_count += 1
        
        # Delete from recruiter_activity
        url3 = f"{SUPABASE_URL}/rest/v1/recruiter_activity"
        response3 = requests.delete(url3, headers=get_supabase_headers(), params=params)
        if response3.status_code in [200, 204]:
            print(f"✅ Deleted {email} from recruiter_activity")
            deleted_count += 1
        
        if deleted_count > 0:
            print(f"✅ Deleted {email} from {deleted_count} table(s)")
            return True
        else:
            print(f"⚠️ Email {email} not found for deletion")
            return False
            
    except Exception as e:
        print(f"❌ Error deleting recruiter: {str(e)}")
        traceback.print_exc()
        return False

@webhooks_bp.route('/brevo/bounce', methods=['POST', 'OPTIONS'])
def handle_brevo_webhook():
    """
    Handle bounce/block notifications from Brevo (for PREMIUM blasts)
    
    Brevo sends webhooks for:
    - hard_bounce: Permanent delivery failure
    - soft_bounce: Temporary delivery failure
    - blocked: Email blocked by recipient
    - spam: Marked as spam by recipient
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.json
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        event = data.get('event')
        email = data.get('email')
        reason = data.get('reason', 'No reason provided')
        
        print(f"\n{'='*70}")
        print(f"🔔 BREVO WEBHOOK RECEIVED (Premium Blast)")
        print(f"{'='*70}")
        print(f"Event: {event}")
        print(f"Email: {email}")
        print(f"Reason: {reason}")
        print(f"{'='*70}\n")
        
        if not email:
            return jsonify({'error': 'Email address missing'}), 400
        
        # Handle different event types
        if event == 'hard_bounce':
            # Permanent failure - mark as hard_bounce
            update_recruiter_status(
                email=email,
                status='hard_bounce',
                bounce_type='hard',
                reason=f"Hard bounce: {reason}"
            )
            
            # Optional: Delete immediately for hard bounces
            # Uncomment the line below if you want to delete immediately
            # delete_recruiter(email)
            
        elif event == 'soft_bounce':
            # Temporary failure - mark as soft_bounce
            update_recruiter_status(
                email=email,
                status='soft_bounce',
                bounce_type='soft',
                reason=f"Soft bounce: {reason}"
            )
            
        elif event == 'blocked':
            # Email blocked by recipient or ISP
            update_recruiter_status(
                email=email,
                status='blocked',
                bounce_type='blocked',
                reason=f"Blocked: {reason}"
            )
            
        elif event == 'spam':
            # User marked email as spam - immediately block
            update_recruiter_status(
                email=email,
                status='blocked',
                bounce_type='spam',
                reason='Spam complaint received'
            )
            
        else:
            print(f"⚠️ Unhandled event type: {event}")
        
        return jsonify({'status': 'success', 'event': event}), 200
        
    except Exception as e:
        print(f"❌ Error handling Brevo webhook: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@webhooks_bp.route('/resend/bounce', methods=['POST', 'OPTIONS'])
def handle_resend_webhook():
    """
    Handle bounce notifications from Resend (for FREEMIUM blasts)
    
    Resend sends webhooks for:
    - email.bounced: Email bounced
    - email.complained: Spam complaint
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.json
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        event_type = data.get('type')
        event_data = data.get('data', {})
        
        # Extract email from 'to' array
        to_field = event_data.get('to', [])
        email = to_field[0] if isinstance(to_field, list) and len(to_field) > 0 else None
        
        print(f"\n{'='*70}")
        print(f"🔔 RESEND WEBHOOK RECEIVED (Freemium Blast)")
        print(f"{'='*70}")
        print(f"Event: {event_type}")
        print(f"Email: {email}")
        print(f"Data: {event_data}")
        print(f"{'='*70}\n")
        
        if not email:
            return jsonify({'error': 'Email address missing'}), 400
        
        # Handle different event types
        if event_type == 'email.bounced':
            # Email bounced - mark as hard_bounce
            bounce_type = event_data.get('bounce_type', 'hard')
            reason = event_data.get('bounce_reason', 'Email bounced')
            
            update_recruiter_status(
                email=email,
                status='hard_bounce',
                bounce_type=bounce_type,
                reason=f"Resend bounce: {reason}"
            )
            
        elif event_type == 'email.complained':
            # Spam complaint - immediately block
            update_recruiter_status(
                email=email,
                status='blocked',
                bounce_type='spam',
                reason='Spam complaint via Resend'
            )
        
        return jsonify({'status': 'success', 'event': event_type}), 200
        
    except Exception as e:
        print(f"❌ Error handling Resend webhook: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@webhooks_bp.route('/test', methods=['GET'])
def test_webhook():
    """Test endpoint to verify webhook routes are working"""
    return jsonify({
        'success': True,
        'message': 'Webhook routes are active',
        'endpoints': {
            'brevo_premium': '/api/webhooks/brevo/bounce',
            'resend_freemium': '/api/webhooks/resend/bounce'
        },
        'tables': {
            'freemium': 'freemium_recruiters',
            'premium_recruiters': 'recruiters',
            'premium_activity': 'recruiter_activity'
        },
        'supabase_configured': bool(SUPABASE_URL and SUPABASE_KEY)
    })

@webhooks_bp.route('/manual-bounce', methods=['POST'])
def manual_bounce():
    """
    Manually mark a recruiter email as bounced (for testing or manual intervention)
    
    Body: {
        "email": "recruiter@example.com",
        "status": "hard_bounce",
        "bounce_type": "hard",
        "reason": "Manual marking"
    }
    """
    try:
        data = request.json
        
        email = data.get('email')
        status = data.get('status', 'hard_bounce')
        bounce_type = data.get('bounce_type', 'hard')
        reason = data.get('reason', 'Manually marked as bounced')
        
        if not email:
            return jsonify({'error': 'Email address required'}), 400
        
        # Validate status
        valid_statuses = ['active', 'soft_bounce', 'hard_bounce', 'blocked', 'spam']
        if status not in valid_statuses:
            return jsonify({'error': f'Invalid status. Must be one of: {valid_statuses}'}), 400
        
        result = update_recruiter_status(email, status, bounce_type, reason)
        
        if result:
            return jsonify({
                'success': True,
                'message': f'Email {email} marked as {status}'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': f'Email {email} not found in any table'
            }), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500