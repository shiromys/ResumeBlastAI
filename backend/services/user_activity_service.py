# backend/services/user_activity_service.py
import os
import requests
from datetime import datetime
from services.guest_service import GuestService


class UserActivityService:
    """
    Activity logging service.

    REGISTERED USERS  →  user_activity table (unchanged, no RLS touched)
    GUEST USERS       →  guest_users.activity_log JSONB array (new table only)

    This split means we never alter user_activity's schema or policies.
    """

    @staticmethod
    def _get_headers():
        key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        return {
            'apikey': key,
            'Authorization': f"Bearer {key}",
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }

    @staticmethod
    def _get_base_url():
        return f"{os.getenv('SUPABASE_URL')}/rest/v1"

    @staticmethod
    def log_activity(user_id, email, event_type, metadata=None):
        """
        Route activity logs based on user type:
        - Guest IDs (guest_...) → guest_users.activity_log via GuestService
        - Registered UUIDs     → user_activity table (existing, untouched)
        """
        try:
            is_guest = GuestService.is_guest(user_id)

            if is_guest:
                # ── GUEST PATH ──────────────────────────────────────────────
                # Logs go into guest_users.activity_log JSONB array only.
                # The user_activity table is NOT touched for guests at all.
                print(f"📝 Guest Activity: [{event_type}] for {user_id}")
                return GuestService.log_activity(
                    guest_id=str(user_id),
                    event_type=event_type,
                    metadata={
                        **(metadata or {}),
                        'email': email,
                        'user_type': 'guest',
                        'is_guest': True
                    }
                )

            else:
                # ── REGISTERED USER PATH ────────────────────────────────────
                # Logs go into user_activity table exactly as before.
                # Zero changes to existing behavior.
                url = f"{UserActivityService._get_base_url()}/user_activity"
                activity_data = {
                    'user_id': str(user_id),
                    'email': email,
                    'event_type': event_type,
                    'metadata': {
                        **(metadata or {}),
                        'user_type': 'registered',
                        'is_guest': False
                    },
                    'event_timestamp': datetime.utcnow().isoformat(),
                    'created_at': datetime.utcnow().isoformat()
                }

                print(f"📝 Registered Activity: [{event_type}] for {email}")

                response = requests.post(
                    url,
                    headers=UserActivityService._get_headers(),
                    json=activity_data,
                    timeout=10
                )

                if response.status_code in [200, 201]:
                    print(f"✅ Activity logged: {event_type}")
                    return {'success': True}
                else:
                    print(f"❌ Activity log failed: {response.status_code} | {response.text}")
                    return {'success': False, 'error': response.text}

        except Exception as e:
            print(f"❌ log_activity EXCEPTION: {str(e)}")
            return {'success': False, 'error': str(e)}