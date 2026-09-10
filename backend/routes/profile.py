from flask import Blueprint, request, jsonify
import os
import requests
from urllib.parse import quote

profile_bp = Blueprint('profile', __name__, url_prefix='/api/user')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')


def _read_headers():
    """For read operations (GET)."""
    return {
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Accept':        'application/json',
    }


def _write_headers():
    """For write operations (PATCH)."""
    return {
        'apikey':        SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
    }


# Fields the user is allowed to edit. Email is intentionally excluded (immutable).
PROFILE_FIELDS = ['first_name', 'last_name', 'phone', 'primary_skills']

# All four required for a profile to count as complete.
REQUIRED_FOR_COMPLETE = ['first_name', 'last_name', 'phone', 'primary_skills']


def _is_complete(row):
    """A profile is complete only when all required fields are non-empty."""
    return all((row.get(f) or '').strip() for f in REQUIRED_FOR_COMPLETE)


@profile_bp.route('/profile', methods=['GET'])
def get_profile():
    """
    Load the logged-in user's profile by email.
    Usage: GET /api/user/profile?email=someone@example.com
    """
    try:
        email = (request.args.get('email') or '').strip().lower()
        if not email:
            return jsonify({'success': False, 'error': 'email is required'}), 400

        url = (
            f"{SUPABASE_URL}/rest/v1/users"
            f"?email=eq.{quote(email)}"
            f"&select=id,email,first_name,last_name,phone,primary_skills,profile_completed"
        )
        resp = requests.get(url, headers=_read_headers(), timeout=8)

        if resp.status_code != 200:
            return jsonify({'success': False, 'error': f'lookup failed ({resp.status_code})'}), 500

        rows = resp.json()
        if not rows:
            return jsonify({'success': False, 'error': 'user not found'}), 404

        return jsonify({'success': True, 'profile': rows[0]}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@profile_bp.route('/campaign/<campaign_id>/recruiters', methods=['GET'])
def get_campaign_recruiters(campaign_id):
    """
    Candidate-facing: for a COMPLETED campaign, list the company name / phone /
    website of recruiters whose resume send is fully recorded in
    campaign_recruiter_sends (all 3 waves), enriched via
    recruiter_company_links -> companies. Never the recruiter's own email —
    only company-level info is ever returned here.

    Usage: GET /api/user/campaign/<campaign_id>/recruiters?user_id=<uuid>

    A campaign with no campaign_recruiter_sends rows yet (older campaigns that
    predate send-tracking) simply returns an empty list — this never falls back
    to guessing from `recruiters` directly.
    """
    try:
        user_id = (request.args.get('user_id') or '').strip()
        if not user_id:
            return jsonify({'success': False, 'error': 'user_id is required'}), 400

        campaign_id = (campaign_id or '').strip()

        # Ownership + status check first — only the campaign's own owner, and
        # only once it's fully completed, ever gets a list back.
        camp_url = (
            f"{SUPABASE_URL}/rest/v1/blast_campaigns"
            f"?id=eq.{quote(campaign_id)}"
            f"&select=id,user_id,status"
        )
        camp_resp = requests.get(camp_url, headers=_read_headers(), timeout=8)
        if camp_resp.status_code != 200 or not camp_resp.json():
            return jsonify({'success': False, 'error': 'campaign not found'}), 404

        campaign = camp_resp.json()[0]
        if str(campaign.get('user_id') or '') != user_id:
            return jsonify({'success': False, 'error': 'not authorized for this campaign'}), 403

        if campaign.get('status') != 'completed':
            return jsonify({'success': True, 'available': False, 'recruiters': [], 'count': 0}), 200

        # 1. Who this campaign actually sent to, and which waves each got.
        sends_url = (
            f"{SUPABASE_URL}/rest/v1/campaign_recruiter_sends"
            f"?campaign_id=eq.{quote(campaign_id)}"
            f"&select=recruiter_id,wave"
        )
        sends_resp = requests.get(sends_url, headers=_read_headers(), timeout=8)
        if sends_resp.status_code != 200:
            return jsonify({'success': False, 'error': f'lookup failed ({sends_resp.status_code})'}), 500

        waves_by_recruiter = {}
        for row in sends_resp.json():
            rid = row.get('recruiter_id')
            if not rid:
                continue
            waves_by_recruiter.setdefault(rid, set()).add(row.get('wave'))

        # Only recruiters who received the full 3-wave sequence — this naturally
        # excludes bounces/partial sends without any extra filtering logic.
        qualifying_ids = [rid for rid, waves in waves_by_recruiter.items() if len(waves) >= 3]

        if not qualifying_ids:
            return jsonify({'success': True, 'available': True, 'recruiters': [], 'count': 0}), 200

        # 2. Company links for those recruiters (a recruiter with no link is
        #    expected and falls through to "Independent Recruiter" below).
        ids_filter = ','.join(qualifying_ids)
        links_url = (
            f"{SUPABASE_URL}/rest/v1/recruiter_company_links"
            f"?recruiter_id=in.({ids_filter})"
            f"&select=recruiter_id,company_id"
        )
        links_resp = requests.get(links_url, headers=_read_headers(), timeout=8)
        links = links_resp.json() if links_resp.status_code == 200 else []
        company_id_by_recruiter = {l['recruiter_id']: l['company_id'] for l in links if l.get('company_id')}

        # 3. The company rows themselves.
        companies_by_id = {}
        company_ids = list({cid for cid in company_id_by_recruiter.values()})
        if company_ids:
            cids_filter = ','.join(str(cid) for cid in company_ids)
            companies_url = (
                f"{SUPABASE_URL}/rest/v1/companies"
                f"?id=in.({cids_filter})"
                f"&select=id,company_name,website_url,contact_number"
            )
            companies_resp = requests.get(companies_url, headers=_read_headers(), timeout=8)
            if companies_resp.status_code == 200:
                companies_by_id = {c['id']: c for c in companies_resp.json()}

        # 4. Assemble the candidate-facing list.
        recruiters = []
        for rid in qualifying_ids:
            company = companies_by_id.get(company_id_by_recruiter.get(rid)) or {}
            recruiters.append({
                'company_name':   company.get('company_name') or 'Independent Recruiter',
                'website_url':    company.get('website_url'),
                'contact_number': company.get('contact_number'),
            })

        return jsonify({'success': True, 'available': True, 'recruiters': recruiters, 'count': len(recruiters)}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@profile_bp.route('/profile', methods=['PATCH'])
def update_profile():
    """
    Save the logged-in user's profile fields.
    Email is never updatable here (immutability guard).
    Recomputes profile_completed automatically.
    Body: { email, first_name, last_name, phone, primary_skills }
    """
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        if not email:
            return jsonify({'success': False, 'error': 'email is required'}), 400

        # Build update payload ONLY from allowed fields — email can never be changed.
        payload = {}
        for f in PROFILE_FIELDS:
            if f in data:
                val = data.get(f)
                payload[f] = val.strip() if isinstance(val, str) else val

        if not payload:
            return jsonify({'success': False, 'error': 'no editable fields provided'}), 400

        # Fetch current row so we can compute completeness on the merged result.
        get_url = (
            f"{SUPABASE_URL}/rest/v1/users"
            f"?email=eq.{quote(email)}"
            f"&select=first_name,last_name,phone,primary_skills"
        )
        cur = requests.get(get_url, headers=_read_headers(), timeout=8)
        if cur.status_code != 200 or not cur.json():
            return jsonify({'success': False, 'error': 'user not found'}), 404

        merged = {**cur.json()[0], **payload}
        payload['profile_completed'] = _is_complete(merged)

        patch_url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{quote(email)}"
        upd = requests.patch(patch_url, headers=_write_headers(), json=payload, timeout=8)

        if upd.status_code not in (200, 204):
            return jsonify({'success': False, 'error': f'update failed ({upd.status_code})'}), 500

        updated = upd.json()[0] if upd.text and upd.json() else merged
        return jsonify({
            'success': True,
            'profile_completed': payload['profile_completed'],
            'profile': updated,
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500