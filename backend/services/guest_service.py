# backend/services/guest_service.py
import os
import requests
from datetime import datetime

class GuestService:
    """
    Handles ALL data storage for non-registered (guest) users.
    FIXED: Now uses a 'New Row per Session' approach to prevent overwriting history.
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
        """Checks if any record exists for this guest ID."""
        try:
            url = f"{GuestService._base_url()}?id=eq.{guest_id}&select=id"
            resp = requests.get(url, headers=GuestService._headers(), timeout=10)
            return resp.status_code == 200 and len(resp.json()) > 0
        except Exception as e:
            print(f"[GuestService] _exists ERROR: {e}")
            return False

    @staticmethod
    def _insert(guest_id: str, fields: dict) -> bool:
        """Create a NEW row for a new session. Prevents overwriting old history."""
        try:
            data = {
                'id': guest_id,
                'created_at': datetime.utcnow().isoformat(),
                'last_active_at': datetime.utcnow().isoformat(),
                'payment_status': 'pending',
                'resume_status': 'not_uploaded',
                'blast_status': 'not_blasted',
                'activity_log': [],
                'resume_history': [],
                'ip_history': [],
                'metadata': {},
                **fields
            }
            resp = requests.post(
                GuestService._base_url(),
                json=data,
                headers=GuestService._headers(),
                timeout=10
            )
            return resp.status_code in [200, 201]
        except Exception as e:
            print(f"[GuestService] _insert ERROR: {e}")
            return False

    @staticmethod
    def _patch_latest(guest_id: str, fields: dict) -> bool:
        """Updates ONLY the latest row created for this guest session."""
        try:
            # 1. Find the latest row ID for this guest
            url = f"{GuestService._base_url()}?id=eq.{guest_id}&order=created_at.desc&limit=1"
            resp = requests.get(url, headers=GuestService._headers())
            
            if resp.status_code == 200 and resp.json():
                # In Supabase, if ID is not unique per row, we use the timestamp or internal UUID
                # Assuming the table allows multiple rows per guest_id linked by 'id'
                target_url = f"{GuestService._base_url()}?id=eq.{guest_id}&order=created_at.desc"
                data = { 'last_active_at': datetime.utcnow().isoformat(), **fields }
                
                # PATCH with limit=1 (using query params) ensures only the newest is touched
                patch_resp = requests.patch(
                    f"{GuestService._base_url()}?id=eq.{guest_id}&limit=1",
                    json=data,
                    headers=GuestService._headers()
                )
                return patch_resp.status_code in [200, 204]
            return False
        except Exception as e:
            print(f"[GuestService] _patch_latest ERROR: {e}")
            return False

    # ─────────────────────────────────────────────────────────────────────
    # PUBLIC METHODS
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def init_session(guest_id: str, ip_address: str = None) -> dict:
        """Creates a fresh row for every new visit/session to track history correctly."""
        print(f"\n[GuestService] ═══ SESSION INIT (NEW ROW): {guest_id} ═══")
        
        # Calculate visit count based on existing rows
        visit_count = 1
        try:
            url = f"{GuestService._base_url()}?id=eq.{guest_id}&select=id"
            count_resp = requests.get(url, headers=GuestService._headers())
            if count_resp.status_code == 200:
                visit_count = len(count_resp.json()) + 1
        except: pass

        success = GuestService._insert(guest_id, {
            'ip_address': ip_address,
            'visit_count': visit_count,
            'ip_history': [{'ip': ip_address, 'seen': datetime.utcnow().isoformat()}] if ip_address else []
        })
        return {'success': success, 'visit_count': visit_count}

    @staticmethod
    def save_payment(guest_id: str, plan_name: str, stripe_session_id: str, amount: int) -> dict:
        """Updates the current session row with payment details."""
        print(f"[GuestService] 💳 Saving Payment: {plan_name}")
        fields = {
            'plan_name': plan_name,
            'blast_plan': plan_name,
            'payment_status': 'completed',
            'stripe_session_id': stripe_session_id,
            'amount_paid': amount
        }
        success = GuestService._patch_latest(guest_id, fields)
        return {'success': success}

    @staticmethod
    def save_resume(guest_id: str, resume_data: dict) -> dict:
        """Saves resume data to the current session row."""
        fields = {
            'file_name': resume_data.get('file_name'),
            'file_url': resume_data.get('file_url'),
            'file_size': resume_data.get('file_size'),
            'extracted_text': resume_data.get('extracted_text'),
            'resume_status': 'uploaded'
        }
        success = GuestService._patch_latest(guest_id, fields)
        return {'success': success}

    @staticmethod
    def save_analysis(guest_id: str, analysis_data: dict) -> dict:
        """Extracts key AI fields and saves them without NULLs."""
        # Safe extraction logic
        ats = analysis_data.get('ats_score', 0)
        role = analysis_data.get('detected_role', 'Not Specified')
        
        fields = {
            'analysis_data': analysis_data,
            'ats_score': ats,
            'detected_role': role,
            'seniority_level': analysis_data.get('seniority_level', 'Not Specified'),
            'years_of_experience': analysis_data.get('years_of_experience', 0),
            'candidate_name': analysis_data.get('candidate_name', 'Guest Candidate'),
            'candidate_email': analysis_data.get('candidate_email', ''),
            'total_skills_count': analysis_data.get('total_skills_count', 0),
            'resume_status': 'analyzed',
            'analyzed_at': datetime.utcnow().isoformat()
        }
        success = GuestService._patch_latest(guest_id, fields)
        return {'success': success}

    @staticmethod
    def save_blast_initiated(guest_id: str, blast_data: dict) -> dict:
        """Logs the start of a blast."""
        fields = {
            'blast_status': 'initiated',
            'blast_industry': blast_data.get('industry', 'Not Specified'),
            'blast_recipients_count': blast_data.get('recipients_count', 0),
            'blast_plan': blast_data.get('plan_name', 'basic'),
            'blast_initiated_at': datetime.utcnow().isoformat()
        }
        success = GuestService._patch_latest(guest_id, fields)
        return {'success': success}

    @staticmethod
    def save_blast_completed(guest_id: str, results: dict) -> dict:
        """Logs the completion of a blast."""
        fields = {
            'blast_status': 'completed',
            'blast_results': results,
            'blast_completed_at': datetime.utcnow().isoformat()
        }
        success = GuestService._patch_latest(guest_id, fields)
        return {'success': success}

    @staticmethod
    def get(guest_id: str) -> dict:
        """Fetches the latest session row for this guest."""
        try:
            url = f"{GuestService._base_url()}?id=eq.{guest_id}&order=created_at.desc&limit=1"
            resp = requests.get(url, headers=GuestService._headers())
            return resp.json()[0] if resp.status_code == 200 and resp.json() else None
        except: return None