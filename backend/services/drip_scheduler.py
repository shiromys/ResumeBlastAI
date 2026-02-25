"""
Drip Email Scheduler
Runs every 30 minutes via APScheduler.
Checks blast_campaigns table for Wave 1, Wave 2, and Wave 3 emails due.
Works for both registered and guest users.

DAILY QUOTA ENFORCED: Max 50 emails per campaign per wave per calendar day.

HOW DAILY BATCHING WORKS (example: Starter = 250 recruiters, 50/day):

  Day 1  (payment day) --> sends recruiters   1-50   immediately after payment
  Day 2  (next day)    --> sends recruiters  51-100
  Day 3                --> sends recruiters 101-150
  Day 4                --> sends recruiters 151-200
  Day 5                --> sends recruiters 201-250  --> Wave 1 complete --> Wave 2 unlocked

  Wave 2 (follow-up): same 50/day logic, starts day after Wave 1 finishes
  Wave 3 (reminder):  same 50/day logic, starts day after Wave 2 finishes

PLAN TIMELINE (50 emails/day, no gaps between waves):
  Starter      250 recruiters -->  5 days/wave -->  15 days total -->   750 total emails
  Basic        500 recruiters --> 10 days/wave -->  30 days total --> 1,500 total emails
  Professional 750 recruiters --> 15 days/wave -->  45 days total --> 2,250 total emails
  Growth      1000 recruiters --> 20 days/wave -->  60 days total --> 3,000 total emails
  Advanced    1250 recruiters --> 25 days/wave -->  75 days total --> 3,750 total emails
  Premium     1500 recruiters --> 30 days/wave -->  90 days total --> 4,500 total emails

KEY COLUMNS IN blast_campaigns:
  drip_dayX_delivered  = cumulative offset (total recruiters sent across all days so far)
  drip_dayX_last_date  = UTC date (YYYY-MM-DD) of the last batch send for this wave
  drip_dayX_sent_at    = only stamped when the ENTIRE wave is fully complete

  Daily quota gate: if last_date == today --> quota used --> skip until tomorrow.
                    if last_date < today (or NULL) --> send next 50.

REQUIRED NEW DB COLUMNS (run once in Supabase SQL editor):
  ALTER TABLE blast_campaigns ADD COLUMN IF NOT EXISTS drip_day1_last_date TEXT;
  ALTER TABLE blast_campaigns ADD COLUMN IF NOT EXISTS drip_day2_last_date TEXT;
  ALTER TABLE blast_campaigns ADD COLUMN IF NOT EXISTS drip_day3_last_date TEXT;
"""
import os, time, requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path, override=False)

BREVO_API_KEY      = os.getenv("BREVO_API_KEY")
BREVO_SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "noreply@resumeblast.ai")
BREVO_SENDER_NAME  = os.getenv("BREVO_SENDER_NAME", "ResumeBlast.ai")

BREVO_TEMPLATE_DAY1 = int(os.getenv("BREVO_TEMPLATE_DAY1", "3"))
BREVO_TEMPLATE_DAY4 = int(os.getenv("BREVO_TEMPLATE_DAY4", "4"))
BREVO_TEMPLATE_DAY8 = int(os.getenv("BREVO_TEMPLATE_DAY8", "5"))

# Hard daily limit: 50 emails per campaign per wave per calendar day
DAILY_EMAIL_LIMIT = int(os.getenv("DAILY_EMAIL_LIMIT", "50"))

# Seconds to wait between each individual email send (protects deliverability)
PLAN_SEND_DELAYS = {
    "starter":      2.0,
    "basic":        2.5,
    "professional": 3.0,
    "growth":       3.5,
    "advanced":     4.0,
    "premium":      4.5
}

# Total recruiters per plan
PLAN_LIMIT_MAP = {
    "starter":      250,
    "basic":        500,
    "professional": 750,
    "growth":       1000,
    "advanced":     1250,
    "premium":      1500
}

