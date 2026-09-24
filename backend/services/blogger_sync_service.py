"""
Blogger Sync Service
Pulls published posts from ResumeBlast.AI's Blogger blog via its public
Atom/GData JSON feed (no API key / Google Cloud project required) and
upserts them into the blog_posts table in Supabase.

Feed used (keyed by blog ID, not domain — survives any future domain change):
  https://www.blogger.com/feeds/{BLOGGER_BLOG_ID}/posts/default?alt=json
"""
import os, re, requests
from pathlib import Path
from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path, override=False)

BLOGGER_BLOG_ID = os.getenv("BLOGGER_BLOG_ID", "")
FEED_BASE_URL   = f"https://www.blogger.com/feeds/{BLOGGER_BLOG_ID}/posts/default"


def _get_supabase_url(): return os.getenv("SUPABASE_URL")

def _headers():
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    return {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}


def _slugify(title):
    slug = (title or '').lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug).strip('-')
    return slug or 'post'


def _excerpt(html, length=200):
    text = re.sub('<[^<]+?>', '', html or '')
    text = re.sub(r'\s+', ' ', text).strip()
    return (text[:length].rstrip() + '…') if len(text) > length else text


def _alternate_link(entry):
    for link in entry.get('link', []):
        if link.get('rel') == 'alternate':
            return link.get('href')
    return None


def _thumbnail(entry):
    thumb = entry.get('media$thumbnail', {}).get('url')
    if not thumb:
        return None
    # Blogger's auto-thumbnail defaults to a tiny 72x72 crop — bump it up
    return re.sub(r'/s72(-c)?/', '/s600/', thumb)


def _fetch_page(start_index, max_results=50):
    resp = requests.get(
        FEED_BASE_URL,
        params={'alt': 'json', 'max-results': max_results, 'start-index': start_index},
        timeout=15
    )
    resp.raise_for_status()
    return resp.json()


def sync_blogger_posts():
    """Fetch every post from the Blogger feed and upsert into Supabase. Returns a summary dict."""
    if not BLOGGER_BLOG_ID:
        print("[BlogSync] BLOGGER_BLOG_ID not set — skipping")
        return {'success': False, 'synced': 0, 'error': 'BLOGGER_BLOG_ID not configured'}

    synced, failed = 0, 0
    start_index, max_results = 1, 50

    try:
        while True:
            data = _fetch_page(start_index, max_results)
            entries = data.get('feed', {}).get('entry', [])
            if not entries:
                break

            for entry in entries:
                title        = entry.get('title', {}).get('$t', 'Untitled')
                content_html = entry.get('content', {}).get('$t', '')
                row = {
                    'blogger_post_id': entry.get('id', {}).get('$t', ''),
                    'title':           title,
                    'slug':            _slugify(title),
                    'excerpt':         _excerpt(content_html),
                    'content_html':    content_html,
                    'thumbnail_url':   _thumbnail(entry),
                    'blogger_url':     _alternate_link(entry),
                    'labels':          [c.get('term') for c in entry.get('category', [])],
                    'published_at':    entry.get('published', {}).get('$t'),
                    'updated_at':      entry.get('updated', {}).get('$t'),
                }
                resp = requests.post(
                    f"{_get_supabase_url()}/rest/v1/blog_posts",
                    json=row,
                    headers={**_headers(), 'Prefer': 'resolution=merge-duplicates,return=minimal'},
                    params={'on_conflict': 'blogger_post_id'},
                    timeout=15
                )
                if resp.status_code in (200, 201, 204):
                    synced += 1
                else:
                    failed += 1
                    print(f'[BlogSync] Failed to upsert "{title}": {resp.status_code} {resp.text[:150]}')

            if len(entries) < max_results:
                break
            start_index += max_results

        print(f"[BlogSync] Synced {synced} posts ({failed} failed)")
        return {'success': True, 'synced': synced, 'failed': failed}

    except Exception as e:
        print(f"[BlogSync] Error: {e}")
        return {'success': False, 'synced': synced, 'error': str(e)}


def get_published_posts(limit=50):
    """List posts newest-first (light fields only — for the blog index page)."""
    try:
        response = requests.get(
            f"{_get_supabase_url()}/rest/v1/blog_posts",
            headers=_headers(),
            params={
                'select': 'title,slug,excerpt,thumbnail_url,labels,published_at',
                'order': 'published_at.desc',
                'limit': limit,
            },
            timeout=10
        )
        if response.status_code == 200:
            return {'success': True, 'data': response.json()}
        return {'success': False, 'error': f"{response.status_code}: {response.text}"}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def get_post_by_slug(slug):
    """Fetch a single post (full content) by slug — for the blog detail page."""
    try:
        response = requests.get(
            f"{_get_supabase_url()}/rest/v1/blog_posts",
            headers=_headers(),
            params={'slug': f'eq.{slug}', 'select': '*', 'limit': 1},
            timeout=10
        )
        if response.status_code == 200:
            rows = response.json()
            if not rows:
                return {'success': False, 'error': 'not_found'}
            return {'success': True, 'data': rows[0]}
        return {'success': False, 'error': f"{response.status_code}: {response.text}"}
    except Exception as e:
        return {'success': False, 'error': str(e)}