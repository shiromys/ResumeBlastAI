"""
Drip Email Scheduler
Runs every 30 minutes via APScheduler.
Checks blast_campaigns table for Wave 1, Wave 2, and Wave 3 emails due.
Works for both registered and guest users.

DAILY QUOTA ENFORCED: Max 50 emails per campaign per wave per calendar day.

WAVE TRIGGER LOGIC:
  Wave 1 → starts immediately when campaign is created (status=active)
  Wave 2 → starts automatically the next business-hours tick AFTER Wave 1 completes
  Wave 3 → starts automatically the next business-hours tick AFTER Wave 2 completes
  No fixed scheduled dates used — waves chain directly on completion.
  Weekends and non-business hours are skipped for Wave 2 and Wave 3.
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

DAILY_EMAIL_LIMIT = int(os.getenv("DAILY_EMAIL_LIMIT", "50"))

PLAN_SEND_DELAYS = {
    "starter":      2.0,
    "basic":        2.5,
    "professional": 3.0,
    "growth":       3.5,
    "advanced":     4.0,
    "premium":      4.5
}

PLAN_LIMIT_MAP = {
    "starter":      250,
    "basic":        500,
    "professional": 750,
    "growth":       1000,
    "advanced":     1250,
    "premium":      1500
}

WAVE_FIELDS = {
    1: {
        "sent_at":   "drip_day1_sent_at",
        "status":    "drip_day1_status",
        "delivered": "drip_day1_delivered",
        "count":     "day1_sent_count",
        "last_date": "drip_day1_last_date",
    },
    4: {
        "sent_at":   "drip_day2_sent_at",
        "status":    "drip_day2_status",
        "delivered": "drip_day2_delivered",
        "count":     "day4_sent_count",
        "last_date": "drip_day2_last_date",
    },
    8: {
        "sent_at":   "drip_day3_sent_at",
        "status":    "drip_day3_status",
        "delivered": "drip_day3_delivered",
        "count":     "day8_sent_count",
        "last_date": "drip_day3_last_date",
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
    now = datetime.utcnow()
    if now.weekday() >= 5:
        return False
    hour, minute = now.hour, now.minute
    in_morning   = (14 <= hour < 16)
    in_afternoon = (hour == 17 and minute >= 30) or (hour == 18)
    return in_morning or in_afternoon

def _today_utc_str() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")

def _already_sent_today(campaign: dict, drip_day: int) -> bool:
    fields    = WAVE_FIELDS[drip_day]
    last_date = campaign.get(fields["last_date"])

    if not last_date:
        return False

    last_date_str = str(last_date)[:10]
    today         = _today_utc_str()
    quota_used    = (last_date_str == today)

    if quota_used:
        print(f"[Scheduler] Daily quota used — campaign={campaign['id']} "
              f"wave={drip_day} last_date={last_date_str} today={today} "
              f"-- will resume tomorrow")
    return quota_used


# ─────────────────────────────────────────────────────────────────────────────
# _fetch_recruiters_for_plan
# ─────────────────────────────────────────────────────────────────────────────
def _fetch_recruiters_for_plan(plan_name: str, offset: int = 0, batch_size: int = None) -> list:
    """
    Fetch the next batch of recruiters for this plan starting from offset.
    """
    supabase_url = _get_supabase_url()
    plan_limit   = _get_limit_for_plan(plan_name)

    if batch_size is None:
        batch_size = DAILY_EMAIL_LIMIT

    remaining = plan_limit - offset
    if remaining <= 0:
        return []

    fetch_limit = min(batch_size, remaining) + 10

    # ── EXACT SCHEMA MATCH ──
    # We select only 'email' and order by 'id' safely since both exist.
    url = (
        f"{supabase_url}/rest/v1/recruiters"
        f"?select=email"
        f"&order=id.asc"
        f"&limit={fetch_limit}"
        f"&offset={offset}"
    )

    resp = requests.get(url, headers=_headers())

    if resp.status_code not in [200, 206]:
        print(f"[Scheduler] Failed to fetch recruiters: {resp.status_code}")
        print(f"[Scheduler] SUPABASE ERROR DETAILS: {resp.text}")
        return []

    need = min(batch_size, remaining)
    seen, result = set(), []

    for r in resp.json():
        # Safely extract email. If it's missing or null, skip this row.
        email = r.get("email")
        if not email:
            continue

        email = str(email).strip().lower()
        if email and email not in seen:
            seen.add(email)
            result.append({
                "email":   email,
                "name":    "Hiring Manager",    # Hardcoded fallback
                "company": "Verified Firm"      # Hardcoded fallback
            })
        if len(result) >= need:
            break

    print(f"[Scheduler] Fetched {len(result)} recruiters "
          f"(plan={plan_name}, offset={offset}, need={need}, plan_limit={plan_limit})")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# _send_brevo_email
# ─────────────────────────────────────────────────────────────────────────────
def _send_brevo_email(to_email, to_name, template_id, params):
    reply_to_email = params.get("candidate_email")
    if not reply_to_email:
        reply_to_email = BREVO_SENDER_EMAIL

    resp = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        json={
            "to":         [{"email": to_email, "name": to_name or "Hiring Manager"}],
            "templateId": template_id,
            "params":     params,
            "sender":     {"name": BREVO_SENDER_NAME, "email": BREVO_SENDER_EMAIL},
            "replyTo":    {"email": reply_to_email}
        },
        headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"}
    )
    if resp.status_code in [200, 201]:
        return {"success": True, "message_id": resp.json().get("messageId")}
    return {"success": False, "error": resp.text, "status": resp.status_code}


# ─────────────────────────────────────────────────────────────────────────────
# _send_drip_wave
# ─────────────────────────────────────────────────────────────────────────────
def _send_drip_wave(campaign: dict, drip_day: int) -> dict:
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

    if already_sent >= plan_limit:
        return {"sent": 0, "failed": 0, "total": plan_limit,
                "cumulative": already_sent, "wave_complete": True, "quota_exceeded": False}

    if _already_sent_today(campaign, drip_day):
        return {"sent": 0, "failed": 0, "total": plan_limit,
                "cumulative": already_sent, "wave_complete": False, "quota_exceeded": True}

    recruiters = _fetch_recruiters_for_plan(
        plan_name  = plan_name,
        offset     = already_sent,
        batch_size = DAILY_EMAIL_LIMIT
    )

    if not recruiters:
        print(f"[Scheduler] No recruiters returned at offset={already_sent}")
        return {"sent": 0, "failed": 0, "total": plan_limit,
                "cumulative": already_sent, "wave_complete": False, "quota_exceeded": False}

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
            print(f"[Scheduler] Failed: {recruiter['email']} -- {result.get('error','')[:80]}")
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
# ─────────────────────────────────────────────────────────────────────────────
def _update_campaign_after_wave(campaign_id: str, drip_day: int, stats: dict):
    if stats.get("quota_exceeded"):
        return

    supabase_url  = _get_supabase_url()
    fields        = WAVE_FIELDS[drip_day]
    now           = datetime.utcnow().isoformat()
    today_str     = _today_utc_str()
    cumulative    = stats.get("cumulative", stats.get("sent", 0))
    wave_complete = stats.get("wave_complete", False)

    emails_sent_this_batch = stats.get("sent", 0)

    update = {
        fields["delivered"]: cumulative,
        fields["count"]:     cumulative,
        fields["status"]:    "sent" if wave_complete else "sending",
    }

    # ✅ PERMANENT FIX 1: Only stamp last_date if emails were ACTUALLY sent.
    #
    # ROOT CAUSE OF RECURRING BUG:
    #   Before this fix, last_date was ALWAYS set — even when sent=0 (Brevo
    #   failed or network error). This caused _already_sent_today() to return
    #   True on every subsequent scheduler tick for the rest of that calendar day,
    #   permanently skipping the campaign. For a new user whose payment just
    #   completed, Day 1 emails were never sent — and no emails until next day.
    #
    # WITH THIS FIX:
    #   If Brevo fails and sent=0, last_date stays NULL.
    #   _already_sent_today() returns False on every tick.
    #   Scheduler retries every 30 minutes until emails actually go through.
    #   User gets Day 1 emails as soon as Brevo recovers — same day as payment.
    if emails_sent_this_batch > 0:
        update[fields["last_date"]] = today_str
        print(f"[Scheduler] last_date stamped ({today_str}) -- "
              f"{emails_sent_this_batch} emails sent this batch")
    else:
        print(f"[Scheduler] last_date NOT stamped -- sent=0, will retry next tick")

    if wave_complete:
        update[fields["sent_at"]] = now

        # ✅ FIX 3: Initialize next wave status to 'pending' when current wave
        # completes. This prevents drip_day2_status / drip_day3_status from
        # staying NULL and ensures the next wave is picked up on the very next
        # business-hours scheduler tick — no fixed scheduled dates needed.
        if drip_day == 1:
            # Wave 1 complete → initialize Wave 2 and Wave 3 as pending
            # Wave 2 will be picked up on the next business-hours tick automatically
            update["drip_day2_status"] = "pending"
            update["drip_day3_status"] = "pending"
            print(f"[Scheduler] Wave 1 COMPLETE -- "
                  f"drip_day2_status & drip_day3_status set to 'pending' "
                  f"-- Wave 2 will start next business-hours tick "
                  f"-- campaign={campaign_id}")

        elif drip_day == 4:
            # Wave 2 complete → ensure Wave 3 is pending
            # Wave 3 will be picked up on the next business-hours tick automatically
            update["drip_day3_status"] = "pending"
            print(f"[Scheduler] Wave 2 COMPLETE -- "
                  f"drip_day3_status set to 'pending' "
                  f"-- Wave 3 will start next business-hours tick "
                  f"-- campaign={campaign_id}")

        elif drip_day == 8:
            # Wave 3 complete → entire campaign is done
            update["status"] = "completed"
            print(f"[Scheduler] Wave 3 COMPLETE -- "
                  f"campaign marked as completed "
                  f"-- campaign={campaign_id}")

        print(f"[Scheduler] Wave {drip_day} COMPLETE -- sent_at stamped campaign={campaign_id}")

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
# ─────────────────────────────────────────────────────────────────────────────
def run_day1_blast(campaign_id: str) -> dict:
    supabase_url = _get_supabase_url()

    resp = requests.get(
        f"{supabase_url}/rest/v1/blast_campaigns?id=eq.{campaign_id}",
        headers=_headers()
    )
    if resp.status_code != 200 or not resp.json():
        return {"success": False}

    campaign     = resp.json()[0]
    plan_name    = campaign.get("plan_name", "starter")
    plan_limit   = _get_limit_for_plan(plan_name)
    already_sent = int(campaign.get("drip_day1_delivered") or 0)

    if campaign.get("drip_day1_sent_at") and already_sent >= plan_limit:
        return {"success": True, "skipped": True}

    if _already_sent_today(campaign, drip_day=1):
        return {"success": True, "skipped": True, "reason": "daily_quota_used"}

    total_days = (plan_limit + DAILY_EMAIL_LIMIT - 1) // DAILY_EMAIL_LIMIT
    print(f"[Drip] Wave 1 blast -- campaign={campaign_id} plan={plan_name} "
          f"sending_today={DAILY_EMAIL_LIMIT} total_wave_days={total_days}")

    stats = _send_drip_wave(campaign, drip_day=1)
    _update_campaign_after_wave(campaign_id, drip_day=1, stats=stats)

    return {"success": True, "stats": stats}


# ─────────────────────────────────────────────────────────────────────────────
# run_scheduler_tick
# ─────────────────────────────────────────────────────────────────────────────
def run_scheduler_tick():
    now_utc      = datetime.utcnow()
    in_biz_hours = _is_business_hours()
    today_str    = _today_utc_str()

    print(f"\n[Scheduler] {'='*55}")
    print(f"[Scheduler] Tick at        : {now_utc.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"[Scheduler] Today          : {today_str}")
    print(f"[Scheduler] Business hours : {'YES' if in_biz_hours else 'NO'}")
    print(f"[Scheduler] Daily limit    : {DAILY_EMAIL_LIMIT} emails/campaign/wave/day")
    print(f"[Scheduler] {'='*55}")

    supabase_url = _get_supabase_url()

    # ─────────────────────────────────────────────────────────────────────────
    # WAVE 1 — Runs every tick (no business hours restriction)
    #
    # ✅ PERMANENT FIX: Query picks up BOTH 'active' AND 'initiated' campaigns.
    #
    # ROOT CAUSE OF RECURRING BUG:
    #   When a user pays, the campaign is created with status='initiated'.
    #   blast.py attempts the first send but may fail silently (backend error,
    #   timeout, etc.) leaving status stuck at 'initiated' forever.
    #   The old query only checked status='active' so the scheduler
    #   never found these campaigns — Wave 1 never started.
    #
    # HOW THIS FIX WORKS:
    #   1. Fetch both 'active' AND 'initiated' campaigns with no drip_day1_sent_at
    #   2. When an 'initiated' campaign is found, promote it to 'active' first
    #   3. Then send Wave 1 emails normally
    #   Result: No manual DB intervention ever needed again. The scheduler
    #   automatically rescues any stuck campaign within 30 minutes.
    # ─────────────────────────────────────────────────────────────────────────
    resp_a = requests.get(
        f"{supabase_url}/rest/v1/blast_campaigns"
        f"?status=in.(active,initiated)"
        f"&drip_day1_sent_at=is.null",
        headers=_headers()
    )
    wave1_campaigns = resp_a.json() if resp_a.status_code == 200 else []
    print(f"[Scheduler] Wave 1 campaigns found  : {len(wave1_campaigns)} "
          f"(active + initiated)")

    for campaign in wave1_campaigns:
        cid        = campaign["id"]
        already    = int(campaign.get("drip_day1_delivered") or 0)
        plan       = campaign.get("plan_name", "starter")
        plan_limit = _get_limit_for_plan(plan)
        last_date  = campaign.get("drip_day1_last_date", "never")
        camp_status = campaign.get("status", "unknown")

        # ✅ Auto-promote 'initiated' → 'active' before sending
        # This permanently fixes campaigns stuck after payment
        if camp_status == "initiated":
            promote_resp = requests.patch(
                f"{supabase_url}/rest/v1/blast_campaigns?id=eq.{cid}",
                json={"status": "active"},
                headers=_headers()
            )
            if promote_resp.status_code in [200, 204]:
                print(f"[Scheduler] ✅ Auto-promoted campaign "
                      f"initiated→active | campaign={cid}")
                campaign["status"] = "active"
            else:
                print(f"[Scheduler] ⚠️ Failed to promote campaign "
                      f"status: {promote_resp.status_code} | campaign={cid}")
                continue  # Skip this campaign this tick, retry next tick

        print(f"[Scheduler] --> Wave 1 | campaign={cid} | "
              f"{already}/{plan_limit} sent | last_batch={last_date}")
        stats = _send_drip_wave(campaign, drip_day=1)
        _update_campaign_after_wave(cid, drip_day=1, stats=stats)

    # ─────────────────────────────────────────────────────────────────────────
    # WAVE 2 — Business hours only. Weekends skipped via _is_business_hours().
    #
    # ✅ FIX 1: Removed &day4_scheduled_for=lte.{now_iso} condition.
    # Wave 2 now triggers immediately on the next business-hours tick after
    # Wave 1 completes (drip_day1_sent_at is set). No fixed date delay.
    # ─────────────────────────────────────────────────────────────────────────
    if in_biz_hours:
        resp4 = requests.get(
            f"{supabase_url}/rest/v1/blast_campaigns"
            f"?status=eq.active"
            f"&drip_day1_sent_at=not.is.null"
            f"&drip_day2_sent_at=is.null",
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

    # ─────────────────────────────────────────────────────────────────────────
    # WAVE 3 — Business hours only. Weekends skipped via _is_business_hours().
    #
    # ✅ FIX 2: Removed &day8_scheduled_for=lte.{now_iso} condition.
    # Wave 3 now triggers immediately on the next business-hours tick after
    # Wave 2 completes (drip_day2_sent_at is set). No fixed date delay.
    # ─────────────────────────────────────────────────────────────────────────
    if in_biz_hours:
        resp8 = requests.get(
            f"{supabase_url}/rest/v1/blast_campaigns"
            f"?status=eq.active"
            f"&drip_day2_sent_at=not.is.null"
            f"&drip_day3_sent_at=is.null",
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