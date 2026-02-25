"""
Drip Email Scheduler
Runs every 30 minutes via APScheduler.
Checks blast_campaigns table for Day 1 (in-progress), Day 4, and Day 8 emails due.
Works for both registered and guest users.

✅ FIXED: Batch progress tracking — emails never repeat to the same recruiters.

HOW BATCHING WORKS (example: Starter plan = 250 recruiters, batch=50):

  Tick 1  → already_sent=0,   fetches rows 1–100,   sends 100,  saves delivered=100
  Tick 2  → already_sent=100, fetches rows 101–200,  sends 100,  saves delivered=200
  Tick 3  → already_sent=200, fetches rows 201–250,  sends 50,   saves delivered=250
             wave_complete=True → drip_day1_sent_at set → Day 4 can now be scheduled

KEY: drip_dayX_sent_at is only set when ALL recruiters for the wave are sent.
     While in progress it stays NULL so scheduler keeps picking it up each tick.
     drip_dayX_delivered stores the cumulative sent count = the offset for next batch.
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

MAX_EMAILS_PER_BATCH = int(os.getenv("MAX_EMAILS_PER_BATCH", "50"))

# Plan-based delays (seconds between each email) — unchanged
PLAN_SEND_DELAYS = {
    "starter":      2.0,
    "basic":        2.5,
    "professional": 3.0,
    "growth":       3.5,
    "advanced":     4.0,
    "premium":      4.5
}

# Plan recruiter limits — unchanged
PLAN_LIMIT_MAP = {
    "starter":      250,
    "basic":        500,
    "professional": 750,
    "growth":       1000,
    "advanced":     1250,
    "premium":      1500
}

# Maps drip_day → column names in blast_campaigns table
# These column names must match exactly what exists in your Supabase schema
WAVE_FIELDS = {
    1: {
        "sent_at":   "drip_day1_sent_at",    # set only when wave fully complete
        "status":    "drip_day1_status",      # 'sending' while in progress, 'sent' when done
        "delivered": "drip_day1_delivered",   # cumulative count — used as offset for next batch
        "count":     "day1_sent_count"        # same as delivered, kept for compatibility
    },
    4: {
        "sent_at":   "drip_day2_sent_at",
        "status":    "drip_day2_status",
        "delivered": "drip_day2_delivered",
        "count":     "day4_sent_count"
    },
    8: {
        "sent_at":   "drip_day3_sent_at",
        "status":    "drip_day3_status",
        "delivered": "drip_day3_delivered",
        "count":     "day8_sent_count"
    }
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers — unchanged from original
# ─────────────────────────────────────────────────────────────────────────────

def _get_supabase_url(): return os.getenv("SUPABASE_URL")
def _get_supabase_key(): return os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def _headers():
    key = _get_supabase_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
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


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIXED: _fetch_recruiters_for_plan now accepts offset and batch_size
#
# OLD behaviour (bug):
#   Always fetched recruiter rows 1..plan_limit, e.g. rows 1–250 for starter
#   _send_drip_wave would take first 100, then stop. Next tick same 100 again.
#
# NEW behaviour (fixed):
#   Uses Supabase &offset=N to skip already-sent rows, &limit=M to take next slice
#   Tick 1: offset=0   → fetches rows 1–100
#   Tick 2: offset=100 → fetches rows 101–200
#   Tick 3: offset=200 → fetches rows 201–250
#
# The offset value comes from drip_dayX_delivered stored in blast_campaigns.
# ─────────────────────────────────────────────────────────────────────────────
def _fetch_recruiters_for_plan(plan_name: str, offset: int = 0, batch_size: int = None) -> list:
    """
    Fetch the next slice of recruiters for this plan.

    Args:
        plan_name:  Plan key (starter, basic, etc.)
        offset:     Number of recruiters to skip (already sent in previous batches)
        batch_size: Max to fetch this batch (defaults to MAX_EMAILS_PER_BATCH)

    Returns:
        List of recruiter dicts [{email, name, company}, ...]
    """
    supabase_url = _get_supabase_url()
    plan_limit   = _get_limit_for_plan(plan_name)

    if batch_size is None:
        batch_size = MAX_EMAILS_PER_BATCH

    # How many are still left to send for this plan
    remaining = plan_limit - offset
    if remaining <= 0:
        print(f"[Scheduler] No remaining recruiters: plan={plan_name} offset={offset} limit={plan_limit}")
        return []

    # Fetch exactly what we need, plus a small buffer for deduplication
    fetch_limit = min(batch_size, remaining) + 10

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
# ✅ FIXED: _send_drip_wave — reads progress offset, sends NEXT batch only
#
# OLD behaviour (bug):
#   Always fetched all recruiters from row 1, sent first 100, stopped.
#   Next tick would send the same first 100 again.
#
# NEW behaviour (fixed):
#   1. Reads already_sent from campaign's drip_dayX_delivered column
#   2. Passes already_sent as offset to _fetch_recruiters_for_plan
#   3. Only fetches the NEXT batch of up to MAX_EMAILS_PER_BATCH
#   4. Returns cumulative total so _update_campaign_after_wave can save correctly
#
# Example — Basic plan (500 recruiters):
#   Tick 1: already_sent=0   → fetches 1–50,    sends 50,  cumulative=50
#   Tick 2: already_sent=50  → fetches 51–100,  sends 50,  cumulative=100
#   Tick 3: already_sent=100 → fetches 101–150, sends 50,  cumulative=150
#   ...
#   Tick 10: already_sent=450 → fetches 451–500, sends 50, cumulative=500
#            wave_complete=True → drip_day1_sent_at stamped → Day 4 unlocked
# ─────────────────────────────────────────────────────────────────────────────
def _send_drip_wave(campaign: dict, drip_day: int) -> dict:
    """
    Send the next batch of emails for a drip wave.
    Continues from where the last batch stopped.
    """
    template_map = {
        1: BREVO_TEMPLATE_DAY1,
        4: BREVO_TEMPLATE_DAY4,
        8: BREVO_TEMPLATE_DAY8
    }
    template_id = template_map[drip_day]
    campaign_id = campaign["id"]
    plan_name   = campaign.get("plan_name", "starter")
    plan_limit  = _get_limit_for_plan(plan_name)
    delay       = _get_delay_for_plan(plan_name)
    fields      = WAVE_FIELDS[drip_day]

    # ── Read how many were already sent in previous batches ────────────────
    already_sent = int(campaign.get(fields["delivered"]) or 0)

    print(f"[Scheduler] {'='*55}")
    print(f"[Scheduler] Campaign : {campaign_id}")
    print(f"[Scheduler] Day {drip_day} wave  : plan={plan_name} "
          f"limit={plan_limit} already_sent={already_sent}")

    # ── Guard: wave already fully complete ─────────────────────────────────
    if already_sent >= plan_limit:
        print(f"[Scheduler] ✅ Wave already complete ({already_sent}/{plan_limit}) — skip")
        return {"sent": 0, "failed": 0, "total": plan_limit,
                "cumulative": already_sent, "wave_complete": True}

    # ── Fetch ONLY the next batch starting from already_sent offset ────────
    recruiters = _fetch_recruiters_for_plan(
        plan_name  = plan_name,
        offset     = already_sent,
        batch_size = MAX_EMAILS_PER_BATCH
    )

    if not recruiters:
        print(f"[Scheduler] ⚠️ No recruiters returned at offset={already_sent}")
        return {"sent": 0, "failed": 0, "total": plan_limit,
                "cumulative": already_sent, "wave_complete": False}

    # ── Build email params from campaign record ────────────────────────────
    email_params = {
        "candidate_name":   campaign.get("candidate_name",  "Professional Candidate"),
        "candidate_email":  campaign.get("candidate_email", ""),
        "candidate_phone":  campaign.get("candidate_phone", ""),
        "job_role":         campaign.get("job_role",         "Professional"),
        "years_experience": campaign.get("years_experience", ""),
        "key_skills":       campaign.get("key_skills",       ""),
        "location":         campaign.get("location",         "Remote"),
        "resume_url":       campaign.get("resume_url",       ""),
        "resume_name":      campaign.get("resume_name",      "Resume.pdf"),
        "drip_day":         drip_day
    }

    # ── Send this batch ────────────────────────────────────────────────────
    sent_this_batch  = 0
    failed_this_batch = 0

    batch_start = already_sent + 1
    batch_end   = already_sent + len(recruiters)
    print(f"[Scheduler] Sending recruiters {batch_start}–{batch_end} of {plan_limit} "
          f"(delay={delay}s each)")

    for recruiter in recruiters:
        result = _send_brevo_email(
            recruiter["email"],
            recruiter["name"],
            template_id,
            email_params
        )
        if result["success"]:
            sent_this_batch += 1
        else:
            failed_this_batch += 1
            print(f"[Scheduler] ❌ Failed: {recruiter['email']} — "
                  f"{result.get('error','')[:80]}")
        time.sleep(delay)

    # ── Calculate cumulative totals ────────────────────────────────────────
    cumulative_sent = already_sent + sent_this_batch
    wave_complete   = cumulative_sent >= plan_limit

    print(f"[Scheduler] Batch done — "
          f"this_batch={sent_this_batch} failed={failed_this_batch} "
          f"cumulative={cumulative_sent}/{plan_limit} complete={wave_complete}")

    return {
        "sent":          sent_this_batch,
        "failed":        failed_this_batch,
        "total":         plan_limit,
        "cumulative":    cumulative_sent,
        "wave_complete": wave_complete
    }


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIXED: _update_campaign_after_wave — two behaviours based on wave_complete
#
# OLD behaviour (bug):
#   Always set drip_dayX_sent_at = NOW and drip_dayX_delivered = sent_this_batch
#   This marked the wave as done after only the first 100 emails.
#   Next tick would see sent_at is set and skip the rest entirely.
#
# NEW behaviour (fixed):
#   wave_complete=False (still more recruiters to send):
#     → saves cumulative delivered count as the offset for next batch
#     → does NOT set sent_at → scheduler picks campaign up again next tick
#     → sets status='sending' to show it is in progress
#
#   wave_complete=True (all recruiters for this wave have been sent):
#     → saves final delivered count
#     → sets sent_at=NOW → signals wave is truly done
#     → sets status='sent'
#     → for Day 8 also sets campaign status='completed'
# ─────────────────────────────────────────────────────────────────────────────
def _update_campaign_after_wave(campaign_id: str, drip_day: int, stats: dict):
    """
    Save batch progress to blast_campaigns.
    Only marks wave complete (sets sent_at) when ALL recruiters have been sent.
    """
    supabase_url  = _get_supabase_url()
    fields        = WAVE_FIELDS[drip_day]
    now           = datetime.utcnow().isoformat()
    cumulative    = stats.get("cumulative", stats.get("sent", 0))
    wave_complete = stats.get("wave_complete", False)

    update = {
        fields["delivered"]: cumulative,
        fields["count"]:     cumulative,
        fields["status"]:    "sent" if wave_complete else "sending",
        "updated_at":        now
    }

    if wave_complete:
        # Wave is fully done — stamp sent_at so scheduler won't process it again
        update[fields["sent_at"]] = now
        if drip_day == 8:
            update["status"] = "completed"
        print(f"[Scheduler] ✅ Day {drip_day} wave COMPLETE — "
              f"sent_at stamped for campaign {campaign_id}")
    else:
        # Still more to send — do NOT set sent_at
        # Scheduler will pick this campaign up again next tick automatically
        # because drip_dayX_sent_at is still NULL
        print(f"[Scheduler] 🔄 Day {drip_day} IN PROGRESS — "
              f"{cumulative} sent, resuming next tick for campaign {campaign_id}")

    resp = requests.patch(
        f"{supabase_url}/rest/v1/blast_campaigns?id=eq.{campaign_id}",
        json=update,
        headers=_headers()
    )
    if resp.status_code in [200, 204]:
        print(f"[Scheduler] ✅ Progress saved for {campaign_id}")
    else:
        print(f"[Scheduler] ❌ Failed to save progress: {resp.status_code} {resp.text}")


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIXED: run_day1_blast — handles both fresh start and batch resume
#
# OLD behaviour (bug):
#   Checked drip_day1_sent_at — if set, skipped.
#   But sent_at was being set after only first 100 emails, so rest were never sent.
#
# NEW behaviour (fixed):
#   Checks drip_day1_delivered to see how many already sent.
#   If 0 → fresh start, sends first batch.
#   If >0 and < plan_limit → resumes from where it left off.
#   If >= plan_limit → truly complete, skips.
#   drip_day1_sent_at is only set by _update_campaign_after_wave when fully done.
# ─────────────────────────────────────────────────────────────────────────────
def run_day1_blast(campaign_id: str) -> dict:
    """
    Called immediately after payment.
    Sends the first (or next) batch of Day 1 emails.
    Remaining batches are handled by run_scheduler_tick on future ticks.
    Day 1 fires immediately — no business hours restriction.
    """
    supabase_url = _get_supabase_url()

    resp = requests.get(
        f"{supabase_url}/rest/v1/blast_campaigns?id=eq.{campaign_id}",
        headers=_headers()
    )
    if resp.status_code != 200 or not resp.json():
        print(f"[Drip] ❌ Campaign not found: {campaign_id}")
        return {"success": False}

    campaign     = resp.json()[0]
    plan_name    = campaign.get("plan_name", "starter")
    plan_limit   = _get_limit_for_plan(plan_name)
    already_sent = int(campaign.get("drip_day1_delivered") or 0)

    # Guard: wave truly complete (sent_at set AND all recruiters sent)
    if campaign.get("drip_day1_sent_at") and already_sent >= plan_limit:
        print(f"[Drip] ⏭️ Day 1 fully complete for {campaign_id} ({already_sent}/{plan_limit})")
        return {"success": True, "skipped": True}

    print(f"[Drip] 🚀 Day 1 blast — campaign={campaign_id} "
          f"plan={plan_name} already_sent={already_sent}/{plan_limit}")

    stats = _send_drip_wave(campaign, drip_day=1)
    _update_campaign_after_wave(campaign_id, drip_day=1, stats=stats)

    return {"success": True, "stats": stats}


# ─────────────────────────────────────────────────────────────────────────────
# ✅ FIXED: run_scheduler_tick — now handles 3 campaign types per tick
#
# TYPE A — Day 1 in-progress (plan_limit > batch_size, Day 1 not fully sent yet)
#   Query: status=active, drip_day1_sent_at IS NULL, drip_day1_delivered > 0
#   Action: Continue sending next batch for Day 1 (no business hours check)
#   Why no hours check: Day 1 fires right after payment, we don't want to delay
#                       the remaining batches to next day
#
# TYPE B — Day 4 due (Day 1 fully complete, Day 4 not started or in-progress)
#   Query: status=active, drip_day1_sent_at NOT NULL,
#          drip_day2_sent_at IS NULL, day4_scheduled_for <= NOW
#   Action: Send next batch for Day 4 (business hours only)
#   Note: This also picks up in-progress Day 4 batches automatically
#         because drip_day2_sent_at stays NULL until fully complete
#
# TYPE C — Day 8 due (Day 4 fully complete, Day 8 not started or in-progress)
#   Query: status=active, drip_day2_sent_at NOT NULL,
#          drip_day3_sent_at IS NULL, day8_scheduled_for <= NOW
#   Action: Send next batch for Day 8 (business hours only)
# ─────────────────────────────────────────────────────────────────────────────
def run_scheduler_tick():
    """Called every 30 minutes by APScheduler. Processes all pending drip batches."""
    now_utc      = datetime.utcnow()
    now_iso      = now_utc.isoformat()
    in_biz_hours = _is_business_hours()

    print(f"\n[Scheduler] {'='*55}")
    print(f"[Scheduler] Tick at {now_utc.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"[Scheduler] Business hours: {'✅ YES' if in_biz_hours else '⏰ NO'}")
    print(f"[Scheduler] {'='*55}")

    supabase_url = _get_supabase_url()

    # ── TYPE A: Day 1 in-progress batches ─────────────────────────────────
    # Campaigns where Day 1 started but hasn't finished all batches yet.
    # drip_day1_sent_at IS NULL = not fully complete
    # drip_day1_delivered > 0   = at least one batch already sent
    # No business hours check — continue Day 1 immediately
    resp_a = requests.get(
        f"{supabase_url}/rest/v1/blast_campaigns"
        f"?status=eq.active"
        f"&drip_day1_sent_at=is.null"
        f"&drip_day1_delivered=gt.0",
        headers=_headers()
    )
    day1_inprogress = resp_a.json() if resp_a.status_code == 200 else []

    if day1_inprogress:
        print(f"[Scheduler] Day 1 in-progress campaigns: {len(day1_inprogress)}")
        for campaign in day1_inprogress:
            cid         = campaign["id"]
            already     = int(campaign.get("drip_day1_delivered") or 0)
            plan        = campaign.get("plan_name", "starter")
            plan_limit  = _get_limit_for_plan(plan)
            print(f"[Scheduler] Resuming Day 1 for {cid}: {already}/{plan_limit} sent")
            stats = _send_drip_wave(campaign, drip_day=1)
            _update_campaign_after_wave(cid, drip_day=1, stats=stats)
    else:
        print("[Scheduler] No Day 1 in-progress campaigns")

    # ── TYPE B: Day 4 due (business hours only) ────────────────────────────
    # drip_day1_sent_at NOT NULL = Day 1 fully complete (all batches done)
    # drip_day2_sent_at IS NULL  = Day 4 not fully complete yet
    # day4_scheduled_for <= NOW  = it's time to send
    # This query automatically picks up both fresh Day 4 starts AND
    # in-progress Day 4 batches because sent_at stays NULL while in progress
    if in_biz_hours:
        resp4 = requests.get(
            f"{supabase_url}/rest/v1/blast_campaigns"
            f"?status=eq.active"
            f"&drip_day1_sent_at=not.is.null"
            f"&drip_day2_sent_at=is.null"
            f"&day4_scheduled_for=lte.{now_iso}",
            headers=_headers()
        )
        day4_campaigns = resp4.json() if resp4.status_code == 200 else []
        print(f"[Scheduler] Day 4 campaigns due: {len(day4_campaigns)}")

        for campaign in day4_campaigns:
            cid        = campaign["id"]
            already    = int(campaign.get("drip_day2_delivered") or 0)
            plan       = campaign.get("plan_name", "starter")
            plan_limit = _get_limit_for_plan(plan)
            print(f"[Scheduler] Processing Day 4 for {cid}: {already}/{plan_limit} sent")
            stats = _send_drip_wave(campaign, drip_day=4)
            _update_campaign_after_wave(cid, drip_day=4, stats=stats)

    # ── TYPE C: Day 8 due (business hours only) ────────────────────────────
    # drip_day2_sent_at NOT NULL = Day 4 fully complete
    # drip_day3_sent_at IS NULL  = Day 8 not fully complete yet
    # day8_scheduled_for <= NOW  = it's time to send
    if in_biz_hours:
        resp8 = requests.get(
            f"{supabase_url}/rest/v1/blast_campaigns"
            f"?status=eq.active"
            f"&drip_day2_sent_at=not.is.null"
            f"&drip_day3_sent_at=is.null"
            f"&day8_scheduled_for=lte.{now_iso}",
            headers=_headers()
        )
        day8_campaigns = resp8.json() if resp8.status_code == 200 else []
        print(f"[Scheduler] Day 8 campaigns due: {len(day8_campaigns)}")

        for campaign in day8_campaigns:
            cid        = campaign["id"]
            already    = int(campaign.get("drip_day3_delivered") or 0)
            plan       = campaign.get("plan_name", "starter")
            plan_limit = _get_limit_for_plan(plan)
            print(f"[Scheduler] Processing Day 8 for {cid}: {already}/{plan_limit} sent")
            stats = _send_drip_wave(campaign, drip_day=8)
            _update_campaign_after_wave(cid, drip_day=8, stats=stats)

    if not in_biz_hours:
        print("[Scheduler] Outside business hours — Day 4 & Day 8 skipped")

    print(f"[Scheduler] Tick complete\n")