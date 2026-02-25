from flask import Blueprint, request, jsonify
import os
import requests
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / '.env'
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path, override=False)

drip_campaign_bp = Blueprint('drip_campaign', __name__)

def _get_supabase_url():
    return os.getenv('SUPABASE_URL')

def _get_supabase_key():
    return os.getenv('SUPABASE_SERVICE_ROLE_KEY')

def _get_headers():
    key = _get_supabase_key()
    return {
        'apikey':        key,
        'Authorization': f'Bearer {key}',
        'Content-Type':  'application/json',
        'Prefer':        'return=representation'
    }


def calculate_next_send_window(base_time: datetime, days_offset: int) -> datetime:
    """
    Calculate the next optimal send time, skipping weekends.
    Targets 10:00 AM EST (15:00 UTC) on a weekday.
    """
    target = base_time + timedelta(days=days_offset)

    # Skip weekends
    while target.weekday() >= 5:   # 5=Sat, 6=Sun
        target += timedelta(days=1)

    # Set to 10:00 AM EST (UTC-5 = 15:00 UTC)
    target = target.replace(hour=15, minute=0, second=0, microsecond=0)

    return target


def calculate_wave_start(plan_name: str, base_time: datetime, wave: int) -> datetime:
    """
    Calculate when Wave 2 (follow-up) and Wave 3 (reminder) should become eligible.

    Waves are CONTINUOUS -- no waiting gaps between them.
    Wave 2 starts the day after Wave 1 finishes.
    Wave 3 starts the day after Wave 2 finishes.

    Days per wave = plan_recruiter_limit / 50 (daily sending limit)

    Plan breakdown:
      Starter       250 recruiters  -->  5 days/wave  --> Wave2 day  6, Wave3 day 11
      Basic         500 recruiters  --> 10 days/wave  --> Wave2 day 11, Wave3 day 21
      Professional  750 recruiters  --> 15 days/wave  --> Wave2 day 16, Wave3 day 31
      Growth       1000 recruiters  --> 20 days/wave  --> Wave2 day 21, Wave3 day 41
      Advanced     1250 recruiters  --> 25 days/wave  --> Wave2 day 26, Wave3 day 51
      Premium      1500 recruiters  --> 30 days/wave  --> Wave2 day 31, Wave3 day 61
    """
    DAILY_LIMIT = 50
    PLAN_LIMIT_MAP = {
        "starter":      250,
        "basic":        500,
        "professional": 750,
        "growth":       1000,
        "advanced":     1250,
        "premium":      1500
    }

    recruiter_limit = PLAN_LIMIT_MAP.get(plan_name, 250)
    # Ceiling division: e.g. 250/50=5, 500/50=10, 750/50=15
    days_per_wave   = (recruiter_limit + DAILY_LIMIT - 1) // DAILY_LIMIT

    if wave == 2:
        # Wave 2 starts the day after Wave 1 finishes
        offset = days_per_wave + 1
    elif wave == 3:
        # Wave 3 starts the day after Wave 2 finishes
        # Wave 1 takes days_per_wave days, Wave 2 takes days_per_wave days
        offset = (days_per_wave * 2) + 1
    else:
        offset = 1

    return calculate_next_send_window(base_time, offset)


def create_drip_campaign(campaign_data: dict) -> dict:
    """
    Create a new drip campaign record in Supabase.
    Called after successful payment verification.

    Waves are continuous -- Wave 2 starts the day after Wave 1 finishes,
    Wave 3 starts the day after Wave 2 finishes. No waiting gaps.

    Timeline per plan (50 emails/day):
      Starter:       Wave1 Day1-5,  Wave2 Day6-10,  Wave3 Day11-15  (15 days total)
      Basic:         Wave1 Day1-10, Wave2 Day11-20, Wave3 Day21-30  (30 days total)
      Professional:  Wave1 Day1-15, Wave2 Day16-30, Wave3 Day31-45  (45 days total)
      Growth:        Wave1 Day1-20, Wave2 Day21-40, Wave3 Day41-60  (60 days total)
      Advanced:      Wave1 Day1-25, Wave2 Day26-50, Wave3 Day51-75  (75 days total)
      Premium:       Wave1 Day1-30, Wave2 Day31-60, Wave3 Day61-90  (90 days total)
    """
    supabase_url = _get_supabase_url()
    now          = datetime.utcnow()
    plan_name    = campaign_data.get("plan_name", "starter").lower()

    # Calculate wave start times -- continuous, no gaps
    day4_time = calculate_wave_start(plan_name, now, wave=2)   # Wave 2 start
    day8_time = calculate_wave_start(plan_name, now, wave=3)   # Wave 3 start

    record = {
        "user_id":            campaign_data["user_id"],
        "user_type":          campaign_data.get("user_type", "registered"),
        "resume_id":          campaign_data.get("resume_id"),
        "stripe_session_id":  campaign_data.get("stripe_session_id"),
        "plan_name":          campaign_data["plan_name"],
        "candidate_name":     campaign_data.get("candidate_name", ""),
        "candidate_email":    campaign_data.get("candidate_email", ""),
        "candidate_phone":    campaign_data.get("candidate_phone", ""),
        "job_role":           campaign_data.get("job_role", "Professional"),
        "resume_url":         campaign_data["resume_url"],
        "resume_name":        campaign_data.get("resume_name", "Resume.pdf"),
        "years_experience":   campaign_data.get("years_experience", ""),
        "key_skills":         campaign_data.get("key_skills", ""),
        "location":           campaign_data.get("location", "Remote"),
        "status":             "active",
        "day4_scheduled_for": day4_time.isoformat(),
        "day8_scheduled_for": day8_time.isoformat(),
        "created_at":         now.isoformat(),
        "updated_at":         now.isoformat()
    }

    resp = requests.post(
        f"{supabase_url}/rest/v1/blast_campaigns",
        json=record,
        headers=_get_headers()
    )

    if resp.status_code in [200, 201]:
        created     = resp.json()
        campaign_id = created[0]["id"] if isinstance(created, list) else created.get("id")
        print(f"[Drip] Campaign created: {campaign_id}")
        print(f"[Drip]   Plan         : {plan_name}")
        print(f"[Drip]   Wave 2 start : {day4_time.strftime('%Y-%m-%d %H:%M UTC')}")
        print(f"[Drip]   Wave 3 start : {day8_time.strftime('%Y-%m-%d %H:%M UTC')}")
        return {"success": True, "campaign_id": campaign_id}
    else:
        print(f"[Drip] Failed to create campaign: {resp.status_code} {resp.text}")
        return {"success": False, "error": resp.text}


@drip_campaign_bp.route('/api/drip/status/<user_id>', methods=['GET'])
def get_campaign_status(user_id):
    """Get all drip campaigns for a user."""
    try:
        supabase_url = _get_supabase_url()
        resp = requests.get(
            f"{supabase_url}/rest/v1/blast_campaigns"
            f"?user_id=eq.{user_id}&order=created_at.desc",
            headers=_get_headers()
        )
        if resp.status_code == 200:
            return jsonify({"success": True, "campaigns": resp.json()})
        return jsonify({"success": False, "error": resp.text}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@drip_campaign_bp.route('/api/drip/campaigns', methods=['GET'])
def list_campaigns():
    """Admin: list all active campaigns."""
    try:
        supabase_url = _get_supabase_url()
        resp = requests.get(
            f"{supabase_url}/rest/v1/blast_campaigns"
            f"?order=created_at.desc&limit=100",
            headers=_get_headers()
        )
        if resp.status_code == 200:
            return jsonify({"success": True, "campaigns": resp.json()})
        return jsonify({"error": resp.text}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500