# Maps drip wave number --> blast_campaigns column names
# drip_dayX_last_date is the NEW column added to enforce the daily quota gate
WAVE_FIELDS = {
    1: {
        "sent_at":   "drip_day1_sent_at",    # stamped only when wave fully complete
        "status":    "drip_day1_status",      # 'sending' in progress / 'sent' when done
        "delivered": "drip_day1_delivered",   # cumulative recruiter offset
        "count":     "day1_sent_count",       # kept for compatibility
        "last_date": "drip_day1_last_date",   # NEW: UTC date of last batch
    },
    4: {
        "sent_at":   "drip_day2_sent_at",
        "status":    "drip_day2_status",
        "delivered": "drip_day2_delivered",
        "count":     "day4_sent_count",
        "last_date": "drip_day2_last_date",   # NEW
    },
    8: {
        "sent_at":   "drip_day3_sent_at",
        "status":    "drip_day3_status",
        "delivered": "drip_day3_delivered",
        "count":     "day8_sent_count",
        "last_date": "drip_day3_last_date",   # NEW
    }
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_supabase_url(): return os.getenv("SUPABASE_URL")
def _get_supabase_key(): return os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def _headers():
    key = _get_supabase_key()
    return {
        "apikey":        key,
        "Authorization": f"Bearer {key}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation"
    }

def _get_delay_for_plan(plan_name: str) -> float:
    return PLAN_SEND_DELAYS.get(plan_name, 2.0)

def _get_limit_for_plan(plan_name: str) -> int:
    return PLAN_LIMIT_MAP.get(plan_name, 250)

def _is_business_hours() -> bool:
    """Mon-Fri 9-11 AM EST (14-16 UTC) or 12:30-2 PM EST (17:30-19 UTC)"""
    now = datetime.utcnow()
    if now.weekday() >= 5:
        return False
    hour, minute = now.hour, now.minute
    in_morning   = (14 <= hour < 16)
    in_afternoon = (hour == 17 and minute >= 30) or (hour == 18)
    return in_morning or in_afternoon

def _today_utc_str() -> str:
    """Today's UTC date as YYYY-MM-DD for daily quota comparison."""
    return datetime.utcnow().strftime("%Y-%m-%d")

def _already_sent_today(campaign: dict, drip_day: int) -> bool:
    """
    Returns True  --> today's 50-email quota already used for this campaign+wave.
                      Skip and come back tomorrow.
    Returns False --> no batch sent today, proceed with sending.

    Works by comparing drip_dayX_last_date against today's UTC date string.
    """
    fields    = WAVE_FIELDS[drip_day]
    last_date = campaign.get(fields["last_date"])

    if not last_date:
        return False  # never sent before for this wave

    # Normalize: value may be full ISO datetime or just a date string
    last_date_str = str(last_date)[:10]   # grab YYYY-MM-DD portion only
    today         = _today_utc_str()
    quota_used    = (last_date_str == today)

    if quota_used:
        print(f"[Scheduler] Daily quota used — campaign={campaign['id']} "
              f"wave={drip_day} last_date={last_date_str} today={today} "
              f"-- will resume tomorrow")
    return quota_used


# ─────────────────────────────────────────────────────────────────────────────
# _fetch_recruiters_for_plan
# Fetches the next slice of recruiters using offset-based pagination.
# offset = drip_dayX_delivered = total already sent across all previous days.
# ─────────────────────────────────────────────────────────────────────────────
def _fetch_recruiters_for_plan(plan_name: str, offset: int = 0, batch_size: int = None) -> list:
    """
    Fetch the next batch of recruiters for this plan starting from offset.

    Args:
        plan_name:  e.g. 'starter', 'basic', 'professional'
        offset:     how many recruiters to skip (already sent in previous days)
        batch_size: max to fetch this batch (defaults to DAILY_EMAIL_LIMIT = 50)

    Returns:
        List of dicts: [{email, name, company}, ...]
    """
    supabase_url = _get_supabase_url()
    plan_limit   = _get_limit_for_plan(plan_name)

    if batch_size is None:
        batch_size = DAILY_EMAIL_LIMIT

    remaining = plan_limit - offset
    if remaining <= 0:
        print(f"[Scheduler] No remaining recruiters: plan={plan_name} "
              f"offset={offset} limit={plan_limit}")
        return []

    fetch_limit = min(batch_size, remaining) + 10  # +10 buffer for dedup

    url = (
        f"{supabase_url}/rest/v1/recruiters"
        f"?select=email,name,company"
        f"&is_active=eq.true"
        f"&email_status=eq.active"
        f"&order=id.asc"
        f"&offset={offset}"
        f"&limit={fetch_limit}"
    )

    resp = requests.get(url, headers=_headers())
    if resp.status_code != 200:
        print(f"[Scheduler] Failed to fetch recruiters: {resp.status_code}")
        return []

    need = min(batch_size, remaining)
    seen, result = set(), []
    for r in resp.json():
        email = r.get("email", "").strip().lower()
        if email and email not in seen:
            seen.add(email)
            result.append({
                "email":   email,
                "name":    r.get("name") or "Hiring Manager",
                "company": r.get("company") or "Verified Firm"
            })
        if len(result) >= need:
            break

    print(f"[Scheduler] Fetched {len(result)} recruiters "
          f"(plan={plan_name}, offset={offset}, need={need}, plan_limit={plan_limit})")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# _send_brevo_email — unchanged from original
# ─────────────────────────────────────────────────────────────────────────────
def _send_brevo_email(to_email, to_name, template_id, params):
    resp = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        json={
            "to":         [{"email": to_email, "name": to_name or "Hiring Manager"}],
            "templateId": template_id,
            "params":     params,
            "sender":     {"name": BREVO_SENDER_NAME, "email": BREVO_SENDER_EMAIL},
            "replyTo":    {"email": params.get("candidate_email", BREVO_SENDER_EMAIL)}
        },
        headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"}
    )
    if resp.status_code in [200, 201]:
        return {"success": True, "message_id": resp.json().get("messageId")}
    return {"success": False, "error": resp.text, "status": resp.status_code}


