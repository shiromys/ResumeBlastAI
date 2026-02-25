# backend/routes/employer_lead.py
# ─────────────────────────────────────────────────────────────────────────────
# NEW FILE: Handles employer lead capture from the /employerNetwork page.
# Stores leads in Supabase `employer_leads` table and adds contact to
# Brevo "Employer Leads" list if BREVO_API_KEY is configured.
#
# POST /api/employer-lead
#   Body: { company_name, email, hiring_roles, industry?, hiring_volume? }
# ─────────────────────────────────────────────────────────────────────────────
from flask import Blueprint, request, jsonify
import os
import requests
from datetime import datetime

employer_lead_bp = Blueprint('employer_lead', __name__, url_prefix='/api/employer-lead')


def _supabase_headers():
    api_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    return {
        'apikey': api_key,
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }


def _supabase_url():
    return f"{os.getenv('SUPABASE_URL')}/rest/v1"


def _save_to_supabase(data: dict) -> dict:
    """Insert lead into employer_leads table."""
    try:
        url = f"{_supabase_url()}/employer_leads"
        payload = {
            'company_name':  data.get('company_name'),
            'email':         data.get('email'),
            'hiring_roles':  data.get('hiring_roles'),
            'industry':      data.get('industry') or None,
            'hiring_volume': data.get('hiring_volume') or None,
            'status':        'new',
            'created_at':    datetime.utcnow().isoformat(),
        }
        response = requests.post(url, headers=_supabase_headers(), json=payload, timeout=10)
        if response.status_code in (200, 201):
            print(f"✅ Employer lead saved: {data.get('email')}")
            return {'success': True}
        else:
            print(f"❌ Supabase insert failed: {response.status_code} {response.text}")
            return {'success': False, 'error': response.text}
    except Exception as e:
        print(f"❌ Supabase error: {e}")
        return {'success': False, 'error': str(e)}


def _add_to_brevo(email: str, company_name: str) -> None:
    """
    Add contact to Brevo 'Employer Leads' list and send welcome email.
    Silently fails if BREVO_API_KEY is not set — won't block the response.
    """
    api_key = os.getenv('BREVO_API_KEY')
    if not api_key:
        print("⚠️ BREVO_API_KEY not set — skipping Brevo contact creation")
        return

    try:
        # 1. Create / update contact
        contact_payload = {
            'email': email,
            'attributes': {'COMPANY': company_name},
            'listIds': [],          # Brevo list IDs — add your list ID here e.g. [12]
            'updateEnabled': True,
        }
        r = requests.post(
            'https://api.brevo.com/v3/contacts',
            headers={'accept': 'application/json', 'api-key': api_key, 'content-type': 'application/json'},
            json=contact_payload,
            timeout=10,
        )
        if r.status_code in (200, 201):
            print(f"✅ Brevo contact created/updated for {email}")
        else:
            print(f"⚠️ Brevo contact creation: {r.status_code} {r.text}")

        # 2. Send welcome transactional email
        welcome_html = f"""
        <html><body style="font-family:Inter,Arial,sans-serif;background:#f9fafb;padding:40px 20px;">
          <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;
                      box-shadow:0 4px 6px rgba(0,0,0,0.07);border:1px solid #E5E7EB;">
            <div style="background:linear-gradient(135deg,#DC2626 0%,#991B1B 100%);padding:32px 40px;">
              <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;">Welcome to the ResumeBlast Employer Network</h1>
              <p style="color:#FEE2E2;margin:8px 0 0;font-size:15px;">Powered by ResumeBlast.ai</p>
            </div>
            <div style="padding:32px 40px;">
              <p style="color:#374151;font-size:16px;line-height:1.6;">Hi <strong>{company_name}</strong>,</p>
              <p style="color:#374151;font-size:16px;line-height:1.6;">
                Thank you for requesting access to the ResumeBlast Employer Network.
                We've received your application and will review it within <strong>24–48 hours</strong>.
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;">
                Once approved, you'll gain access to AI-screened candidate profiles, direct resume downloads,
                and our growing database of motivated job seekers.
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;">
                Best regards,<br/><strong>Team ResumeBlast.ai</strong>
              </p>
            </div>
            <div style="background:#F3F4F6;padding:20px 40px;text-align:center;border-top:1px solid #E5E7EB;">
              <p style="color:#9CA3AF;font-size:12px;margin:0;">
                © 2025 ResumeBlast.ai — AI-Powered Resume Distribution Platform
              </p>
            </div>
          </div>
        </body></html>
        """

        email_payload = {
            'sender': {
                'name': os.getenv('BREVO_SENDER_NAME', 'ResumeBlast.ai'),
                'email': os.getenv('BREVO_SENDER_EMAIL', 'noreply@resumeblast.ai'),
            },
            'to': [{'email': email, 'name': company_name}],
            'subject': 'Welcome to the ResumeBlast Employer Network',
            'htmlContent': welcome_html,
        }
        re2 = requests.post(
            'https://api.brevo.com/v3/smtp/email',
            headers={'accept': 'application/json', 'api-key': api_key, 'content-type': 'application/json'},
            json=email_payload,
            timeout=15,
        )
        if re2.status_code in (200, 201):
            print(f"✅ Brevo welcome email sent to {email}")
        else:
            print(f"⚠️ Brevo welcome email: {re2.status_code} {re2.text}")

    except Exception as e:
        print(f"⚠️ Brevo integration error (non-blocking): {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Route
# ─────────────────────────────────────────────────────────────────────────────
@employer_lead_bp.route('', methods=['POST'])
def create_employer_lead():
    """
    POST /api/employer-lead
    Captures employer/recruiter interest from the /employerNetwork landing page.
    """
    try:
        data = request.json or {}

        # Validate required fields
        company_name = (data.get('company_name') or '').strip()
        email = (data.get('email') or '').strip().lower()
        hiring_roles = (data.get('hiring_roles') or '').strip()

        if not company_name:
            return jsonify({'success': False, 'error': 'company_name is required'}), 400
        if not email:
            return jsonify({'success': False, 'error': 'email is required'}), 400
        if not hiring_roles:
            return jsonify({'success': False, 'error': 'hiring_roles is required'}), 400

        print(f"\n📥 New employer lead: {company_name} <{email}>")

        # 1. Save to Supabase
        save_result = _save_to_supabase({
            'company_name':  company_name,
            'email':         email,
            'hiring_roles':  hiring_roles,
            'industry':      data.get('industry'),
            'hiring_volume': data.get('hiring_volume'),
        })

        if not save_result['success']:
            # Log the error but don't hard-fail — still send the welcome email
            print(f"⚠️ Supabase save failed, continuing with Brevo: {save_result.get('error')}")

        # 2. Add to Brevo + send welcome email (non-blocking)
        _add_to_brevo(email, company_name)

        return jsonify({
            'success': True,
            'message': 'Employer lead received. You will hear from us within 24–48 hours.',
        }), 201

    except Exception as e:
        print(f"❌ employer_lead endpoint error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500