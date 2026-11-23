# backend/services/welcome_email_service.py
import os
import resend


class WelcomeEmailService:
    """
    Sends the one-time welcome email to a brand-new user right after they
    finish signing up, via Resend.com — the same provider, API key, and
    sender identity already used for the freemium recruiter blast (see
    freemium_email_service.py). Kept as its own small service rather than
    folded into that class, since this email has nothing to do with
    blasting recruiters or the freemium recruiters table.
    """

    def __init__(self):
        self.api_key = os.getenv('RESEND_API_KEY')
        if not self.api_key:
            raise ValueError("❌ RESEND_API_KEY not found in environment variables")

        resend.api_key = self.api_key

        # Same sender identity/env vars as freemium_email_service.py, so
        # welcome emails come from the same recognizable address.
        self.sender_email = os.getenv('RESEND_SENDER_EMAIL', 'noreply@resumeblast.ai')
        self.sender_name = os.getenv('RESEND_SENDER_NAME', 'ResumeBlast.ai')

        self.frontend_url = os.getenv('FRONTEND_URL', 'https://www.resumeblast.ai')

    def _template(self, full_name):
        first_name = (full_name or '').strip().split(' ')[0] or 'there'
        campaign_guide_url = f"{self.frontend_url.rstrip('/')}/campaign-explained"

        return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to ResumeBlast.ai</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                    <tr>
                        <td style="background: linear-gradient(135deg, #DC2626 0%, #B91C1C 100%); padding: 32px 30px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 700;">Welcome to ResumeBlast.ai 🎉</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 36px 30px;">
                            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
                                Hi {first_name},
                            </p>
                            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
                                Welcome aboard! We're glad you're here — ResumeBlast.ai puts your resume in front of real recruiters automatically, so you can spend less time applying and more time preparing for interviews.
                            </p>
                            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 28px 0;">
                                Here's a quick look at how it works.
                            </p>

                            <div style="background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 20px; border-radius: 4px; margin: 0 0 28px 0;">
                                <h3 style="color: #B91C1C; margin: 0 0 10px 0; font-size: 16px;">How your campaign works</h3>
                                <p style="color: #4B5563; font-size: 14px; line-height: 1.6; margin: 0;">
                                    Your resume isn't sent all at once. It goes out in <strong>three waves</strong>, spread over time, so it reaches recruiters' inboxes naturally instead of being flagged as bulk mail — Wave 1 introduces you, Wave 2 is a follow-up, and Wave 3 is a final reminder.
                                </p>
                            </div>

                            <p style="text-align: center; margin: 0 0 8px 0;">
                                <a href="{campaign_guide_url}" style="display: inline-block; background-color: #DC2626; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 28px; border-radius: 6px;">
                                    See the full campaign guide
                                </a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #F9FAFB; padding: 22px 30px; text-align: center;">
                            <p style="color: #6B7280; font-size: 13px; margin: 0;">— The ResumeBlast.ai Team</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        """

    def send_welcome_email(self, to_email, full_name=None):
        """
        Sends the welcome email. Returns {'success': bool, 'message_id'?: str, 'error'?: str}.
        Never raises — callers (the /api/auth/send-welcome-email route) treat
        this as a best-effort side effect of signup, same posture as the
        existing relink-guest-data call.
        """
        try:
            html_content = self._template(full_name)

            email_params = {
                "from": f"{self.sender_name} <{self.sender_email}>",
                "to": [to_email],
                "subject": "Welcome to ResumeBlast.ai 🎉",
                "html": html_content,
            }

            response = resend.Emails.send(email_params)

            print(f"✅ Welcome email sent to {to_email} (message id: {response.get('id')})")
            return {'success': True, 'message_id': response.get('id')}

        except Exception as e:
            print(f"❌ Failed to send welcome email to {to_email}: {str(e)}")
            return {'success': False, 'error': str(e)}