# ─────────────────────────────────────────────────────────────────────────────
# _send_drip_wave
#
# Core sending function. Two guards run before any email is sent:
#   Guard 1: wave already 100% complete? Skip.
#   Guard 2: today's 50-email quota already used? Skip until tomorrow.
#
# If both guards pass, fetches next 50 recruiters starting from
# drip_dayX_delivered offset and sends them one by one.
#
# HOW IT WORKS DAY BY DAY (Starter = 250 recruiters):
#   Day 1: offset=0,   sends  1-50,  delivered=50,  last_date=today
#   Day 2: offset=50,  sends 51-100, delivered=100, last_date=today
#   Day 3: offset=100, sends 101-150, delivered=150, last_date=today
#   Day 4: offset=150, sends 151-200, delivered=200, last_date=today
#   Day 5: offset=200, sends 201-250, delivered=250, wave_complete=True
#          --> drip_day1_sent_at stamped --> Wave 2 unlocked
# ─────────────────────────────────────────────────────────────────────────────
def _send_drip_wave(campaign: dict, drip_day: int) -> dict:
    """
    Send today's batch of 50 emails for a drip wave.
    Enforces hard daily limit of DAILY_EMAIL_LIMIT (50) per campaign per wave.
    """
    template_map = {1: BREVO_TEMPLATE_DAY1, 4: BREVO_TEMPLATE_DAY4, 8: BREVO_TEMPLATE_DAY8}
    template_id  = template_map[drip_day]
    campaign_id  = campaign["id"]
    plan_name    = campaign.get("plan_name", "starter")
    plan_limit   = _get_limit_for_plan(plan_name)
    delay        = _get_delay_for_plan(plan_name)
    fields       = WAVE_FIELDS[drip_day]

    already_sent = int(campaign.get(fields["delivered"]) or 0)

    print(f"[Scheduler] {'='*55}")
    print(f"[Scheduler] Campaign : {campaign_id}")
    print(f"[Scheduler] Wave {drip_day}    : plan={plan_name} "
          f"sent_so_far={already_sent}/{plan_limit} daily_limit={DAILY_EMAIL_LIMIT}")

    # Guard 1: entire wave already complete
    if already_sent >= plan_limit:
        print(f"[Scheduler] Wave already complete ({already_sent}/{plan_limit}) -- skip")
        return {"sent": 0, "failed": 0, "total": plan_limit,
                "cumulative": already_sent, "wave_complete": True, "quota_exceeded": False}

    # Guard 2: today's daily quota already used for this wave
    if _already_sent_today(campaign, drip_day):
        return {"sent": 0, "failed": 0, "total": plan_limit,
                "cumulative": already_sent, "wave_complete": False, "quota_exceeded": True}

    # Fetch today's batch of up to 50 recruiters from offset
    recruiters = _fetch_recruiters_for_plan(
        plan_name  = plan_name,
        offset     = already_sent,
        batch_size = DAILY_EMAIL_LIMIT
    )

    if not recruiters:
        print(f"[Scheduler] No recruiters returned at offset={already_sent}")
        return {"sent": 0, "failed": 0, "total": plan_limit,
                "cumulative": already_sent, "wave_complete": False, "quota_exceeded": False}

    # Build email params from campaign record
    email_params = {
        "candidate_name":   campaign.get("candidate_name",  "Professional Candidate"),
        "candidate_email":  campaign.get("candidate_email", ""),
        "candidate_phone":  campaign.get("candidate_phone", ""),
        "job_role":         campaign.get("job_role",        "Professional"),
        "years_experience": campaign.get("years_experience",""),
        "key_skills":       campaign.get("key_skills",      ""),
        "location":         campaign.get("location",        "Remote"),
        "resume_url":       campaign.get("resume_url",      ""),
        "resume_name":      campaign.get("resume_name",     "Resume.pdf"),
        "drip_day":         drip_day
    }

    # Send today's batch
    sent_this_batch   = 0
    failed_this_batch = 0
    batch_start       = already_sent + 1
    batch_end         = already_sent + len(recruiters)

    print(f"[Scheduler] Sending recruiters {batch_start}-{batch_end} of {plan_limit} "
          f"(delay={delay}s each)")

    for recruiter in recruiters:
        result = _send_brevo_email(
            recruiter["email"], recruiter["name"], template_id, email_params
        )
        if result["success"]:
            sent_this_batch += 1
        else:
            failed_this_batch += 1
            print(f"[Scheduler] Failed: {recruiter['email']} -- "
                  f"{result.get('error','')[:80]}")
        time.sleep(delay)

    cumulative_sent = already_sent + sent_this_batch
    wave_complete   = cumulative_sent >= plan_limit

    print(f"[Scheduler] Batch done -- sent_today={sent_this_batch} "
          f"failed={failed_this_batch} cumulative={cumulative_sent}/{plan_limit} "
          f"wave_complete={wave_complete}")

    return {
        "sent":           sent_this_batch,
        "failed":         failed_this_batch,
        "total":          plan_limit,
        "cumulative":     cumulative_sent,
        "wave_complete":  wave_complete,
        "quota_exceeded": False
    }


