# backend/routes/webhooks.py
# ============================================================
# CHANGES IN THIS FILE:
#   1. Added handle_brevo_email_events() - new endpoint /api/webhooks/brevo/events
#      This receives delivered/opened/clicked/bounced events from Brevo
#      and updates the blast_campaigns table counters in real-time.
#   2. Added _update_blast_campaign_counter() helper function
#   3. Updated /test endpoint to list the new endpoint
#   ALL EXISTING CODE IS UNTOUCHED
# ============================================================

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

# ============================================================
# EXISTING FUNCTION - UNTOUCHED
# ============================================================
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

# ============================================================
# EXISTING FUNCTION - UNTOUCHED
# ============================================================
def delete_recruiter(email):
    """
    Permanently delete a recruiter from ALL THREE tables
    """
    try:
        params = {'email': f'eq.{email}'}
        deleted_count = 0
        
        url1 = f"{SUPABASE_URL}/rest/v1/freemium_recruiters"
        response1 = requests.delete(url1, headers=get_supabase_headers(), params=params)
        if response1.status_code in [200, 204]:
            print(f"✅ Deleted {email} from freemium_recruiters")
            deleted_count += 1
        
        url2 = f"{SUPABASE_URL}/rest/v1/recruiters"
        response2 = requests.delete(url2, headers=get_supabase_headers(), params=params)
        if response2.status_code in [200, 204]:
            print(f"✅ Deleted {email} from recruiters")
            deleted_count += 1
        
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


# ============================================================
# NEW HELPER FUNCTION
# Updates delivered/opened/clicked/bounced counters on blast_campaigns
# campaign_id here is the 'id' (UUID) of the blast_campaigns row
# which you store as a Brevo tag when sending
# ============================================================
def _update_blast_campaign_counter(campaign_id, field, increment=1):
    """
    Increments a counter column on the blast_campaigns table.
    
    Args:
        campaign_id: The UUID of the blast_campaigns row (stored as Brevo tag)
        field: Column name to increment (delivered_count, opened_count, etc.)
        increment: How much to add (default 1)
    """
    try:
        if not campaign_id:
            return False

        # Step 1: Fetch current value
        fetch_url = (
            f"{SUPABASE_URL}/rest/v1/blast_campaigns"
            f"?id=eq.{campaign_id}"
            f"&select=id,{field}"
        )
        resp = requests.get(fetch_url, headers=get_supabase_headers())

        if resp.status_code != 200 or not resp.json():
            print(f"⚠️ blast_campaigns row not found for campaign_id: {campaign_id}")
            return False

        row = resp.json()[0]
        current = row.get(field, 0) or 0
        new_value = current + increment

        # Step 2: Patch with new value
        patch_url = f"{SUPABASE_URL}/rest/v1/blast_campaigns?id=eq.{campaign_id}"
        patch_resp = requests.patch(
            patch_url,
            headers=get_supabase_headers(),
            json={field: new_value}
        )

        if patch_resp.status_code in [200, 204]:
            print(f"✅ {field} updated: {current} → {new_value} for campaign {campaign_id}")
            return True
        else:
            print(f"❌ Failed to update {field}: {patch_resp.status_code} - {patch_resp.text}")
            return False

    except Exception as e:
        print(f"❌ _update_blast_campaign_counter error: {str(e)}")
        traceback.print_exc()
        return False


