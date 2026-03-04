"""
backend/services/invoice_email_service.py

Sends a payment receipt email via Brevo after successful Stripe payment.
Works in both sandbox (test mode) and production.

Stripe does NOT send invoice emails in test mode, so we do it ourselves.
Called from payment_webhook.py when checkout.session.completed fires.
"""

import os
import requests
from datetime import datetime


class InvoiceEmailService:
    def __init__(self):
        self.api_key       = os.getenv("BREVO_API_KEY")
        self.sender_email  = os.getenv("BREVO_SENDER_EMAIL", "noreply@resumeblast.ai")
        self.sender_name   = os.getenv("BREVO_SENDER_NAME", "ResumeBlast.ai")
        self.api_url       = "https://api.brevo.com/v3/smtp/email"

    def _headers(self):
        return {
            "accept":        "application/json",
            "api-key":       self.api_key,
            "content-type":  "application/json",
        }

    def _plan_display(self, plan_name: str) -> str:
        labels = {
            "starter":      "Starter Plan",
            "basic":        "Basic Plan",
            "professional": "Professional Plan",
            "growth":       "Growth Plan",
            "advanced":     "Advanced Plan",
            "premium":      "Premium Plan",
            "free":         "Free Plan",
        }
        return labels.get(str(plan_name).lower(), plan_name.title() if plan_name else "Paid Plan")

    def _plan_recruiters(self, plan_name: str) -> str:
        counts = {
            "starter": "250", "basic": "500", "professional": "750",
            "growth": "1,000", "advanced": "1,250", "premium": "1,500",
        }
        return counts.get(str(plan_name).lower(), "250")

    def send_payment_receipt(
        self,
        recipient_email: str,
        recipient_name: str,
        amount_cents: int,
        currency: str,
        plan_name: str,
        stripe_session_id: str,
        payment_date: str = None,
    ) -> dict:
        """
        Send a professional payment receipt email to the customer.

        Args:
            recipient_email:   Customer email address
            recipient_name:    Customer name (or email prefix)
            amount_cents:      Amount charged in cents (e.g. 999 = $9.99)
            currency:          Currency code (e.g. "usd")
            plan_name:         Plan key_name (e.g. "starter")
            stripe_session_id: Stripe checkout session ID for reference
            payment_date:      ISO date string (defaults to now)
        """
        if not self.api_key:
            print("[Invoice] BREVO_API_KEY not configured — skipping receipt email")
            return {"success": False, "error": "BREVO_API_KEY not set"}

        if not recipient_email or "@" not in recipient_email:
            print(f"[Invoice] Invalid recipient email: {recipient_email!r}")
            return {"success": False, "error": "Invalid recipient email"}

        amount_display = f"${amount_cents / 100:.2f} {currency.upper()}"
        plan_label     = self._plan_display(plan_name)
        plan_recruiter_count = self._plan_recruiters(plan_name)
        receipt_date   = payment_date or datetime.utcnow().strftime("%B %d, %Y")
        receipt_id     = stripe_session_id[:16].upper() if stripe_session_id else "N/A"
        display_name   = recipient_name or recipient_email.split("@")[0].title()

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt — ResumeBlast.ai</title>
</head>
<body style="margin:0;padding:0;font-family:'Inter',Arial,sans-serif;background-color:#f9fafb;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:40px 20px;">
        <table role="presentation" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#DC2626 0%,#991B1B 100%);padding:36px 40px;border-radius:12px 12px 0 0;">
              <h1 style="color:#fff;margin:0 0 6px 0;font-size:26px;font-weight:700;">
                ✅ Payment Confirmed
              </h1>
              <p style="color:#FEE2E2;margin:0;font-size:15px;">ResumeBlast.ai — AI-Powered Resume Distribution</p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0;">
                Hi <strong>{display_name}</strong>,
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:12px 0 0 0;">
                Thank you for your purchase! Your payment was successful and your 3-wave drip
                campaign is now active. Your resume will be sent to verified recruiters starting today.
              </p>
            </td>
          </tr>

          <!-- Receipt box -->
          <tr>
            <td style="padding:28px 40px;">
              <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:24px;">
                <h2 style="color:#111827;margin:0 0 20px 0;font-size:17px;font-weight:700;border-bottom:2px solid #E5E7EB;padding-bottom:12px;">
                  🧾 Payment Receipt
                </h2>

                <table style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="padding:6px 0;color:#6B7280;font-size:14px;">Receipt ID</td>
                    <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">#{receipt_id}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#6B7280;font-size:14px;">Date</td>
                    <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">{receipt_date}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#6B7280;font-size:14px;">Plan</td>
                    <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">{plan_label}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#6B7280;font-size:14px;">Recruiters</td>
                    <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">{plan_recruiter_count} recruiters × 3 waves</td>
                  </tr>
                  <tr style="border-top:2px solid #E5E7EB;">
                    <td style="padding:12px 0 4px;color:#111827;font-size:16px;font-weight:700;">Total Charged</td>
                    <td style="padding:12px 0 4px;color:#DC2626;font-size:18px;font-weight:800;text-align:right;">{amount_display}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Campaign schedule -->
          <tr>
            <td style="padding:0 40px 28px;">
              <div style="background:#EFF6FF;border-left:4px solid #2563EB;border-radius:8px;padding:20px;">
                <h3 style="color:#1E40AF;margin:0 0 14px 0;font-size:15px;font-weight:700;">
                  📅 Your 3-Wave Drip Campaign Schedule
                </h3>
                <div style="display:flex;flex-direction:column;gap:10px;">
                  <div style="display:flex;align-items:flex-start;gap:12px;">
                    <span style="background:#DC2626;color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;padding:0;line-height:22px;text-align:center;">1</span>
                    <span style="color:#374151;font-size:14px;line-height:1.5;">
                      <strong>Wave 1 — Initial Introduction</strong><br>
                      Starting today · First 50 emails sent immediately
                    </span>
                  </div>
                  <div style="display:flex;align-items:flex-start;gap:12px;">
                    <span style="background:#2563EB;color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;padding:0;line-height:22px;text-align:center;">2</span>
                    <span style="color:#374151;font-size:14px;line-height:1.5;">
                      <strong>Wave 2 — Follow-Up</strong><br>
                      Starts automatically after Wave 1 completes · Business hours only
                    </span>
                  </div>
                  <div style="display:flex;align-items:flex-start;gap:12px;">
                    <span style="background:#059669;color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;padding:0;line-height:22px;text-align:center;">3</span>
                    <span style="color:#374151;font-size:14px;line-height:1.5;">
                      <strong>Wave 3 — Final Reminder</strong><br>
                      Starts automatically after Wave 2 completes · Maximum recruiter exposure
                    </span>
                  </div>
                </div>
              </div>
            </td>
          </tr>

          <!-- What's next -->
          <tr>
            <td style="padding:0 40px 28px;">
              <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px 0;">
                <strong>What happens next?</strong>
              </p>
              <p style="color:#6B7280;font-size:14px;line-height:1.6;margin:0 0 8px 0;">
                ✅ Your resume has been queued for distribution to <strong>{plan_recruiter_count} verified recruiters</strong>
              </p>
              <p style="color:#6B7280;font-size:14px;line-height:1.6;margin:0 0 8px 0;">
                ✅ Emails send automatically — no action needed from you
              </p>
              <p style="color:#6B7280;font-size:14px;line-height:1.6;margin:0;">
                ✅ Log in to your dashboard to track real-time campaign progress
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F3F4F6;padding:24px 40px;text-align:center;border-radius:0 0 12px 12px;border-top:1px solid #E5E7EB;">
              <p style="color:#6B7280;font-size:14px;margin:0 0 4px 0;font-weight:600;">ResumeBlast.ai</p>
              <p style="color:#9CA3AF;font-size:12px;margin:0 0 8px 0;">AI-Powered Resume Distribution Platform</p>
              <p style="color:#9CA3AF;font-size:11px;margin:0;">
                Questions? Contact us at support@resumeblast.ai<br>
                © 2025 ResumeBlast.ai. All rights reserved.
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

        email_payload = {
            "sender": {
                "name":  self.sender_name,
                "email": self.sender_email,
            },
            "to": [
                {"email": recipient_email, "name": display_name}
            ],
            "subject": f"✅ Payment Confirmed — {plan_label} | ResumeBlast.ai",
            "htmlContent": html_content,
        }

        try:
            print(f"[Invoice] Sending receipt to {recipient_email} for {plan_label} ({amount_display})")
            resp = requests.post(
                self.api_url,
                headers=self._headers(),
                json=email_payload,
                timeout=15
            )

            if resp.status_code in [200, 201]:
                message_id = resp.json().get("messageId", "unknown")
                print(f"[Invoice] Receipt sent successfully! messageId={message_id}")
                return {"success": True, "message_id": message_id}
            else:
                error_msg = f"Brevo API error ({resp.status_code}): {resp.text}"
                print(f"[Invoice] {error_msg}")
                return {"success": False, "error": error_msg}

        except Exception as e:
            print(f"[Invoice] Exception sending receipt: {e}")
            return {"success": False, "error": str(e)}