# ─────────────────────────────────────────────────────────────────────────────
# _update_campaign_after_wave
#
# Saves progress after every daily batch.
# Always saves drip_dayX_last_date = today so the quota gate works on next tick.
#
# quota_exceeded=True  --> nothing changed, return immediately
# wave_complete=False  --> save offset + last_date. Do NOT set sent_at.
#                          Scheduler picks up again tomorrow.
# wave_complete=True   --> save offset + last_date + stamp sent_at.
#                          Unlocks next wave. Wave 3 completion sets status=completed.
# ─────────────────────────────────────────────────────────────────────────────
def _update_campaign_after_wave(campaign_id: str, drip_day: int, stats: dict):
    """
    Persist today's batch results to blast_campaigns.
    Saves last_date so the daily quota gate prevents re-sending today.
    Only stamps sent_at when the ENTIRE wave is finished.
    """
    if stats.get("quota_exceeded"):
        return   # nothing was sent, nothing to write

    supabase_url  = _get_supabase_url()
    fields        = WAVE_FIELDS[drip_day]
    now           = datetime.utcnow().isoformat()
    today_str     = _today_utc_str()
    cumulative    = stats.get("cumulative", stats.get("sent", 0))
    wave_complete = stats.get("wave_complete", False)

    update = {
        fields["delivered"]: cumulative,
        fields["count"]:     cumulative,
        fields["status"]:    "sent" if wave_complete else "sending",
        fields["last_date"]: today_str,   # quota gate: prevents second send today
        "updated_at":        now
    }

    if wave_complete:
        update[fields["sent_at"]] = now   # unlock next wave
        if drip_day == 8:
            update["status"] = "completed"
        print(f"[Scheduler] Wave {drip_day} COMPLETE -- sent_at stamped "
              f"campaign={campaign_id}")
    else:
        print(f"[Scheduler] Wave {drip_day} IN PROGRESS -- {cumulative} sent total, "
              f"next batch tomorrow -- campaign={campaign_id}")

    resp = requests.patch(
        f"{supabase_url}/rest/v1/blast_campaigns?id=eq.{campaign_id}",
        json=update,
        headers=_headers()
    )
    if resp.status_code in [200, 204]:
        print(f"[Scheduler] Progress saved -- campaign={campaign_id}")
    else:
        print(f"[Scheduler] Failed to save progress: {resp.status_code} {resp.text}")


