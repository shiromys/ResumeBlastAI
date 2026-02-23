from flask import Flask, jsonify, request, redirect, make_response
from flask_cors import CORS
import os
import re
from pathlib import Path
from dotenv import load_dotenv
from routes.contact import contact_bp

BASE_DIR = Path(__file__).resolve().parent
manual_env_path = BASE_DIR / '.env'

if manual_env_path.exists():
    load_dotenv(dotenv_path=manual_env_path, override=True)
    print(f"✅ Success: Environment loaded from {manual_env_path}")
else:
    print(f"❌ CRITICAL ERROR: .env not found at: {manual_env_path}")

print("\n" + "="*70)
print("🔒 ENVIRONMENT VARIABLES CHECK")
print("="*70)

supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
stripe_key = os.getenv('STRIPE_SECRET_KEY')
anthropic_key = os.getenv('ANTHROPIC_API_KEY')
stripe_webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')

print(f"SUPABASE_URL: {supabase_url if supabase_url else '❌ NOT SET'}")
print(f"SUPABASE_KEY: {'✅ SET (' + (supabase_key[:20] if supabase_key else '') + '...)' if supabase_key else '❌ NOT SET'}")
print(f"STRIPE_KEY: {'✅ SET (' + (stripe_key[:15] if stripe_key else '') + '...)' if stripe_key else '❌ NOT SET'}")
print(f"ANTHROPIC_KEY: {'✅ SET (' + (anthropic_key[:15] if anthropic_key else '') + '...)' if anthropic_key else '❌ NOT SET'}")
print(f"STRIPE_WEBHOOK_SECRET: {'✅ SET (' + (stripe_webhook_secret[:15] if stripe_webhook_secret else '') + '...)' if stripe_webhook_secret else '⚠️ NOT SET'}")
print("="*70 + "\n")

if not supabase_url:
    print("🚨 CRITICAL ERROR: SUPABASE_URL is not set!")
    import sys
    sys.exit(1)

# Import routes AFTER environment is loaded
from routes.payment import payment_bp
from routes.blast import blast_bp
from routes.auth import auth_bp
from routes.analyze import analyze_bp
from routes.admin import admin_bp
from routes.recruiter_activity import recruiter_activity_bp
from routes.support_ticket import support_ticket_bp
from routes.user_management import user_management_bp
from routes.payment_webhook import payment_webhook_bp
from routes.user_activity import user_activity_bp
from routes.webhooks import webhooks_bp
from routes.guest_routes import guest_bp

app = Flask(__name__)

# ✅ FIX: flask_cors does NOT support wildcard subdomains or function-based origins.
# Solution: Use a MANUAL before_request CORS handler that runs regex matching,
# then disable flask_cors origin checking by passing origins="*" (we control
# which origins actually get headers via the manual handler below).
# The manual handler sets headers precisely; flask_cors is kept only for
# its response-phase header injection on non-OPTIONS requests.

ALLOWED_ORIGINS_EXACT = {
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5000",
    "https://resumeblast.ai",
    "https://www.resumeblast.ai",
}

ALLOWED_ORIGINS_PATTERNS = [
    re.compile(r'^https://[a-zA-Z0-9\-]+\.railway\.app$'),
    re.compile(r'^https://[a-zA-Z0-9\-]+\.up\.railway\.app$'),
    re.compile(r'^https://[a-zA-Z0-9\-]+\.netlify\.app$'),
]

def is_origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS_EXACT:
        return True
    # Check FRONTEND_URL env var (set in Railway to exact frontend URL)
    frontend_url = os.getenv('FRONTEND_URL', '').rstrip('/')
    if frontend_url and origin == frontend_url:
        return True
    # Regex patterns for dynamic subdomains
    for pattern in ALLOWED_ORIGINS_PATTERNS:
        if pattern.match(origin):
            return True
    return False


@app.before_request
def handle_cors():
    """
    ✅ Manually handle CORS for ALL requests.
    This replaces flask_cors origin matching entirely.
    """
    origin = request.headers.get('Origin', '')

    if not origin:
        return  # Same-origin or non-browser request — let it through

    if not is_origin_allowed(origin):
        print(f"[CORS] ❌ Blocked: {origin}")
        return make_response(jsonify({'error': 'CORS blocked'}), 403)

    # Handle OPTIONS preflight — respond immediately with correct headers
    if request.method == 'OPTIONS':
        response = make_response('', 204)
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Max-Age'] = '3600'
        return response


@app.after_request
def add_cors_headers(response):
    """
    ✅ Add CORS headers to every non-OPTIONS response for allowed origins.
    """
    origin = request.headers.get('Origin', '')
    if origin and is_origin_allowed(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Expose-Headers'] = 'Content-Type'
    return response


@app.before_request
def ensure_www():
    if request.method == 'OPTIONS':
        return  # Already handled above
    host = request.host.split(':')[0]
    if host == "resumeblast.ai":
        target_url = request.url.replace("resumeblast.ai", "www.resumeblast.ai", 1)
        return redirect(target_url, code=301)


# Register Blueprints
app.register_blueprint(payment_bp)
app.register_blueprint(blast_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(analyze_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(recruiter_activity_bp)
app.register_blueprint(contact_bp)
app.register_blueprint(support_ticket_bp)
app.register_blueprint(user_management_bp)
app.register_blueprint(payment_webhook_bp)
app.register_blueprint(user_activity_bp)
app.register_blueprint(webhooks_bp)
app.register_blueprint(guest_bp)


@app.route('/')
def home():
    return jsonify({'status': 'success', 'message': 'ResumeBlast API is running', 'version': '1.0.0'})


@app.route('/api/health')
def health():
    return jsonify({
        'status': 'healthy',
        'stripe_configured': bool(os.getenv('STRIPE_SECRET_KEY')),
        
        'supabase_configured': bool(os.getenv('SUPABASE_SERVICE_ROLE_KEY')),
        'anthropic_configured': bool(os.getenv('ANTHROPIC_API_KEY')),
        'stripe_webhook_configured': bool(os.getenv('STRIPE_WEBHOOK_SECRET')),
        'bounce_webhooks_configured': True
    })


@app.route('/api/test-cors', methods=['GET', 'POST', 'PATCH', 'OPTIONS'])
def test_cors():
    origin = request.headers.get('Origin', 'no-origin')
    return jsonify({
        'success': True,
        'message': 'CORS is working correctly',
        'origin': origin,
        'is_allowed': is_origin_allowed(origin)
    })


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'

    print('\n' + '='*70)
    print('🚀 RESUMEBLAST API SERVER STARTING')
    print('='*70)
    print(f'🌐 Port: {port}')
    print(f'🔧 Debug Mode: {debug}')
    print(f'💳 Stripe Webhook: /api/webhooks/stripe')
    print(f'🎫 Support Tickets: CORS enabled with PATCH method')
    print(f'🔍 Analyze Endpoint: /api/analyze')
    print(f'📊 User Activity Tracking: /api/user-activity/log')
    print(f'📧 Bounce Webhooks: /api/webhooks/brevo/bounce & /api/webhooks/resend/bounce')
    print(f'👤 Guest Tracking: /api/guest/*')
    print('='*70 + "\n")

    app.run(host='0.0.0.0', port=port, debug=debug)