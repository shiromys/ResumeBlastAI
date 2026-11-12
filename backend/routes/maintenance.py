"""
Public maintenance-status endpoint.

Deliberately its OWN tiny blueprint, separate from admin_bp, for one
important reason: admin_bp's before_request guard requires auth on every
route by default (see routes/admin.py), and this endpoint must be the one
thing that is ALWAYS reachable by a logged-out visitor with no token —
it's how the public React app learns whether to show the maintenance
takeover in the first place. Keeping it out of admin_bp means there's no
allowlist entry to maintain or ever accidentally remove.

The admin-facing read/write routes (GET/POST /api/admin/maintenance) live
in routes/admin.py instead, where they're protected by that blueprint's
existing admin-auth guard like every other admin route.
"""
from flask import Blueprint, jsonify
from services.maintenance_service import get_maintenance_status

maintenance_bp = Blueprint('maintenance', __name__)


@maintenance_bp.route('/api/maintenance-status', methods=['GET'])
def maintenance_status():
    # No auth, no admin check — this must work for every visitor, logged
    # in or not, and must never itself be blocked by maintenance mode.
    status = get_maintenance_status()
    return jsonify({'success': True, **status})