# ─────────────────────────────────────────────────────────────────────────────
# run_day1_blast
#
# Called immediately after payment verification.
# Sends the FIRST 50 emails of Wave 1 right now (no business hours restriction).
# Sets drip_day1_last_date = today so the scheduler won't re-send today.
# All remaining daily batches (Day 2, 3, 4 ...) are handled by run_scheduler_tick.
# ─────────────────────────────────────────────────────────────────────────────
def run_day1_blast(campaign_id: str) -> dict:
    """
    Called immediately after payment. Sends first 50 Wave 1 emails right now.
    Remaining daily batches handled automatically by the scheduler each day.
    """
    supabase_url = _get_supabase_url()

    resp = requests.get(
        f"{supabase_url}/rest/v1/blast_campaigns?id=eq.{campaign_id}",
        headers=_headers()
    )
    if resp.status_code != 200 or not resp.json():
        print(f"[Drip] Campaign not found: {campaign_id}")
        return {"success": False}

    campaign     = resp.json()[0]
    plan_name    = campaign.get("plan_name", "starter")
    plan_limit   = _get_limit_for_plan(plan_name)
    already_sent = int(campaign.get("drip_day1_delivered") or 0)

    # Guard: wave fully complete already
    if campaign.get("drip_day1_sent_at") and already_sent >= plan_limit:
        print(f"[Drip] Wave 1 fully complete for {campaign_id} ({already_sent}/{plan_limit})")
        return {"success": True, "skipped": True}

    # Guard: duplicate call on same day (e.g. webhook retry)
    if _already_sent_today(campaign, drip_day=1):
        print(f"[Drip] Wave 1 daily quota already used for {campaign_id} -- resumes tomorrow")
        return {"success": True, "skipped": True, "reason": "daily_quota_used"}

    total_days = (plan_limit + DAILY_EMAIL_LIMIT - 1) // DAILY_EMAIL_LIMIT
    print(f"[Drip] Wave 1 blast -- campaign={campaign_id} plan={plan_name} "
          f"sending_today={DAILY_EMAIL_LIMIT} total_wave_days={total_days}")

    stats = _send_drip_wave(campaign, drip_day=1)
    _update_campaign_after_wave(campaign_id, drip_day=1, stats=stats)

    return {"success": True, "stats": stats}


