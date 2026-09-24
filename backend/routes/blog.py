from flask import Blueprint, request, jsonify
import os
from services.blogger_sync_service import sync_blogger_posts, get_published_posts, get_post_by_slug

blog_bp = Blueprint('blog', __name__, url_prefix='/api/blog')


@blog_bp.route('/posts', methods=['GET'])
def list_posts():
    limit = request.args.get('limit', 50, type=int)
    result = get_published_posts(limit=limit)
    return jsonify(result), 200 if result['success'] else 500


@blog_bp.route('/posts/<slug>', methods=['GET'])
def get_post(slug):
    result = get_post_by_slug(slug)
    if not result['success'] and result.get('error') == 'not_found':
        return jsonify(result), 404
    return jsonify(result), 200 if result['success'] else 500


@blog_bp.route('/sync', methods=['POST'])
def trigger_sync():
    """Manually trigger a Blogger → Supabase sync. Protected by a shared secret header."""
    secret = request.headers.get('X-Sync-Secret')
    if not secret or secret != os.getenv('BLOG_SYNC_SECRET'):
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    result = sync_blogger_posts()
    return jsonify(result), 200 if result.get('success') else 500