# ============================================================
# EXISTING ROUTE - UNTOUCHED
# ============================================================
@webhooks_bp.route('/brevo/bounce', methods=['POST', 'OPTIONS'])
def handle_brevo_webhook():
    """
    Handle bounce/block notifications from Brevo (for PREMIUM blasts)
    Brevo sends webhooks for: hard_bounce, soft_bounce, blocked, spam
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
        
        if event == 'hard_bounce':
            update_recruiter_status(email=email, status='hard_bounce', bounce_type='hard', reason=f"Hard bounce: {reason}")
        elif event == 'soft_bounce':
            update_recruiter_status(email=email, status='soft_bounce', bounce_type='soft', reason=f"Soft bounce: {reason}")
        elif event == 'blocked':
            update_recruiter_status(email=email, status='blocked', bounce_type='blocked', reason=f"Blocked: {reason}")
        elif event == 'spam':
            update_recruiter_status(email=email, status='blocked', bounce_type='spam', reason='Spam complaint received')
        else:
            print(f"⚠️ Unhandled event type: {event}")
        
        return jsonify({'status': 'success', 'event': event}), 200
        
    except Exception as e:
        print(f"❌ Error handling Brevo webhook: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ============================================================
# NEW ROUTE: /api/webhooks/brevo/events
# Register THIS URL in Brevo Dashboard → Settings → Webhooks
# Events to select: delivered, opened, click, hard_bounce,
#                   soft_bounce, blocked, spam, unsubscribed
# ============================================================
@webhooks_bp.route('/brevo/events', methods=['POST', 'OPTIONS'])
def handle_brevo_email_events():
    """
    Receives ALL real-time email events from Brevo.
    
    How it works:
    - When you send emails via Brevo API, you set "tags": [campaign_id]
    - Brevo sends this tag back in every webhook event as 'tag' field
    - This function reads that tag (= campaign UUID) and updates blast_campaigns counters
    
    Event types handled:
    - delivered  → increments delivered_count
    - opened     → increments opened_count  
    - click      → increments clicked_count
    - hard_bounce → increments bounced_count + marks recruiter
    - soft_bounce → increments bounced_count + marks recruiter
    - blocked    → marks recruiter as blocked
    - spam       → increments spam_count + marks recruiter
    - unsubscribed → marks recruiter as blocked
    """
    if request.method == 'OPTIONS':
        return '', 204

    try:
        data = request.json

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        event   = data.get('event', '')
        email   = data.get('email', '')
        
        # 'tag' in Brevo webhook = the tag you set when sending
        # You will set "tags": [blast_campaign_id] in your RecruiterEmailService
        # Brevo sends it back as a string in the 'tag' field
        tag         = data.get('tag', '')
        campaign_id = tag.strip() if tag else None

        print(f"\n{'='*70}")
        print(f"🔔 BREVO EMAIL EVENT RECEIVED")
        print(f"{'='*70}")
        print(f"  Event:       {event}")
        print(f"  Email:       {email}")
        print(f"  Campaign ID: {campaign_id}")
        print(f"  Raw data:    {data}")
        print(f"{'='*70}\n")

        # ── ENGAGEMENT EVENTS ──────────────────────────────────────
        if event == 'delivered':
            if campaign_id:
                _update_blast_campaign_counter(campaign_id, 'delivered_count')

        elif event == 'opened':
            if campaign_id:
                _update_blast_campaign_counter(campaign_id, 'opened_count')

        elif event == 'click':
            # Note: Brevo uses 'click' (not 'clicked')
            if campaign_id:
                _update_blast_campaign_counter(campaign_id, 'clicked_count')

        # ── NEGATIVE EVENTS ───────────────────────────────────────
        elif event == 'hard_bounce':
            if campaign_id:
                _update_blast_campaign_counter(campaign_id, 'bounced_count')
            if email:
                update_recruiter_status(
                    email=email,
                    status='hard_bounce',
                    bounce_type='hard',
                    reason=f"Hard bounce via Brevo event: {data.get('reason', '')}"
                )

        elif event == 'soft_bounce':
            if campaign_id:
                _update_blast_campaign_counter(campaign_id, 'bounced_count')
            if email:
                update_recruiter_status(
                    email=email,
                    status='soft_bounce',
                    bounce_type='soft',
                    reason=f"Soft bounce via Brevo event: {data.get('reason', '')}"
                )

        elif event == 'blocked':
            if email:
                update_recruiter_status(
                    email=email,
                    status='blocked',
                    bounce_type='blocked',
                    reason=f"Blocked via Brevo event: {data.get('reason', '')}"
                )

        elif event == 'spam':
            if campaign_id:
                _update_blast_campaign_counter(campaign_id, 'spam_count')
            if email:
                update_recruiter_status(
                    email=email,
                    status='blocked',
                    bounce_type='spam',
                    reason='Spam complaint via Brevo events webhook'
                )

        elif event == 'unsubscribed':
            if email:
                update_recruiter_status(
                    email=email,
                    status='blocked',
                    bounce_type='unsubscribed',
                    reason='Unsubscribed via Brevo events webhook'
                )

        else:
            print(f"⚠️ Unhandled Brevo event type: {event}")

        return jsonify({'status': 'ok', 'event': event, 'campaign_id': campaign_id}), 200

    except Exception as e:
        print(f"❌ Error handling Brevo email event: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ============================================================
# EXISTING ROUTE - UNTOUCHED
# ============================================================
@webhooks_bp.route('/resend/bounce', methods=['POST', 'OPTIONS'])
def handle_resend_webhook():
    """
    Handle bounce notifications from Resend (for FREEMIUM blasts)
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.json
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        event_type = data.get('type')
        event_data = data.get('data', {})
        
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
        
        if event_type == 'email.bounced':
            bounce_type = event_data.get('bounce_type', 'hard')
            reason = event_data.get('bounce_reason', 'Email bounced')
            update_recruiter_status(email=email, status='hard_bounce', bounce_type=bounce_type, reason=f"Resend bounce: {reason}")
            
        elif event_type == 'email.complained':
            update_recruiter_status(email=email, status='blocked', bounce_type='spam', reason='Spam complaint via Resend')
        
        return jsonify({'status': 'success', 'event': event_type}), 200
        
    except Exception as e:
        print(f"❌ Error handling Resend webhook: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ============================================================
# UPDATED TEST ENDPOINT - lists all endpoints including new one
# ============================================================
@webhooks_bp.route('/test', methods=['GET'])
def test_webhook():
    """Test endpoint to verify webhook routes are working"""
    return jsonify({
        'success': True,
        'message': 'Webhook routes are active',
        'endpoints': {
            'brevo_bounce_only': '/api/webhooks/brevo/bounce',
            'brevo_all_events':  '/api/webhooks/brevo/events',   # ← NEW: use this in Brevo dashboard
            'resend_freemium':   '/api/webhooks/resend/bounce'
        },
        'brevo_events_tracked': ['delivered', 'opened', 'click', 'hard_bounce', 'soft_bounce', 'blocked', 'spam', 'unsubscribed'],
        'tables': {
            'freemium': 'freemium_recruiters',
            'premium_recruiters': 'recruiters',
            'premium_activity': 'recruiter_activity',
            'blast_stats': 'blast_campaigns'
        },
        'supabase_configured': bool(SUPABASE_URL and SUPABASE_KEY)
    })


# ============================================================
# EXISTING ROUTE - UNTOUCHED
# ============================================================
@webhooks_bp.route('/manual-bounce', methods=['POST'])
def manual_bounce():
    """
    Manually mark a recruiter email as bounced (for testing or manual intervention)
    """
    try:
        data = request.json
        
        email = data.get('email')
        status = data.get('status', 'hard_bounce')
        bounce_type = data.get('bounce_type', 'hard')
        reason = data.get('reason', 'Manually marked as bounced')
        
        if not email:
            return jsonify({'error': 'Email address required'}), 400
        
        valid_statuses = ['active', 'soft_bounce', 'hard_bounce', 'blocked', 'spam']
        if status not in valid_statuses:
            return jsonify({'error': f'Invalid status. Must be one of: {valid_statuses}'}), 400
        
        result = update_recruiter_status(email, status, bounce_type, reason)
        
        if result:
            return jsonify({'success': True, 'message': f'Email {email} marked as {status}'}), 200
        else:
            return jsonify({'success': False, 'message': f'Email {email} not found in any table'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500