from flask import Blueprint, request, jsonify
import os
import requests
import sys
from datetime import datetime

# Import Services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.recruiter_email_service import RecruiterEmailService
from services.freemium_email_service import FreemiumEmailService

blast_bp = Blueprint('blast', __name__)

# Initialize services
email_service = RecruiterEmailService()
freemium_service = FreemiumEmailService()

# Database Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

def get_db_headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }

def fetch_candidate_details_from_db(resume_url):
    """
    Fetch ALL AI-analyzed candidate details (Name, Email, Role) 
    from the resumes table using the resume URL.
    """
    try:
        if not resume_url:
            return None, None, None

        query_url = f"{SUPABASE_URL}/rest/v1/resumes?file_url=eq.{resume_url}&select=analysis_data"
        
        response = requests.get(query_url, headers=get_db_headers())
        
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0:
                analysis = data[0].get('analysis_data', {})
                
                db_name = analysis.get('candidate_name')
                db_email = analysis.get('candidate_email')
                db_role = analysis.get('detected_role')
                
                if db_name in ['Not Found', None, '']: db_name = None
                if db_email in ['Not Found', None, '']: db_email = None
                if db_role in ['Not Found', None, '']: db_role = None
                
                return db_name, db_email, db_role
                
        return None, None, None
    except Exception as e:
        print(f"⚠️ Warning: Could not fetch from DB: {str(e)}")
        return None, None, None


def fetch_recruiters_ordered(limit):
    """
    ✅ FIXED: Fetch FIRST N recruiters from 'recruiters' table.
    Ensures UNIQUE email addresses are returned to prevent duplicate emails.
    """
    try:
        # Fetch slightly more than the limit to account for potential duplicates being filtered out
        fetch_limit = limit + 50
        query_url = f"{SUPABASE_URL}/rest/v1/recruiters?select=email&is_active=eq.true&email_status=eq.active&order=id.asc&limit={fetch_limit}"
        
        print(f"📡 Fetching recruiters from database (Filtering for unique emails)...")
        response = requests.get(query_url, headers=get_db_headers())
        
        if response.status_code == 200:
            recruiters_raw = response.json()
            
            seen_emails = set()
            formatted_recruiters = []
            
            for r in recruiters_raw:
                email = r.get('email', '').strip().lower()
                if email and email not in seen_emails:
                    seen_emails.add(email)
                    formatted_recruiters.append({
                        'email': email,
                        'name': 'Hiring Manager',
                        'company': 'Verified Firm'
                    })
                
                # Respect the dynamic limit decided by the plan
                if len(formatted_recruiters) >= limit:
                    break
            
            print(f"✅ Fetched {len(formatted_recruiters)} unique recruiters (Requested: {limit})")
            return formatted_recruiters
        else:
            print(f"❌ Failed to fetch recruiters: {response.status_code}")
            return []
            
    except Exception as e:
        print(f"❌ Error fetching recruiters: {str(e)}")
        return []


