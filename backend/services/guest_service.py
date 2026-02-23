# backend/services/guest_service.py
import os
import requests
from datetime import datetime
from urllib.parse import quote


class GuestService:
    """
    Handles ALL data storage for non-registered (guest) users.

    REMOVED COLUMNS (dropped from DB, no longer written):
        file_size, extracted_text, blast_status, blast_completed_at,
        location, blast_plan, analysis_data, activity_log, resume_history
    """

    @staticmethod
    def _headers():
        key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        return {
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }

    @staticmethod
    def _base_url():
        return f"{os.getenv('SUPABASE_URL')}/rest/v1/guest_users"

    @staticmethod
    def is_guest(user_id: str) -> bool:
        return str(user_id or '').startswith('guest_')

    # ─────────────────────────────────────────────────────────────────────
    # PRIVATE HELPERS
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def _exists(guest_id: str) -> bool:
        try:
            url = f"{GuestService._base_url()}?id=eq.{guest_id}&select=id"
            resp = requests.get(url, headers=GuestService._headers(), timeout=10)
            exists = resp.status_code == 200 and len(resp.json()) > 0
            print(f"[GuestService] _exists({guest_id}): {exists}")
            return exists
        except Exception as e:
            print(f"[GuestService] _exists ERROR: {e}")
            return False

    @staticmethod
    def _update_ip(guest_id: str, ip_address: str) -> None:
        try:
            GuestService._patch_latest(guest_id, {'ip_address': ip_address})
        except Exception as e:
            print(f"[GuestService] _update_ip ERROR: {e}")

    @staticmethod
    def _insert(guest_id: str, fields: dict) -> bool:
        """
        Insert a new row.
        ✅ ONLY uses columns confirmed to exist in guest_users table.
        ✅ Does NOT include activity_log or resume_history (not in DB schema).
        """
        try:
            now = datetime.utcnow().isoformat() + 'Z'
            data = {
                'id':             guest_id,
                'created_at':     now,
                'last_active_at': now,
                'payment_status': 'pending',
                'resume_status':  'not_uploaded',
                'ip_history':     [],
                'metadata':       {},
                **fields
            }
            print(f"[GuestService] _insert attempting for {guest_id} with keys: {list(data.keys())}")
            resp = requests.post(
                GuestService._base_url(),
                json=data,
                headers=GuestService._headers(),
                timeout=10
            )
            success = resp.status_code in [200, 201]
            if success:
                print(f"[GuestService] _insert SUCCESS for {guest_id}")
            else:
                print(f"[GuestService] _insert FAILED: {resp.status_code} — {resp.text}")
            return success
        except Exception as e:
            print(f"[GuestService] _insert ERROR: {e}")
            return False

    @staticmethod
    def _ensure_row_exists(guest_id: str) -> bool:
        """
        ✅ KEY FIX: Guarantees a guest row exists before any patch/read.
        Called before every _patch_latest to prevent 500 errors when
        /resume or /analysis fires before /init has completed.
        """
        if GuestService._exists(guest_id):
            return True
        print(f"[GuestService] ⚠️ No row for {guest_id} — auto-creating now")
        return GuestService._insert(guest_id, {'visit_count': 1})

    @staticmethod
    def _get_latest_row(guest_id: str):
        """
        Returns (url_encoded_created_at, row) for the newest session row.
        """
        try:
            url = (
                f"{GuestService._base_url()}"
                f"?id=eq.{guest_id}"
                f"&order=created_at.desc"
                f"&limit=1"
                f"&select=id,created_at,metadata"
            )
            resp = requests.get(url, headers=GuestService._headers(), timeout=10)
            if resp.status_code == 200 and resp.json():
                row = resp.json()[0]
                raw_ts = row.get('created_at', '')
                encoded_ts = quote(raw_ts, safe='')
                return encoded_ts, row
            print(f"[GuestService] _get_latest_row: No rows found for {guest_id}")
            return None, None
        except Exception as e:
            print(f"[GuestService] _get_latest_row ERROR: {e}")
            return None, None

    @staticmethod
    def _patch_latest(guest_id: str, fields: dict) -> bool:
        """
        ✅ FIXED: Calls _ensure_row_exists first so the row always exists.
        Patches ONLY the newest row using url-encoded created_at filter.
        """
        try:
            # ✅ Auto-create row if missing — prevents all "No row found" 500 errors
            if not GuestService._ensure_row_exists(guest_id):
                print(f"[GuestService] _patch_latest: Could not ensure row for {guest_id}")
                return False

            encoded_ts, _ = GuestService._get_latest_row(guest_id)
            if not encoded_ts:
                print(f"[GuestService] _patch_latest: Still no row after ensure for {guest_id}")
                return False

            data = {
                'last_active_at': datetime.utcnow().isoformat() + 'Z',
                **fields
            }

            patch_url = (
                f"{GuestService._base_url()}"
                f"?id=eq.{guest_id}"
                f"&created_at=eq.{encoded_ts}"
            )

            print(f"[GuestService] _patch_latest patching {guest_id} with keys: {list(fields.keys())}")
            patch_resp = requests.patch(
                patch_url,
                json=data,
                headers=GuestService._headers(),
                timeout=10
            )
            success = patch_resp.status_code in [200, 204]
            if success:
                print(f"[GuestService] _patch_latest SUCCESS for {guest_id}")
            else:
                print(f"[GuestService] _patch_latest FAILED: {patch_resp.status_code} — {patch_resp.text}")
            return success

        except Exception as e:
            print(f"[GuestService] _patch_latest ERROR: {e}")
            return False

    # ─────────────────────────────────────────────────────────────────────
    # PUBLIC METHODS
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def log_activity(guest_id: str, event_type: str, metadata: dict = None) -> dict:
        """
        ✅ FIXED: Ensures row exists before logging.
        Stores activity events inside the metadata JSONB column
        since activity_log column does not exist in the DB schema.
        """
        try:
            # Ensure row exists first
            GuestService._ensure_row_exists(guest_id)

            encoded_ts, row = GuestService._get_latest_row(guest_id)
            if not row:
                return {'success': False, 'error': 'Guest session not found after ensure'}

            # ✅ Store activity inside metadata.activity_log (avoids missing column)
            current_metadata = row.get('metadata') or {}
            activity_log = current_metadata.get('activity_log') or []
            activity_log.append({
                'event':     event_type,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'data':      metadata or {}
            })
            current_metadata['activity_log'] = activity_log

            success = GuestService._patch_latest(guest_id, {'metadata': current_metadata})
            return {'success': success}
        except Exception as e:
            print(f"[GuestService] log_activity ERROR: {e}")
            return {'success': False, 'error': str(e)}

    @staticmethod
    def init_session(guest_id: str, ip_address: str = None) -> dict:
        print(f"\n[GuestService] ═══ SESSION INIT (NEW ROW): {guest_id} ═══")

        visit_count = 1
        try:
            url = f"{GuestService._base_url()}?id=eq.{guest_id}&select=id"
            count_resp = requests.get(url, headers=GuestService._headers(), timeout=10)
            if count_resp.status_code == 200:
                visit_count = len(count_resp.json()) + 1
        except Exception as e:
            print(f"[GuestService] visit_count check ERROR: {e}")

        success = GuestService._insert(guest_id, {
            'ip_address':  ip_address,
            'visit_count': visit_count,
            'ip_history':  [{'ip': ip_address, 'seen': datetime.utcnow().isoformat()}] if ip_address else []
        })
        return {'success': success, 'visit_count': visit_count}

    @staticmethod
    def save_payment(guest_id: str, plan_name: str, stripe_session_id: str, amount: int) -> dict:
        print(f"[GuestService] 💳 Saving Payment: {plan_name}")
        fields = {
            'plan_name':         plan_name,
            'payment_status':    'completed',
            'stripe_session_id': stripe_session_id,
            'amount_paid':       amount
        }
        success = GuestService._patch_latest(guest_id, fields)
        return {'success': success}

    @staticmethod
    def save_resume(guest_id: str, resume_data: dict) -> dict:
        print(f"[GuestService] 📄 Saving Resume: {resume_data.get('file_name', 'unknown')}")
        fields = {
            'file_name':     resume_data.get('file_name'),
            'file_url':      resume_data.get('file_url'),
            'resume_status': 'uploaded',
            'metadata': {
                'file_type':   resume_data.get('file_type'),
                'file_size':   resume_data.get('file_size'),
                'uploaded_at': datetime.utcnow().isoformat()
            }
        }
        # ✅ Strip None values to avoid sending null to non-nullable columns
        fields = {k: v for k, v in fields.items() if v is not None}
        success = GuestService._patch_latest(guest_id, fields)
        return {'success': success}

    @staticmethod
    def save_analysis(guest_id: str, analysis_data: dict) -> dict:
        print(f"[GuestService] 🤖 Saving Analysis | ATS: {analysis_data.get('ats_score', 0)}")
        fields = {
            'resume_status': 'analyzed',
            'metadata': {
                'ats_score':            analysis_data.get('ats_score', 0),
                'detected_role':        analysis_data.get('detected_role', 'Not Specified'),
                'seniority_level':      analysis_data.get('seniority_level', 'Not Specified'),
                'years_of_experience':  analysis_data.get('years_of_experience', 0),
                'candidate_name':       analysis_data.get('candidate_name', 'Guest Candidate'),
                'candidate_email':      analysis_data.get('candidate_email', ''),
                'candidate_phone':      analysis_data.get('candidate_phone', ''),
                'location':             analysis_data.get('location', ''),
                'linkedin_url':         analysis_data.get('linkedin_url', ''),
                'recommended_industry': analysis_data.get('recommended_industry', ''),
                'education_summary':    analysis_data.get('education_summary', ''),
                'top_skills':           analysis_data.get('top_skills', []),
                'total_skills_count':   analysis_data.get('total_skills_count', 0),
                'full_analysis':        analysis_data,
                'analyzed_at':          datetime.utcnow().isoformat()
            }
        }
        success = GuestService._patch_latest(guest_id, fields)
        return {'success': success}

    @staticmethod
    def save_blast_initiated(guest_id: str, blast_data: dict) -> dict:
        print(f"[GuestService] 🚀 Saving Blast Start")
        fields = {
            'blast_industry':         blast_data.get('industry', 'Not Specified'),
            'blast_recipients_count': blast_data.get('recipients_count', 0),
            'blast_initiated_at':     datetime.utcnow().isoformat() + 'Z'
        }
        success = GuestService._patch_latest(guest_id, fields)
        return {'success': success}

    @staticmethod
    def save_blast_completed(guest_id: str, results: dict) -> dict:
        print(f"[GuestService] ✅ Saving Blast Complete")
        fields = {
            'blast_results': results,
            'metadata': {
                'blast_status':       'completed',
                'blast_completed_at': datetime.utcnow().isoformat(),
                'results':            results
            }
        }
        success = GuestService._patch_latest(guest_id, fields)
        return {'success': success}

    @staticmethod
    def get(guest_id: str) -> dict:
        try:
            url = f"{GuestService._base_url()}?id=eq.{guest_id}&order=created_at.desc&limit=1"
            resp = requests.get(url, headers=GuestService._headers(), timeout=10)
            return resp.json()[0] if resp.status_code == 200 and resp.json() else None
        except Exception as e:
            print(f"[GuestService] get ERROR: {e}")
            return None