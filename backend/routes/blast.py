from flask import Blueprint, request, jsonify
import os, requests, sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.recruiter_email_service import RecruiterEmailService
from services.freemium_email_service import FreemiumEmailService
from routes.drip_campaign import create_drip_campaign
from services.drip_scheduler import run_day1_blast

blast_bp = Blueprint("blast", __name__)
email_service = RecruiterEmailService()
freemium_service = FreemiumEmailService()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
DRIP_PLANS = {"starter", "basic", "professional", "growth", "advanced", "premium"}
FREE_PLANS  = {"free", "freemium"}

def get_db_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

def fetch_candidate_details_from_db(resume_url):
    """Fetch candidate details from DB using resume URL."""
    try:
        if not resume_url:
            return None, None, None
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/resumes?file_url=eq.{resume_url}&select=analysis_data",
            headers=get_db_headers()
        )
        if r.status_code == 200 and r.json():
            a = r.json()[0].get("analysis_data", {})
            n  = a.get("candidate_name")
            e  = a.get("candidate_email")
            ro = a.get("detected_role")
            if n  in ["Not Found", None, ""]: n  = None
            if e  in ["Not Found", None, ""]: e  = None
            if ro in ["Not Found", None, ""]: ro = None
            return n, e, ro
        return None, None, None
    except:
        return None, None, None

def get_plan_limit(plan_name):
    """Get recruiter limit for a plan, with fallback defaults."""
    fb = {
        "starter": 250, "basic": 500, "professional": 750,
        "growth": 1000, "advanced": 1250, "premium": 1500, "free": 11
    }
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/plans?key_name=eq.{plan_name}&select=recruiter_limit",
            headers=get_db_headers()
        )
        if r.status_code == 200 and r.json():
            return r.json()[0]["recruiter_limit"]
    except:
        pass
    return fb.get(plan_name, 250)

def verify_stripe_session(session_id):
    """
    Verify a Stripe session and return plan_name + user_id from metadata.
    This prevents duplicate blasts — if blast_campaigns already has this
    stripe_session_id, we skip re-sending.
    Returns: (plan_name, user_id, already_processed)
    """
    if not session_id:
        return None, None, False

    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key:
        print("[Blast] WARNING: STRIPE_SECRET_KEY not set, skipping Stripe verification")
        return None, None, False

    try:
        resp = requests.get(
            f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
            auth=(stripe_key, "")
        )
        if resp.status_code != 200:
            print(f"[Blast] Stripe session fetch failed: {resp.status_code}")
            return None, None, False

        session_data = resp.json()
        metadata = session_data.get("metadata", {})
        plan_name = metadata.get("plan", "")
        user_id   = metadata.get("user_id", "")

        # Check if this session was already processed
        check = requests.get(
            f"{SUPABASE_URL}/rest/v1/blast_campaigns?stripe_session_id=eq.{session_id}&select=id",
            headers=get_db_headers()
        )
        already_processed = (check.status_code == 200 and len(check.json()) > 0)

        return plan_name, user_id, already_processed
    except Exception as e:
        print(f"[Blast] Stripe verification error: {e}")
        return None, None, False