# =========================================================
# PAID BLAST ENDPOINT (ENFORCED FOR BASIC & PRO PLANS)
# =========================================================
@blast_bp.route('/api/blast/send', methods=['POST'])
def send_blast():
    """
    ✅ FIXED: Send paid blast with proper:
    - Recruiter limit enforcement (first N recruiters by ID)
    - Database campaign update
    - Error handling
    """
    try:
        print("\n" + "="*70)
        print("🚀 PAID BLAST REQUEST RECEIVED")
        print("="*70)
        
        blast_data = request.json
        
        if not blast_data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        # 1. IDENTIFY PLAN AND FETCH LIMIT FROM DATABASE
        plan_name = blast_data.get('plan_name', 'basic').lower()
        campaign_id = blast_data.get('campaign_id')
        
        print(f"📦 Plan Detected: {plan_name.upper()}")
        print(f"🆔 Campaign ID: {campaign_id}")
        
        # ✅ DYNAMIC: Fetch Recruiter Limit from Database
        plan_limit = 250  # Default fallback
        try:
            plan_query = f"{SUPABASE_URL}/rest/v1/plans?key_name=eq.{plan_name}&select=recruiter_limit"
            plan_resp = requests.get(plan_query, headers=get_db_headers())
            
            if plan_resp.status_code == 200 and plan_resp.json():
                plan_limit = plan_resp.json()[0]['recruiter_limit']
                print(f"✅ Fetched plan limit from database: {plan_limit}")
            else:
                # Fallback
                plan_limit = 500 if plan_name == 'pro' else 250
                print(f"⚠️ Using fallback limit: {plan_limit}")
        except Exception as e:
            plan_limit = 500 if plan_name == 'pro' else 250
            print(f"⚠️ Error fetching plan, using fallback: {plan_limit} ({str(e)})")
            
        print(f"🎯 Enforced Recruiter Limit: {plan_limit}")

        # 2. ✅ FIX: FETCH UNIQUE RECRUITERS FROM DATABASE
        recruiters = fetch_recruiters_ordered(plan_limit)
        
        if not recruiters or len(recruiters) == 0:
            return jsonify({
                'success': False, 
                'error': 'No active recruiters found in database'
            }), 400
        
        print(f"✅ Selected {len(recruiters)} recruiters for blast")
        
        # 3. GET RESUME URL
        resume_url = blast_data.get('resume_url')
        if not resume_url:
            return jsonify({'success': False, 'error': 'Resume URL is required'}), 400
        
        resume_name = blast_data.get('resume_name', 'Resume.pdf')
        
        # 4. FETCH ACCURATE DETAILS FROM DATABASE
        print("🔎 Fetching accurate candidate details from Database...")
        db_name, db_email, db_role = fetch_candidate_details_from_db(resume_url)
        
        final_candidate_name = db_name if db_name else blast_data.get('candidate_name', 'Professional Candidate')
        final_candidate_email = db_email if db_email else blast_data.get('candidate_email', '')
        final_job_role = db_role if db_role else blast_data.get('job_role', 'Professional')

        candidate_data = {
            'candidate_name': final_candidate_name,
            'candidate_email': final_candidate_email,
            'candidate_phone': blast_data.get('candidate_phone', ''),
            'job_role': final_job_role,
            'years_experience': blast_data.get('years_experience', '0'),
            'key_skills': blast_data.get('key_skills', 'Professional Skills'),
            'education_level': blast_data.get('education_level', 'Not Specified'),
            'location': blast_data.get('location', 'Remote'),
            'linkedin_url': blast_data.get('linkedin_url', '')
        }
        
        print(f"\n📧 Starting {plan_name} email blast to {len(recruiters)} recruiters via Brevo...")
        print(f"   Candidate: {final_candidate_name}")
        print(f"   Email: {final_candidate_email}")
        print(f"   Role: {final_job_role}")
        
        # 5. TRIGGER EMAIL SERVICE
        blast_results = email_service.send_resume_blast(
            candidate_data=candidate_data,
            recruiters_list=recruiters,
            resume_url=resume_url,
            resume_name=resume_name
        )

        # 6. ✅ FIX: UPDATE CAMPAIGN IN DATABASE WITH BETTER ERROR HANDLING
        if campaign_id:
            print(f"\n💾 Updating Campaign ID {campaign_id} in Database...")
            update_payload = {
                'status': 'completed',
                'recipients_count': blast_results['successful'],
                'completed_at': datetime.utcnow().isoformat(),
                'result_data': {
                    'total': blast_results['total'],
                    'successful': blast_results['successful'],
                    'failed': blast_results['failed'],
                    'plan_used': plan_name,
                    'timestamp': datetime.utcnow().isoformat()
                }
            }
            
            try:
                update_url = f"{SUPABASE_URL}/rest/v1/blast_campaigns?id=eq.{campaign_id}"
                patch_resp = requests.patch(
                    update_url, 
                    json=update_payload, 
                    headers=get_db_headers(),
                    timeout=10
                )
                
                print(f"   Database update status: {patch_resp.status_code}")
                
                if patch_resp.status_code in [200, 204]:
                    print(f"   ✅ Campaign updated successfully")
                else:
                    print(f"   ⚠️ Campaign update failed: {patch_resp.text}")
                    
            except Exception as e:
                print(f"   ❌ Error updating campaign: {str(e)}")
        else:
            print("⚠️ No campaign_id provided - skipping database update")
        
        # 7. PREPARE RESPONSE
        response_data = {
            'success': True,
            'message': f'{plan_name.capitalize()} Blast completed: {blast_results["successful"]} sent, {blast_results["failed"]} failed',
            'total_recipients': blast_results['total'],
            'successful_sends': blast_results['successful'],
            'failed_sends': blast_results['failed'],
            'plan_used': plan_name,
            'plan_limit_enforced': plan_limit,
            'success_rate': f"{(blast_results['successful']/blast_results['total']*100):.1f}%" if blast_results['total'] > 0 else "0%",
            'detailed_results': blast_results['results']
        }
        
        status_code = 500 if blast_results['successful'] == 0 else (207 if blast_results['failed'] > 0 else 200)
        
        print(f"\n{'='*70}")
        print(f"✅ {plan_name.upper()} BLAST COMPLETE")
        print(f"   Total Recipients: {blast_results['total']}")
        print(f"   Successful: {blast_results['successful']}")
        print(f"   Failed: {blast_results['failed']}")
        print(f"   Plan Limit Enforced: {plan_limit}")
        print(f"{'='*70}\n")
        
        return jsonify(response_data), status_code
        
    except Exception as e:
        print(f"\n{'='*70}")
        print(f"❌ BLAST ERROR: {str(e)}")
        print(f"{'='*70}\n")
        import traceback
        traceback.print_exc()
        
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Failed to send resume blast'
        }), 500


