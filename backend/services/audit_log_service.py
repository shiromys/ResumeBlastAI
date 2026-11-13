"""
Admin Audit Log
----------------
Records every state-changing admin action (deletes, bans, refunds, admin
access grants/revokes, forced waves, maintenance-mode toggles) so super
admins can see "who did what, when" from the new Audit Log tab
(GET /api/admin/audit-log, super-admin only).

Deliberately read-only actions (viewing a user, exporting a CSV, searching)
are NOT logged here — an audit log of every GET request would be noise,
not accountability. Only the handlers that actually change something call
log_admin_action(), right where they already print a success line.

Table: admin_audit_log (migration: backend/admin_audit_log_migration.sql).
RLS enabled with no policies — same pattern as admin_users and
maintenance_mode — so only the service-role key (i.e. only this backend)
can ever read or write it.

Fails silently on write: logging a past action must never be able to
break the action itself, or make an admin's refund/ban/etc. appear to
fail when it actually succeeded. If the Supabase write fails, it's
printed to the server log and swallowed.
"""
import os
import requests
from datetime import datetime, timezone

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')


def _headers():
    return {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
        'Content-Type': 'application/json',
    }


def log_admin_action(admin_email, action, target=None, details=None, admin_role=None):
    """Fire-and-forget. Never raises — callers should NOT wrap this in
    their own try/except; it already protects itself."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    if not admin_email or not action:
        return

    payload = {
        'admin_email': admin_email,
        'admin_role':  admin_role,
        'action':      action,
        'target':      target,
        'details':     details or {},
        'created_at':  datetime.now(timezone.utc).isoformat(),
    }
    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/admin_audit_log",
            headers={**_headers(), 'Prefer': 'return=minimal'},
            json=payload, timeout=5
        )
        if resp.status_code not in (200, 201, 204):
            print(f"⚠️ [AuditLog] write failed ({resp.status_code}): {resp.text[:200]}")
    except Exception as e:
        print(f"⚠️ [AuditLog] write failed: {e}")


def get_recent_actions(limit=200, admin_email=None):
    """Never raises — returns [] on any failure so the Audit Log tab shows
    an empty state instead of a hard error if the table isn't migrated
    yet or Supabase is briefly unreachable."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return []
    try:
        url = f"{SUPABASE_URL}/rest/v1/admin_audit_log?select=*&order=created_at.desc&limit={int(limit)}"
        if admin_email:
            from urllib.parse import quote
            url += f"&admin_email=eq.{quote(admin_email)}"
        resp = requests.get(url, headers={**_headers(), 'Accept': 'application/json'}, timeout=8)
        if resp.status_code in (200, 206):
            data = resp.json()
            return data if isinstance(data, list) else []
        print(f"⚠️ [AuditLog] read failed ({resp.status_code}): {resp.text[:200]}")
        return []
    except Exception as e:
        print(f"⚠️ [AuditLog] read failed: {e}")
        return []