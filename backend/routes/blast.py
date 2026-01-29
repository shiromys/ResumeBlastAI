# backend/routes/blast.py
from flask import Blueprint, request, jsonify
import os
from services.freemium_email_service import FreemiumEmailService
from services.recruiter_email_service import RecruiterEmailService

blast_bp = Blueprint('blast', __name__, url_prefix='/api/blast')

@blast_bp.route('/test', methods=['GET'])
def test_blast():
    """Test endpoint to check if blast routes are working"""
    return jsonify({
        'success': True,
        'message': 'Blast API is working',
        'brevo_configured': bool(os.getenv('BREVO_API_KEY')),
        'resend_configured': bool(os.getenv('RESEND_API_KEY')),
        'integration_type': 'Backend Direct Integration'
    })

@blast_bp.route('/freemium', methods=['POST', 'OPTIONS'])
def freemium_blast():
    """
    Trigger freemium blast - sends resume to 11 curated recruiters via Resend.com
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        user_id = data.get('user_id')
        resume_url = data.get('resume_url')
        
        if not resume_url:
            return jsonify({'error': 'resume_url is required'}), 400
        
        # Prepare candidate data
        candidate_data = {
            'candidate_name': data.get('candidate_name', 'Professional Candidate'),
            'candidate_email': data.get('candidate_email', ''),
            'candidate_phone': data.get('candidate_phone', ''),
            'job_role': data.get('job_role', 'Professional')
        }
        
        print(f"\n🎁 Freemium Blast Request:")
        print(f"   User ID: {user_id}")
        print(f"   Resume URL: {resume_url}")
        print(f"   Candidate: {candidate_data['candidate_name']}")
        
        # Initialize Freemium Email Service
        freemium_service = FreemiumEmailService()
        
        # Send the blast
        result = freemium_service.send_freemium_blast(
            candidate_data=candidate_data,
            resume_url=resume_url
        )
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': result.get('message', 'Freemium blast sent successfully'),
                'total_recipients': result.get('total', 0),
                'successful_sends': result.get('successful', 0),
                'failed_sends': result.get('failed', 0),
                'detailed_results': result.get('results', [])
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Freemium blast failed')
            }), 500
            
    except Exception as e:
        print(f"❌ Error in freemium_blast endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@blast_bp.route('/send', methods=['POST', 'OPTIONS'])
def send_blast():
    """
    Send paid blast to selected recruiters via Brevo
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Validate recipients
        recipients = data.get('recipients', [])
        if not recipients or len(recipients) == 0:
            return jsonify({'error': 'No recipients provided'}), 400
        
        # Prepare candidate data
        candidate_data = {
            'candidate_name': data.get('candidate_name', 'Professional Candidate'),
            'candidate_email': data.get('candidate_email', ''),
            'candidate_phone': data.get('candidate_phone', ''),
            'job_role': data.get('job_role', 'Professional'),
            'years_experience': data.get('years_experience', '0'),
            'key_skills': data.get('key_skills', 'Professional Skills'),
            'education_level': data.get('education_level', 'Not Specified'),
            'location': data.get('location', 'Remote'),
            'linkedin_url': data.get('linkedin_url', ''),
            'resume_url': data.get('resume_url', ''),
            'resume_name': data.get('resume_name', 'Resume.pdf')
        }
        
        print(f"\n📧 Paid Blast Request:")
        print(f"   Candidate: {candidate_data['candidate_name']}")
        print(f"   Recipients: {len(recipients)}")
        
        # Initialize Recruiter Email Service (Brevo for paid)
        email_service = RecruiterEmailService()
        
        # Send emails
        result = email_service.send_bulk_emails(
            candidate_data=candidate_data,
            recipients=recipients
        )
        
        return jsonify(result)
        
    except Exception as e:
        print(f"❌ Error in send_blast endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@blast_bp.route('/test-single', methods=['POST'])
def test_single_email():
    """Send a test email to verify configuration"""
    try:
        data = request.get_json()
        test_email = data.get('test_email')
        resume_url = data.get('resume_url', '')
        
        if not test_email:
            return jsonify({'error': 'test_email is required'}), 400
        
        # Use freemium service for test
        freemium_service = FreemiumEmailService()
        
        candidate_data = {
            'candidate_name': 'Test Candidate',
            'candidate_email': 'test@example.com',
            'candidate_phone': '123-456-7890',
            'job_role': 'Test Role'
        }
        
        recruiter_data = {
            'email': test_email,
            'name': 'Test Recruiter',
            'company': 'Test Company'
        }
        
        result = freemium_service.send_to_single_recruiter(
            candidate_data=candidate_data,
            recruiter_data=recruiter_data,
            resume_url=resume_url
        )
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500