# =========================================================
# FREEMIUM BLAST ENDPOINT
# =========================================================
@blast_bp.route('/api/blast/freemium', methods=['POST'])
def send_freemium_blast():
    """
    Send ONE-TIME free blast to specific recruiters via Resend.com.
    """
    try:
        data = request.json
        user_id = data.get('user_id')
        resume_url = data.get('resume_url')
        
        if not user_id or not resume_url:
            return jsonify({
                'success': False, 
                'error': 'Missing user_id or resume_url'
            }), 400

        print(f"\n🎁 Checking Freemium Eligibility for User: {user_id}")

        # 1. Check if user has already sent ANY blast
        check_url = f"{SUPABASE_URL}/rest/v1/blast_campaigns?user_id=eq.{user_id}&select=id"
        check_resp = requests.get(check_url, headers=get_db_headers())
        
        if check_resp.status_code != 200:
            return jsonify({
                'success': False,
                'error': 'Failed to check eligibility'
            }), 500
        
        previous_blasts = check_resp.json()
        
        if len(previous_blasts) > 0:
            print("❌ User not eligible: Already has blast history")
            return jsonify({
                'success': False, 
                'error': 'Freemium plan already used. Please upgrade to a paid plan.'
            }), 403

        print("✅ User is eligible for Freemium Blast")

        # 2. Fetch User/Candidate Data from DB
        db_name, db_email, db_role = fetch_candidate_details_from_db(resume_url)
        
        candidate_data = {
            'candidate_name': db_name or data.get('candidate_name', 'Candidate'),
            'candidate_email': db_email or data.get('candidate_email', ''),
            'candidate_phone': data.get('candidate_phone', ''),
            'job_role': db_role or data.get('job_role', 'Professional')
        }
        
        # 3. Send using Freemium Service (Resend.com)
        result = freemium_service.send_freemium_blast(candidate_data, resume_url)

        if not result['success']:
            return jsonify(result), 500

        # 4. Log the campaign in DB
        print(f"\n💾 Logging freemium campaign to database...")
        log_payload = {
            'user_id': user_id,
            'status': 'completed',
            'recipients_count': result['total'],
            'industry': 'Freemium',
            'initiated_at': datetime.utcnow().isoformat(),
            'completed_at': datetime.utcnow().isoformat(),
            'result_data': result
        }
        
        log_response = requests.post(
            f"{SUPABASE_URL}/rest/v1/blast_campaigns",
            json=log_payload,
            headers=get_db_headers()
        )
        
        if log_response.status_code in [200, 201]:
            print("✅ Campaign logged successfully")
        else:
            print(f"⚠️ Warning: Could not log campaign: {log_response.status_code}")

        return jsonify({
            'success': True,
            'message': 'Freemium blast sent successfully!',
            'details': result
        }), 200

    except Exception as e:
        print(f"❌ Freemium Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False, 
            'error': str(e)
        }), 500


# =========================================================
# TEST ENDPOINTS
# =========================================================
@blast_bp.route('/api/blast/test', methods=['GET'])
def test_blast():
    brevo_configured = bool(os.getenv('BREVO_API_KEY'))
    resend_configured = bool(os.getenv('RESEND_API_KEY'))
    return jsonify({
        'success': True,
        'message': 'Blast API is working',
        'brevo_configured': brevo_configured,
        'resend_configured': resend_configured,
        'integration_type': 'Dual (Brevo for Paid, Resend for Freemium)',
        'timestamp': datetime.utcnow().isoformat()
    }), 200


@blast_bp.route('/api/blast/test-single', methods=['POST'])
def test_single_email():
    try:
        data = request.json
        test_email = data.get('test_email', 'test@example.com')
        
        candidate_data = {
            'candidate_name': 'Test Candidate',
            'candidate_email': 'test@resumeblast.ai',
            'candidate_phone': '+1-555-0100',
            'job_role': 'Software Engineer',
            'years_experience': '5',
            'key_skills': 'Python, React, AWS',
            'education_level': "Bachelor's Degree",
            'location': 'Remote',
            'linkedin_url': 'https://linkedin.com/in/test'
        }
        
        recruiter_data = {
            'email': test_email,
            'name': 'Test Recruiter',
            'company': 'Test Company Inc.'
        }
        
        resume_url = data.get('resume_url', 'https://example.com/sample-resume.pdf')
        resume_name = 'Test_Resume.pdf'
        
        result = email_service.send_resume_to_recruiter(
            candidate_data=candidate_data,
            recruiter_data=recruiter_data,
            resume_url=resume_url,
            resume_name=resume_name
        )
        
        if result['success']:
            return jsonify({'success': True, 'message_id': result['message_id']}), 200
        else:
            return jsonify({'success': False, 'error': result['error']}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500