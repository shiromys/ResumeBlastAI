# backend/services/freemium_email_service.py
# DATABASE-DRIVEN VERSION - Fetches recruiters from freemium_recruiters table
import os
import resend
import requests
import base64  # ✅ ADDED: Needed for encoding the attachment
from datetime import datetime

class FreemiumEmailService:
    """
    Handles freemium email blasts using Resend.com
    Fetches recruiters from database (freemium_recruiters table)
    """
    
    def __init__(self):
        """Initialize Resend API with API key from environment"""
        self.api_key = os.getenv('RESEND_API_KEY')
        if not self.api_key:
            raise ValueError("❌ RESEND_API_KEY not found in environment variables")
        
        # Set the Resend API key
        resend.api_key = self.api_key
        
        # Sender details
        self.sender_email = os.getenv('RESEND_SENDER_EMAIL', 'noreply@resumeblast.ai')
        self.sender_name = os.getenv('RESEND_SENDER_NAME', 'ResumeBlast.ai')
        
        # Supabase configuration for database access
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("❌ Supabase configuration missing for FreemiumEmailService")
        
        print("✅ FreemiumEmailService initialized with Resend.com (Database-Driven)")
        print(f"📧 Sender: {self.sender_name} <{self.sender_email}>")
        print(f"💾 Database: Connected to Supabase")
    
    def _get_db_headers(self):
        """Get Supabase headers for API requests"""
        return {
            'apikey': self.supabase_key,
            'Authorization': f'Bearer {self.supabase_key}',
            'Content-Type': 'application/json'
        }

    # ✅ ADDED: Helper method to download and encode the resume from Supabase URL
    def _download_resume(self, resume_url):
        """
        Download resume file from URL and convert to base64
        Returns: (base64_content, filename)
        """
        try:
            print(f"📥 Downloading resume from: {resume_url}")
            
            response = requests.get(resume_url, timeout=30)
            response.raise_for_status()
            
            # Get filename from URL, strip query params if any
            filename = resume_url.split('/')[-1].split('?')[0]
            if not filename or '.' not in filename:
                filename = "Resume.pdf"
            
            # Convert to base64
            base64_content = base64.b64encode(response.content).decode('utf-8')
            
            print(f"✅ Resume downloaded: {filename} ({len(base64_content)} bytes base64)")
            return base64_content, filename
            
        except Exception as e:
            print(f"❌ Error downloading resume: {str(e)}")
            raise Exception(f"Failed to download resume: {str(e)}")
    
    def fetch_freemium_recruiters(self):
        """
        Fetch active freemium recruiters from database
        Returns list of recruiter dictionaries
        """
        try:
            print("\n📊 Fetching freemium recruiters from database...")
            
            url = f"{self.supabase_url}/rest/v1/freemium_recruiters"
            params = {
                'is_active': 'eq.true',
                'order': 'sort_order.asc',
                'select': 'email,name,company,industry,location'
            }
            
            response = requests.get(url, headers=self._get_db_headers(), params=params)
            
            if response.status_code == 200:
                recruiters = response.json()
                
                if not recruiters or len(recruiters) == 0:
                    print("⚠️ WARNING: No active freemium recruiters found in database!")
                    return []
                
                print(f"✅ Fetched {len(recruiters)} active recruiters from database")
                return recruiters
            else:
                print(f"❌ Failed to fetch recruiters: HTTP {response.status_code}")
                return []
                
        except Exception as e:
            print(f"❌ Error fetching freemium recruiters from database: {str(e)}")
            return []
    
    def _generate_email_template(self, candidate_data, recruiter_data):
        """Generate professional HTML email template for freemium blast"""
        candidate_name = candidate_data.get('candidate_name', 'Professional Candidate')
        candidate_email = candidate_data.get('candidate_email', '')
        candidate_phone = candidate_data.get('candidate_phone', '')
        job_role = candidate_data.get('job_role', 'Professional')
        
        recruiter_name = recruiter_data.get('name', 'Recruiter')
        company_name = recruiter_data.get('company', 'Your Company')
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resume Submission - {candidate_name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">🎁 New Resume Submission</h1>
                            <p style="color: #D1FAE5; margin: 10px 0 0 0; font-size: 14px;">via ResumeBlast.ai (Freemium)</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="color: #374151; font-size: 16px; margin: 0 0 20px 0;">Dear {recruiter_name},</p>
                            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                                I hope this email finds you well. I am writing to inform about a candidate in our list matching your requirement for <strong>{job_role}</strong> opportunities at <strong>{company_name}</strong>.
                            </p>
                            <div style="background-color: #ECFDF5; border-left: 4px solid #10B981; padding: 20px; margin: 25px 0; border-radius: 4px;">
                                <h3 style="color: #059669; margin: 0 0 15px 0; font-size: 18px;">📋 Candidate Information</h3>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #6B7280; font-size: 14px; width: 40%;"><strong>Name:</strong></td>
                                        <td style="padding: 8px 0; color: #374151; font-size: 14px;">{candidate_name}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #6B7280; font-size: 14px;"><strong>Target Role:</strong></td>
                                        <td style="padding: 8px 0; color: #374151; font-size: 14px;">{job_role}</td>
                                    </tr>
                                    {f'<tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;"><strong>Email:</strong></td><td style="padding: 8px 0; color: #374151; font-size: 14px;">{candidate_email}</td></tr>' if candidate_email else ''}
                                    {f'<tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;"><strong>Phone:</strong></td><td style="padding: 8px 0; color: #374151; font-size: 14px;">{candidate_phone}</td></tr>' if candidate_phone else ''}
                                </table>
                            </div>
                            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 25px 0;">
                                I have attached the concerned resume for your review. I believe this aligns well with your needs. Kindly look into this and proceed further.
                            </p>
                            <p style="color: #374151; font-size: 16px; margin: 0;">Best regards,<br>Team Resumeblast.ai</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #F9FAFB; padding: 25px 30px; border-radius: 0 0 8px 8px; text-align: center;">
                            <p style="color: #6B7280; font-size: 13px; margin: 0 0 10px 0;">This resume was distributed via <strong style="color: #10B981;">ResumeBlast.ai</strong> (Freemium Plan)</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        """
        return html_content
    
    def send_to_single_recruiter(self, candidate_data, recruiter_data, resume_url):
        """
        Send resume to a single recruiter via Resend with Attachment
        """
        try:
            recruiter_email = recruiter_data['email']
            recruiter_name = recruiter_data.get('name', 'Recruiter')
            
            print(f"\n📧 Preparing email to: {recruiter_email}")
            
            # ✅ ADDED: Download and encode the resume file
            base64_content, filename = self._download_resume(resume_url)
            
            # Generate email content
            html_content = self._generate_email_template(candidate_data, recruiter_data)
            
            # ✅ UPDATED: Added the 'attachments' parameter for Resend API
            email_params = {
                "from": f"{self.sender_name} <{self.sender_email}>",
                "to": [recruiter_email],
                "subject": f"Resume Submission - {candidate_data.get('candidate_name', 'Candidate')} | {candidate_data.get('job_role', 'Professional')}",
                "html": html_content,
                "attachments": [
                    {
                        "filename": filename,
                        "content": base64_content
                    }
                ]
            }
            
            print(f"📤 Sending via Resend API with attachment: {filename}...")
            
            # Send email via Resend
            response = resend.Emails.send(email_params)
            
            print(f"✅ Email sent successfully!")
            print(f"   Recipient: {recruiter_name} ({recruiter_email})")
            print(f"   Message ID: {response['id']}")
            
            return {
                'success': True,
                'email': recruiter_email,
                'name': recruiter_name,
                'message_id': response['id']
            }
            
        except Exception as e:
            print(f"❌ Failed to send to {recruiter_email}: {str(e)}")
            return {
                'success': False,
                'email': recruiter_email,
                'error': str(e)
            }
    
    def send_freemium_blast(self, candidate_data, resume_url):
        """Send resume to all active freemium recruiters from database"""
        try:
            print("\n" + "="*70)
            print("🎁 FREEMIUM BLAST STARTED (Database-Driven - Resend.com)")
            print("="*70)
            
            if not resume_url:
                raise ValueError("Resume URL is required for the attachment")

            recruiters = self.fetch_freemium_recruiters()
            
            if not recruiters or len(recruiters) == 0:
                return {
                    'success': False,
                    'error': 'No active freemium recruiters found in database',
                    'total': 0, 'successful': 0, 'failed': 0, 'results': []
                }
            
            results = {'total': len(recruiters), 'successful': 0, 'failed': 0, 'results': []}
            
            for recruiter in recruiters:
                result = self.send_to_single_recruiter(
                    candidate_data=candidate_data,
                    recruiter_data=recruiter,
                    resume_url=resume_url
                )
                results['results'].append(result)
                if result['success']: results['successful'] += 1
                else: results['failed'] += 1
            
            print(f"\n✅ FREEMIUM BLAST COMPLETE: {results['successful']}/{results['total']} sent")
            
            return {
                'success': True,
                'message': f"Freemium blast completed: {results['successful']}/{results['total']} sent",
                **results
            }
            
        except Exception as e:
            print(f"\n❌ FREEMIUM BLAST ERROR: {str(e)}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}

    def test_connection(self):
        """Test Resend API connection and database access"""
        try:
            recruiters = self.fetch_freemium_recruiters()
            response = resend.Emails.send({
                "from": f"{self.sender_name} <{self.sender_email}>",
                "to": ["test@resend.dev"],
                "subject": "Test Connection - ResumeBlast.ai",
                "html": "<p>This is a test email</p>"
            })
            return {'success': True, 'database_recruiters': len(recruiters), 'resend_message_id': response['id']}
        except Exception as e:
            return {'success': False, 'error': str(e)}