# ─────────────────────────────────────────────────────────────────────────────
# run_scheduler_tick
#
# Called every 30 minutes by APScheduler.
# Processes three types of campaign work each tick:
#
# TYPE A -- Wave 1 daily batches (no business hours restriction)
#   Picks up all campaigns where Wave 1 is not complete (sent_at IS NULL).
#   The daily quota gate inside _send_drip_wave ensures only ONE batch of 50
#   fires per calendar day per campaign, no matter how many ticks run today.
#
# TYPE B -- Wave 2 follow-up daily batches (business hours only)
#   Starts only after Wave 1 is 100% complete (drip_day1_sent_at is set).
#   day4_scheduled_for controls when Wave 2 is first eligible to start.
#   Sends 50/day until all recruiters for this plan are covered.
#
# TYPE C -- Wave 3 reminder daily batches (business hours only)
#   Starts only after Wave 2 is 100% complete (drip_day2_sent_at is set).
#   day8_scheduled_for controls when Wave 3 is first eligible to start.
#   Sends 50/day until all recruiters for this plan are covered.
# ─────────────────────────────────────────────────────────────────────────────
def run_scheduler_tick():
    """Called every 30 minutes by APScheduler. Sends at most 50 emails/campaign/wave/day."""
    now_utc      = datetime.utcnow()
    now_iso      = now_utc.isoformat()
    in_biz_hours = _is_business_hours()
    today_str    = _today_utc_str()

    print(f"\n[Scheduler] {'='*55}")
    print(f"[Scheduler] Tick at        : {now_utc.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"[Scheduler] Today          : {today_str}")
    print(f"[Scheduler] Business hours : {'YES' if in_biz_hours else 'NO'}")
    print(f"[Scheduler] Daily limit    : {DAILY_EMAIL_LIMIT} emails/campaign/wave/day")
    print(f"[Scheduler] {'='*55}")

    supabase_url = _get_supabase_url()

    # ── TYPE A: Wave 1 -- continuing daily batches (no business hours gate) ──
    # Fetches ALL active campaigns where Wave 1 is not yet complete.
    # The _already_sent_today() check inside _send_drip_wave handles campaigns
    # that already sent today -- they are silently skipped.
    resp_a = requests.get(
        f"{supabase_url}/rest/v1/blast_campaigns"
        f"?status=eq.active"
        f"&drip_day1_sent_at=is.null",
        headers=_headers()
    )
    wave1_campaigns = resp_a.json() if resp_a.status_code == 200 else []
    print(f"[Scheduler] Wave 1 active campaigns : {len(wave1_campaigns)}")

    for campaign in wave1_campaigns:
        cid        = campaign["id"]
        already    = int(campaign.get("drip_day1_delivered") or 0)
        plan       = campaign.get("plan_name", "starter")
        plan_limit = _get_limit_for_plan(plan)
        last_date  = campaign.get("drip_day1_last_date", "never")
        print(f"[Scheduler] --> Wave 1 | campaign={cid} | "
              f"{already}/{plan_limit} sent | last_batch={last_date}")
        stats = _send_drip_wave(campaign, drip_day=1)
        _update_campaign_after_wave(cid, drip_day=1, stats=stats)

    # ── TYPE B: Wave 2 follow-up -- business hours only ──────────────────────
    # Conditions to qualify:
    #   drip_day1_sent_at IS NOT NULL  --> Wave 1 fully complete
    #   drip_day2_sent_at IS NULL      --> Wave 2 not yet complete
    #   day4_scheduled_for <= NOW      --> scheduled start date has arrived
    if in_biz_hours:
        resp4 = requests.get(
            f"{supabase_url}/rest/v1/blast_campaigns"
            f"?status=eq.active"
            f"&drip_day1_sent_at=not.is.null"
            f"&drip_day2_sent_at=is.null"
            f"&day4_scheduled_for=lte.{now_iso}",
            headers=_headers()
        )
        wave2_campaigns = resp4.json() if resp4.status_code == 200 else []
        print(f"[Scheduler] Wave 2 campaigns due    : {len(wave2_campaigns)}")

        for campaign in wave2_campaigns:
            cid        = campaign["id"]
            already    = int(campaign.get("drip_day2_delivered") or 0)
            plan       = campaign.get("plan_name", "starter")
            plan_limit = _get_limit_for_plan(plan)
            last_date  = campaign.get("drip_day2_last_date", "never")
            print(f"[Scheduler] --> Wave 2 | campaign={cid} | "
                  f"{already}/{plan_limit} sent | last_batch={last_date}")
            stats = _send_drip_wave(campaign, drip_day=4)
            _update_campaign_after_wave(cid, drip_day=4, stats=stats)
    else:
        print("[Scheduler] Outside business hours -- Wave 2 skipped this tick")

    # ── TYPE C: Wave 3 reminder -- business hours only ────────────────────────
    # Conditions to qualify:
    #   drip_day2_sent_at IS NOT NULL  --> Wave 2 fully complete
    #   drip_day3_sent_at IS NULL      --> Wave 3 not yet complete
    #   day8_scheduled_for <= NOW      --> scheduled start date has arrived
    if in_biz_hours:
        resp8 = requests.get(
            f"{supabase_url}/rest/v1/blast_campaigns"
            f"?status=eq.active"
            f"&drip_day2_sent_at=not.is.null"
            f"&drip_day3_sent_at=is.null"
            f"&day8_scheduled_for=lte.{now_iso}",
            headers=_headers()
        )
        wave3_campaigns = resp8.json() if resp8.status_code == 200 else []
        print(f"[Scheduler] Wave 3 campaigns due    : {len(wave3_campaigns)}")

        for campaign in wave3_campaigns:
            cid        = campaign["id"]
            already    = int(campaign.get("drip_day3_delivered") or 0)
            plan       = campaign.get("plan_name", "starter")
            plan_limit = _get_limit_for_plan(plan)
            last_date  = campaign.get("drip_day3_last_date", "never")
            print(f"[Scheduler] --> Wave 3 | campaign={cid} | "
                  f"{already}/{plan_limit} sent | last_batch={last_date}")
            stats = _send_drip_wave(campaign, drip_day=8)
            _update_campaign_after_wave(cid, drip_day=8, stats=stats)
    else:
        print("[Scheduler] Outside business hours -- Wave 3 skipped this tick")

    if not in_biz_hours:
        print("[Scheduler] Wave 2 & Wave 3 resume at next business hours window")

    print(f"[Scheduler] Tick complete\n")