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
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    }


def calculate_next_send_window(base_time: datetime, days_offset: int) -> datetime:
    """
    Calculate the next optimal send time:
    - Weekdays only (Mon–Fri)
    - Preferred windows: 9:00–11:00 AM or 12:30–2:00 PM EST
    - Targets 10:00 AM EST for first window
    """
    target = base_time + timedelta(days=days_offset)

    # Skip weekends
    while target.weekday() >= 5:  # 5=Sat, 6=Sun
        target += timedelta(days=1)

    # Set to 10:00 AM EST (UTC-5, so 15:00 UTC)
    target = target.replace(hour=15, minute=0, second=0, microsecond=0)

    return target


def create_drip_campaign(campaign_data: dict) -> dict:
    """
    Create a new drip campaign record in Supabase.
    Called after successful payment verification.
    """
    supabase_url = _get_supabase_url()
    now = datetime.utcnow()

    # Calculate schedule
    day4_time = calculate_next_send_window(now, 3)   # Day 4 = 3 days after Day 1
    day8_time = calculate_next_send_window(now, 7)   # Day 8 = 7 days after Day 1

    record = {
        "user_id": campaign_data["user_id"],
        "user_type": campaign_data.get("user_type", "registered"),
        "resume_id": campaign_data.get("resume_id"),
        "stripe_session_id": campaign_data.get("stripe_session_id"),
        "plan_name": campaign_data["plan_name"],
        "candidate_name": campaign_data.get("candidate_name", ""),
        "candidate_email": campaign_data.get("candidate_email", ""),
        "candidate_phone": campaign_data.get("candidate_phone", ""),
        "job_role": campaign_data.get("job_role", "Professional"),
        "resume_url": campaign_data["resume_url"],
        "resume_name": campaign_data.get("resume_name", "Resume.pdf"),
        "years_experience": campaign_data.get("years_experience", ""),
        "key_skills": campaign_data.get("key_skills", ""),
        "location": campaign_data.get("location", "Remote"),
        "status": "active",
        "day4_scheduled_for": day4_time.isoformat(),
        "day8_scheduled_for": day8_time.isoformat(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }

    resp = requests.post(
        f"{supabase_url}/rest/v1/blast_campaigns",
        json=record,
        headers=_get_headers()
    )

    if resp.status_code in [200, 201]:
        created = resp.json()
        campaign_id = created[0]["id"] if isinstance(created, list) else created.get("id")
        print(f"[Drip] ✅ Campaign created: {campaign_id}")
        print(f"[Drip]    Day 4 scheduled: {day4_time.strftime('%Y-%m-%d %H:%M UTC')}")
        print(f"[Drip]    Day 8 scheduled: {day8_time.strftime('%Y-%m-%d %H:%M UTC')}")
        return {"success": True, "campaign_id": campaign_id}
    else:
        print(f"[Drip] ❌ Failed to create campaign: {resp.status_code} {resp.text}")
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