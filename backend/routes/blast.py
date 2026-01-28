# backend/routes/blast.py
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
                
                print(f"✅ Fetched from DB -> Name: {db_name}, Email: {db_email}, Role: {db_role}")
                return db_name, db_email, db_role
                
        return None, None, None
    except Exception as e:
        print(f"⚠️ Warning: Could not fetch from DB: {str(e)}")
        return None, None, None


# =========================================================
# PAID BLAST ENDPOINT (EXISTING - UNCHANGED)
# =========================================================
@blast_bp.route('/api/blast/send', methods=['POST'])
def send_blast():
    """
    Send paid blast to recruiters using Brevo ($149 users)
    """
    try:
        print("\n" + "="*70)
        print("🚀 PAID BLAST REQUEST RECEIVED")
        print("="*70)
        
        blast_data = request.json
        
        if not blast_data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        recipients = blast_data.get('recipients', [])
        if not recipients:
            return jsonify({'success': False, 'error': 'At least one recipient is required'}), 400
        
        resume_url = blast_data.get('resume_url')
        if not resume_url:
            return jsonify({'success': False, 'error': 'Resume URL is required'}), 400
        
        resume_name = blast_data.get('resume_name', 'Resume.pdf')
        
        print("🔎 Fetching accurate candidate details from Database...")
        db_name, db_email, db_role = fetch_candidate_details_from_db(resume_url)
        
        final_candidate_name = db_name if db_name else blast_data.get('candidate_name', 'Professional Candidate')
        final_candidate_email = db_email if db_email else blast_data.get('candidate_email', '')
        final_job_role = db_role if db_role else blast_data.get('job_role', 'Professional')
        
        print(f"📊 Final Blast Details:")
        print(f"   Candidate: {final_candidate_name}")
        print(f"   Email: {final_candidate_email} (Source: {'DB' if db_email else 'Frontend'})")
        print(f"   Role: {final_job_role}")
        print(f"   Recipients: {len(recipients)}")

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
        
        print(f"\n📨 Starting email blast to {len(recipients)} recruiters...")
        
        blast_results = email_service.send_resume_blast(
            candidate_data=candidate_data,
            recruiters_list=recipients,
            resume_url=resume_url,
            resume_name=resume_name
        )
        
        response_data = {
            'success': True,
            'message': f'Blast completed: {blast_results["successful"]} sent, {blast_results["failed"]} failed',
            'total_recipients': blast_results['total'],
            'successful_sends': blast_results['successful'],
            'failed_sends': blast_results['failed'],
            'success_rate': f"{(blast_results['successful']/blast_results['total']*100):.1f}%",
            'detailed_results': blast_results['results']
        }
        
        status_code = 500 if blast_results['successful'] == 0 else (207 if blast_results['failed'] > 0 else 200)
        
        print(f"\n{'='*70}")
        print(f"✅ BLAST COMPLETE")
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
# ✅ FREEMIUM BLAST ENDPOINT (RESEND.COM)
# =========================================================
@blast_bp.route('/api/blast/freemium', methods=['POST'])
def send_freemium_blast():
    """
    Send ONE-TIME free blast to 11 specific recruiters via Resend.com
    Only available for new users who have never sent a blast before.
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
                'error': 'Freemium plan already used. Please upgrade to Premium for $149.'
            }), 403

        print("✅ User is eligible for Freemium Blast")

        # 2. Fetch User/Candidate Data from DB
        db_name, db_email, db_role = fetch_candidate_details_from_db(resume_url)
        
        # Prepare candidate data with DB priority
        candidate_data = {
            'candidate_name': db_name or data.get('candidate_name', 'Candidate'),
            'candidate_email': db_email or data.get('candidate_email', ''),
            'candidate_phone': data.get('candidate_phone', ''),
            'job_role': db_role or data.get('job_role', 'Professional')
        }
        
        print(f"📋 Candidate Data for Freemium Blast:")
        print(f"   Name: {candidate_data['candidate_name']}")
        print(f"   Email: {candidate_data['candidate_email']}")
        print(f"   Role: {candidate_data['job_role']}")

        # 3. Send using Freemium Service (Resend.com)
        result = freemium_service.send_freemium_blast(candidate_data, resume_url)

        if not result['success']:
            return jsonify(result), 500

        # 4. Log the campaign in DB so they can't use it again
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
    """Test blast API configuration"""
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
    """Send a test email (for debugging)"""
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
        
        print(f"\n🧪 Sending test email to: {test_email}")
        
        result = email_service.send_resume_to_recruiter(
            candidate_data=candidate_data,
            recruiter_data=recruiter_data,
            resume_url=resume_url,
            resume_name=resume_name
        )
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': f'Test email sent successfully to {test_email}',
                'message_id': result['message_id']
            }), 200
        else:
            return jsonify({
                'success': False, 
                'error': result['error']
            }), 500
            
    except Exception as e:
        print(f"❌ Test email error: {str(e)}")
        return jsonify({
            'success': False, 
            'error': str(e)
        }), 500


@blast_bp.route('/api/blast/test-freemium', methods=['GET'])
def test_freemium():
    """Test Resend.com freemium service connection"""
    try:
        result = freemium_service.test_connection()
        return jsonify(result), 200 if result['success'] else 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500