@blast_bp.route("/api/blast/send", methods=["POST"])
def send_blast():
    """
    Main blast endpoint. Called after payment success.
    Works for both registered users and guests.
    
    ✅ FIX: Added stripe_session_id deduplication guard.
    ✅ FIX: Falls back gracefully when session_id not provided (e.g. sandbox).
    ✅ FIX: Properly handles user_id=None for guests vs registered users.
    """
    try:
        blast_data = request.json
        if not blast_data:
            return jsonify({"success": False, "error": "No data provided"}), 400

        plan_name       = blast_data.get("plan_name", "starter").lower()
        user_id         = blast_data.get("user_id", "")
        resume_url      = blast_data.get("resume_url", "")
        resume_name     = blast_data.get("resume_name", "Resume.pdf")
        stripe_session  = blast_data.get("stripe_session_id", "")

        print(f"\n[Blast] ========================================")
        print(f"[Blast] Incoming blast request")
        print(f"[Blast] plan={plan_name} user_id={user_id!r} session={stripe_session!r}")
        print(f"[Blast] resume_url={resume_url!r}")

        if plan_name in FREE_PLANS:
            return jsonify({"success": False, "error": "Use /api/blast/freemium for free plan"}), 400

        if not resume_url:
            return jsonify({"success": False, "error": "Resume URL is required"}), 400

        # ── Deduplication guard: prevent double-blast on webhook retries ──
        if stripe_session:
            _, _, already_processed = verify_stripe_session(stripe_session)
            if already_processed:
                print(f"[Blast] Session {stripe_session} already processed — returning cached result")
                # Fetch the existing campaign
                existing = requests.get(
                    f"{SUPABASE_URL}/rest/v1/blast_campaigns?stripe_session_id=eq.{stripe_session}&select=*",
                    headers=get_db_headers()
                )
                if existing.status_code == 200 and existing.json():
                    camp = existing.json()[0]
                    return jsonify({
                        "success": True,
                        "drip_mode": True,
                        "drip_campaign_id": camp["id"],
                        "message": "Blast already initiated for this payment session.",
                        "already_processed": True,
                        "plan_used": plan_name,
                    }), 200

        # ── Determine user type ──
        is_guest    = str(user_id).startswith("guest_")
        user_type   = "guest" if is_guest else "registered"

        # ── Get plan limit ──
        plan_limit = get_plan_limit(plan_name)

        # ── Fetch candidate details from DB (overrides frontend data if found) ──
        db_name, db_email, db_role = fetch_candidate_details_from_db(resume_url)
        final_name  = db_name  or blast_data.get("candidate_name", "Professional Candidate")
        final_email = db_email or blast_data.get("candidate_email", "")
        final_role  = db_role  or blast_data.get("job_role", "Professional")

        print(f"[Blast] Candidate: {final_name} | {final_role} | {final_email}")
        print(f"[Blast] User type: {user_type} | Plan limit: {plan_limit}")

        # ── Create drip campaign record ──
        drip_result = create_drip_campaign({
            "user_id":         user_id,
            "user_type":       user_type,
            "stripe_session_id": stripe_session,
            "plan_name":       plan_name,
            "candidate_name":  final_name,
            "candidate_email": final_email,
            "candidate_phone": blast_data.get("candidate_phone", ""),
            "job_role":        final_role,
            "resume_url":      resume_url,
            "resume_name":     resume_name,
            "years_experience": blast_data.get("years_experience", "0"),
            "key_skills":      blast_data.get("key_skills", "Professional Skills"),
            "location":        blast_data.get("location", "Remote"),
            "total_recruiters": plan_limit,
        })

        if not drip_result.get("success"):
            print(f"[Blast] Failed to create drip campaign: {drip_result.get('error')}")
            return jsonify({"success": False, "error": "Failed to create drip campaign record"}), 500

        drip_campaign_id = drip_result["campaign_id"]
        print(f"[Blast] Campaign created: {drip_campaign_id}")

        # ── Fire Day 1 blast immediately ──
        day1_result = run_day1_blast(drip_campaign_id)

        s     = day1_result.get("stats", {"sent": 0, "failed": 0, "total": plan_limit})
        sent  = s.get("sent", 0)
        failed = s.get("failed", 0)
        total = s.get("total", plan_limit)

        print(f"[Blast] Day 1 complete: sent={sent} failed={failed} total={total}")

        return jsonify({
            "success":          True,
            "drip_mode":        True,
            "drip_campaign_id": drip_campaign_id,
            "message":          f"Day 1 blast sent to {sent} recruiters. Follow-ups scheduled automatically.",
            "total_recipients": total,
            "successful_sends": sent,
            "failed_sends":     failed,
            "plan_used":        plan_name,
            "plan_limit_enforced": plan_limit,
            "success_rate":     f"{(sent / total * 100):.1f}%" if total > 0 else "0%",
            "schedule": {
                "day1": "Sent now",
                "day4": "Follow-up — next wave starts after Wave 1 completes",
                "day8": "Reminder — starts after Wave 2 completes"
            }
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@blast_bp.route("/api/blast/freemium", methods=["POST"])
def send_freemium_blast():
    """Freemium blast for registered users only (one-time, 11 recruiters)."""
    try:
        data      = request.json
        user_id   = data.get("user_id")
        resume_url = data.get("resume_url")

        if not user_id or not resume_url:
            return jsonify({"success": False, "error": "Missing user_id or resume_url"}), 400

        if str(user_id).startswith("guest_"):
            return jsonify({"success": False, "error": "Guest users must use a paid plan."}), 403

        # Check if free blast already used
        cr = requests.get(
            f"{SUPABASE_URL}/rest/v1/blast_campaigns?user_id=eq.{user_id}&select=id",
            headers=get_db_headers()
        )
        if cr.status_code != 200:
            return jsonify({"success": False, "error": "Failed to check eligibility"}), 500
        if len(cr.json()) > 0:
            return jsonify({"success": False, "error": "Free blast already used. Please upgrade."}), 403

        db_name, db_email, db_role = fetch_candidate_details_from_db(resume_url)
        candidate_data = {
            "candidate_name":  db_name  or data.get("candidate_name", "Candidate"),
            "candidate_email": db_email or data.get("candidate_email", ""),
            "candidate_phone": data.get("candidate_phone", ""),
            "job_role":        db_role  or data.get("job_role", "Professional")
        }

        result = freemium_service.send_freemium_blast(candidate_data, resume_url)
        if not result["success"]:
            return jsonify(result), 500

        # Record in blast_campaigns
        requests.post(
            f"{SUPABASE_URL}/rest/v1/blast_campaigns",
            json={
                "user_id":          user_id,
                "user_type":        "registered",
                "status":           "completed",
                "recipients_count": result["total"],
                "plan_name":        "free",
                "industry":         "Freemium",
                "initiated_at":     datetime.utcnow().isoformat(),
                "completed_at":     datetime.utcnow().isoformat(),
                "result_data":      result
            },
            headers=get_db_headers()
        )

        return jsonify({"success": True, "message": "Free blast sent!", "details": result}), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@blast_bp.route("/api/blast/status/<campaign_id>", methods=["GET"])
def get_blast_status(campaign_id):
    """
    ✅ NEW: Get real-time status of a specific blast campaign.
    Used by the dashboard to poll for live updates.
    """
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/blast_campaigns?id=eq.{campaign_id}&select=*",
            headers=get_db_headers()
        )
        if resp.status_code == 200 and resp.json():
            campaign = resp.json()[0]
            plan_name = campaign.get("plan_name", "starter")
            plan_limits = {
                "starter": 250, "basic": 500, "professional": 750,
                "growth": 1000, "advanced": 1250, "premium": 1500, "free": 11
            }
            plan_limit = plan_limits.get(plan_name, 250)

            w1_sent = int(campaign.get("drip_day1_delivered") or 0)
            w2_sent = int(campaign.get("drip_day2_delivered") or 0)
            w3_sent = int(campaign.get("drip_day3_delivered") or 0)

            return jsonify({
                "success":         True,
                "campaign_id":     campaign_id,
                "status":          campaign.get("status"),
                "plan_name":       plan_name,
                "plan_limit":      plan_limit,
                "wave1_sent":      w1_sent,
                "wave2_sent":      w2_sent,
                "wave3_sent":      w3_sent,
                "total_sent":      w1_sent + w2_sent + w3_sent,
                "wave1_complete":  bool(campaign.get("drip_day1_sent_at")),
                "wave2_complete":  bool(campaign.get("drip_day2_sent_at")),
                "wave3_complete":  bool(campaign.get("drip_day3_sent_at")),
                "wave1_last_date": campaign.get("drip_day1_last_date"),
                "wave2_last_date": campaign.get("drip_day2_last_date"),
                "wave3_last_date": campaign.get("drip_day3_last_date"),
            }), 200

        return jsonify({"success": False, "error": "Campaign not found"}), 404

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@blast_bp.route("/api/blast/test", methods=["GET"])
def test_blast():
    return jsonify({
        "success":          True,
        "message":          "Blast API operational — Drip active",
        "brevo_configured": bool(os.getenv("BREVO_API_KEY")),
        "resend_configured": bool(os.getenv("RESEND_API_KEY")),
        "drip_plans":       list(DRIP_PLANS),
        "free_plans":       list(FREE_PLANS),
        "timestamp":        datetime.utcnow().isoformat()
    }), 200


@blast_bp.route("/api/blast/test-single", methods=["POST"])
def test_single_email():
    try:
        data = request.json
        result = email_service.send_resume_to_recruiter(
            candidate_data={
                "candidate_name": "Test", "candidate_email": "test@resumeblast.ai",
                "candidate_phone": "", "job_role": "Engineer",
                "years_experience": "5", "key_skills": "Python",
                "education_level": "BS", "location": "Remote", "linkedin_url": ""
            },
            recruiter_data={
                "email": data.get("test_email", "test@example.com"),
                "name": "Test", "company": "Test Co"
            },
            resume_url=data.get("resume_url", "https://example.com/sample.pdf"),
            resume_name="Test.pdf"
        )
        if result["success"]:
            return jsonify({"success": True, "message_id": result["message_id"]}), 200
        return jsonify({"success": False, "error": result["error"]}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500