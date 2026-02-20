# backend/services/recruiter_email_service.py
# ============================================================
# CHANGES IN THIS FILE:
#   1. FIXED: Conditionally adding "tags" to email_payload.
#      If campaign_id is missing/None, the "tags" key is NOT sent.
#      This prevents the "Brevo API error (400): tags is blank" error.
#   ALL OTHER LOGIC IS COMPLETELY UNTOUCHED
# ============================================================

import os
import requests
import base64
from datetime import datetime

class RecruiterEmailService:
    """
    Service for sending resume emails directly to recruiters via Brevo API
    Replaces Make.com webhook integration
    """
    
    def __init__(self):
        self.api_key = os.getenv('BREVO_API_KEY')
        self.sender_email = os.getenv('BREVO_SENDER_EMAIL', 'noreply@resumeblast.ai')
        self.sender_name = os.getenv('BREVO_SENDER_NAME', 'ResumeBlast.ai')
        self.api_url = 'https://api.brevo.com/v3/smtp/email'
        
    def _get_headers(self):
        """Get headers for Brevo API requests"""
        return {
            'accept': 'application/json',
            'api-key': self.api_key,
            'content-type': 'application/json'
        }
    
    def _download_resume(self, resume_url):
        """
        Download resume file from URL and convert to base64
        Returns: (base64_content, filename, mime_type)
        """
        try:
            print(f"📥 Downloading resume from: {resume_url}")
            
            response = requests.get(resume_url, timeout=30)
            response.raise_for_status()
            
            # Get filename from URL
            filename = resume_url.split('/')[-1]
            
            # Determine MIME type based on file extension
            if filename.lower().endswith('.pdf'):
                mime_type = 'application/pdf'
            elif filename.lower().endswith('.docx'):
                mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            elif filename.lower().endswith('.doc'):
                mime_type = 'application/msword'
            elif filename.lower().endswith('.txt'):
                mime_type = 'text/plain'
            else:
                mime_type = 'application/octet-stream'
            
            # Convert to base64
            base64_content = base64.b64encode(response.content).decode('utf-8')
            
            print(f"✅ Resume downloaded: {filename} ({len(base64_content)} bytes base64)")
            return base64_content, filename, mime_type
            
        except Exception as e:
            print(f"❌ Error downloading resume: {str(e)}")
            raise Exception(f"Failed to download resume: {str(e)}")
    
    def _generate_email_template(self, candidate_data, recruiter_data):
        """
        Generate professional email HTML template
        """
        # Ensure Name is Title Cased (e.g., "shuchithar" -> "Shuchithar")
        raw_name = candidate_data.get('candidate_name', 'Professional Candidate')
        candidate_name = raw_name.title() if raw_name else 'Professional Candidate'
        
        job_role = candidate_data.get('job_role', 'Professional')
        
        recruiter_name = recruiter_data.get('name', 'Hiring Manager')
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resume - {candidate_name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background-color: #f9fafb;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    
                    <tr>
                        <td style="background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%); padding: 40px 30px; border-radius: 12px 12px 0 0;">
                            <h1 style="color: #ffffff; margin: 0 0 10px 0; font-size: 28px; font-weight: 700;">
                                 New Candidate Profile
                            </h1>
                            <p style="color: #FEE2E2; margin: 0; font-size: 16px;">
                                Powered by ResumeBlast.ai
                            </p>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 30px 40px 20px;">
                            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0;">
                                Dear <strong>{recruiter_name}</strong>,
                            </p>
                            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 15px 0 0 0;">
                                I hope this message finds you well. I am reaching out to present a qualified candidate who may be an excellent fit for opportunities at your firm.
                            </p>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background: linear-gradient(135deg, #FEE2E2 0%, #FEF2F2 100%); border-left: 5px solid #DC2626; border-radius: 8px; padding: 25px;">
                                <h2 style="color: #991B1B; margin: 0 0 20px 0; font-size: 22px; font-weight: 700;">
                                     {candidate_name}
                                </h2>
                                <p style="color: #DC2626; font-size: 18px; font-weight: 600; margin: 0;">
                                    {job_role}
                                </p>
                            </div>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <div style="background-color: #FEF3C7; border: 2px dashed #F59E0B; border-radius: 8px; padding: 20px; text-align: center;">
                                <p style="color: #92400E; font-size: 16px; margin: 0; font-weight: 600;">
                                     <strong>Resume Attached</strong>
                                </p>
                                <p style="color: #92400E; font-size: 14px; margin: 10px 0 0 0;">
                                    Please find the complete resume attached to this email
                                </p>
                            </div>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="padding: 0 40px 30px;">
                            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0;">
                                I believe this candidate would be a valuable addition to your team. Should you find their profile interesting, please feel free to reach out directly to discuss potential opportunities.
                            </p>
                            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0;">
                                Thank you for your time and consideration.
                            </p>
                            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 20px 0 0 0;">
                                Best regards,<br>
                                <strong>Team ResumeBlast.ai</strong>
                            </p>
                        </td>
                    </tr>
                    
                    <tr>
                        <td style="background-color: #F3F4F6; padding: 30px 40px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #E5E7EB;">
                            <div style="margin-bottom: 15px;">
                                <span style="font-size: 24px;"></span>
                            </div>
                            <p style="color: #6B7280; font-size: 14px; margin: 0 0 8px 0; font-weight: 600;">
                                ResumeBlast.ai
                            </p>
                            <p style="color: #9CA3AF; font-size: 13px; margin: 0 0 15px 0;">
                                AI-Powered Resume Distribution Platform
                            </p>
                            <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
                                This email was sent via ResumeBlast.ai • © 2025 All rights reserved
                            </p>
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
    
    def send_resume_to_recruiter(self, candidate_data, recruiter_data, resume_url, resume_name, campaign_id=None):
        """
        Send resume email to a single recruiter with attachment
        """
        try:
            if not self.api_key:
                raise Exception("BREVO_API_KEY not configured in environment variables")
            
            print(f"\n📧 Preparing email for: {recruiter_data.get('email')}")
            
            # Download and encode resume
            base64_content, filename, mime_type = self._download_resume(resume_url)
            
            # Use provided resume_name if available, otherwise use downloaded filename
            attachment_name = resume_name if resume_name else filename
            
            # Generate email HTML
            html_content = self._generate_email_template(candidate_data, recruiter_data)
            
            # Use Title Cased name for sender details as well
            raw_name = candidate_data.get('candidate_name', 'Candidate')
            sender_name = raw_name.title() if raw_name else 'Candidate'
            
            # Prepare base email payload
            email_payload = {
                "sender": {
                    "name": self.sender_name,
                    "email": self.sender_email
                },
                "replyTo": {
                    "email": candidate_data.get('candidate_email', self.sender_email),
                    "name": sender_name
                },
                "to": [
                    {
                        "email": recruiter_data.get('email'),
                        "name": recruiter_data.get('name', 'Recruiter')
                    }
                ],
                "subject": f"Resume: {sender_name} - {candidate_data.get('job_role')}",
                "htmlContent": html_content,
                "attachment": [
                    {
                        "name": attachment_name,
                        "content": base64_content
                    }
                ]
            }

            # ✅ FIX: Only add "tags" if campaign_id is not empty/None
            # This prevents the "missing_parameter" error when campaign_id is blank
            if campaign_id:
                email_payload["tags"] = [str(campaign_id)]
                print(f"   🏷️  Tagged with campaign_id: {campaign_id}")
            
            print(f"📤 Sending email via Brevo API...")
            
            # Send email via Brevo
            response = requests.post(
                self.api_url,
                headers=self._get_headers(),
                json=email_payload,
                timeout=30
            )
            
            if response.status_code in [200, 201]:
                result = response.json()
                message_id = result.get('messageId', 'unknown')
                print(f"✅ Email sent successfully! Message ID: {message_id}")
                return {
                    'success': True,
                    'message_id': message_id,
                    'recipient': recruiter_data.get('email'),
                    'error': None
                }
            else:
                error_msg = f"Brevo API error ({response.status_code}): {response.text}"
                print(f"❌ {error_msg}")
                return {
                    'success': False,
                    'message_id': None,
                    'recipient': recruiter_data.get('email'),
                    'error': error_msg
                }
                
        except Exception as e:
            error_msg = str(e)
            print(f"❌ Error sending email to {recruiter_data.get('email')}: {error_msg}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'message_id': None,
                'recipient': recruiter_data.get('email'),
                'error': error_msg
            }
    
    def send_resume_blast(self, candidate_data, recruiters_list, resume_url, resume_name, campaign_id=None):
        """
        Send resume to multiple recruiters
        """
        print(f"\n{'='*70}")
        print(f"🚀 STARTING RESUME BLAST")
        print(f"{'='*70}")
        print(f"📊 Total Recipients: {len(recruiters_list)}")
        print(f"👤 Candidate: {candidate_data.get('candidate_name')}")
        print(f"📄 Resume: {resume_name}")
        if campaign_id:
            print(f"🏷️  Campaign ID (Brevo tag): {campaign_id}")
        print(f"{'='*70}\n")
        
        results = []
        successful = 0
        failed = 0
        
        for i, recruiter in enumerate(recruiters_list, 1):
            print(f"\n📮 [{i}/{len(recruiters_list)}] Processing: {recruiter.get('name')} ({recruiter.get('email')})")
            
            result = self.send_resume_to_recruiter(
                candidate_data=candidate_data,
                recruiter_data=recruiter,
                resume_url=resume_url,
                resume_name=resume_name,
                campaign_id=campaign_id
            )
            
            results.append(result)
            
            if result['success']:
                successful += 1
                print(f"   ✅ Success")
            else:
                failed += 1
                print(f"   ❌ Failed: {result['error']}")
        
        print(f"\n{'='*70}")
        print(f"📊 BLAST COMPLETE")
        print(f"{'='*70}")
        print(f"✅ Successful: {successful}")
        print(f"❌ Failed: {failed}")
        print(f"📈 Success Rate: {(successful/len(recruiters_list)*100):.1f}%")
        print(f"{'='*70}\n")
        
        return {
            'total': len(recruiters_list),
            'successful': successful,
            'failed': failed,
            'results': results
        }