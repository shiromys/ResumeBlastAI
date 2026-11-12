"""
Maintenance Mode Service
-------------------------
Backs the admin "Maintenance Mode" toggle (Admin Panel → Maintenance Mode
tab). A single settings row (table `maintenance_mode`, always id=1) holds
whether it's on, the message shown to visitors, and an optional "estimated
back online" timestamp.

Two call sites:
  - GET /api/maintenance-status (backend/routes/maintenance.py) — PUBLIC,
    unauthenticated. The main frontend app calls this on load (and polls
    it) to decide whether to show the full-page "We'll be right back"
    takeover instead of the normal site.
  - GET/POST /api/admin/maintenance (backend/routes/admin.py) — admin-only,
    reads/writes the row.

Deliberately fail-open: get_maintenance_status() NEVER raises. If
Supabase is unreachable, the table doesn't exist yet (migration not run),
or the response is malformed, it returns enabled=False. A settings-read
hiccup must never be able to accidentally lock every visitor out of the
whole site — only an explicit, successful admin POST can turn it on.

A short in-process cache (CACHE_TTL_SECONDS) exists because the public
status endpoint can be hit by every page load of every visitor on the
site — this keeps that from becoming one Supabase request per pageview,
while still picking up an admin's change within a few seconds. The cache
is per-process (each Gunicorn worker has its own); that's fine here since
the worst case is a few seconds of staleness in one worker, never wrong
data read from the database itself.
"""
import os
import time
import requests
from datetime import datetime, timezone

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

CACHE_TTL_SECONDS = 5
_cache = {'value': None, 'at': 0.0}

_DEFAULT_STATUS = {
    'enabled': False,
    'message': "We'll be back online shortly. Thanks for your patience.",
    'estimated_back_at': None,
    'updated_at': None,
    'updated_by': None,
}


def _headers():
    return {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
        'Content-Type': 'application/json',
    }


def invalidate_cache():
    _cache['value'] = None
    _cache['at'] = 0.0


def get_maintenance_status(use_cache=True):
    """Returns {'enabled','message','estimated_back_at','updated_at','updated_by'}.
    Never raises — fails open (enabled=False) on any error, timeout, or
    missing table so a DB/network hiccup can never block every visitor."""
    now = time.time()
    if use_cache and _cache['value'] is not None and (now - _cache['at']) < CACHE_TTL_SECONDS:
        return _cache['value']

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return dict(_DEFAULT_STATUS)

    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/maintenance_mode?id=eq.1&select=*",
            headers={**_headers(), 'Accept': 'application/json'},
            timeout=5
        )
        if resp.status_code in (200, 206):
            rows = resp.json()
            if rows:
                row = rows[0]
                status = {
                    'enabled': bool(row.get('enabled')),
                    'message': row.get('message') or _DEFAULT_STATUS['message'],
                    'estimated_back_at': row.get('estimated_back_at'),
                    'updated_at': row.get('updated_at'),
                    'updated_by': row.get('updated_by'),
                }
                _cache['value'] = status
                _cache['at'] = now
                return status
            # Table exists but the seed row is missing — treat as off, don't error.
        else:
            print(f"⚠️ [Maintenance] status fetch returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"⚠️ [Maintenance] status fetch failed, failing open (treated as OFF): {e}")

    fallback = dict(_DEFAULT_STATUS)
    _cache['value'] = fallback
    _cache['at'] = now
    return fallback


def set_maintenance_status(enabled, message=None, estimated_back_at=None, updated_by=None):
    """Upserts the single settings row (id=1). Unlike reads, this DOES
    raise on failure — a failed write must be surfaced to the admin who
    just clicked Save, never silently swallowed."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError('Supabase is not configured on this server')

    payload = {
        'id': 1,
        'enabled': bool(enabled),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }
    if message is not None:
        payload['message'] = message
    # '' clears the ETA; None leaves it untouched; otherwise set it.
    if estimated_back_at is not None:
        payload['estimated_back_at'] = estimated_back_at or None
    if updated_by is not None:
        payload['updated_by'] = updated_by

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/maintenance_mode?on_conflict=id",
        headers={**_headers(), 'Prefer': 'resolution=merge-duplicates,return=representation'},
        json=payload, timeout=8
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Supabase upsert failed ({resp.status_code}): {resp.text[:300]}")

    invalidate_cache()  # so the very next read (including this admin's own) sees the change immediately

    rows = resp.json() if resp.text else []
    row = rows[0] if rows else payload
    return {
        'enabled': bool(row.get('enabled')),
        'message': row.get('message'),
        'estimated_back_at': row.get('estimated_back_at'),
        'updated_at': row.get('updated_at'),
        'updated_by': row.get('updated_by'),
    }