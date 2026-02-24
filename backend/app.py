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

supabase_url    = os.getenv('SUPABASE_URL')
supabase_key    = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
stripe_key      = os.getenv('STRIPE_SECRET_KEY')
anthropic_key   = os.getenv('ANTHROPIC_API_KEY')
stripe_webhook  = os.getenv('STRIPE_WEBHOOK_SECRET')
brevo_key       = os.getenv('BREVO_API_KEY')

print(f"SUPABASE_URL:          {supabase_url if supabase_url else '❌ NOT SET'}")
print(f"SUPABASE_KEY:          {'✅ SET' if supabase_key else '❌ NOT SET'}")
print(f"STRIPE_KEY:            {'✅ SET' if stripe_key else '❌ NOT SET'}")
print(f"ANTHROPIC_KEY:         {'✅ SET' if anthropic_key else '❌ NOT SET'}")
print(f"STRIPE_WEBHOOK_SECRET: {'✅ SET' if stripe_webhook else '⚠️ NOT SET'}")
print(f"BREVO_API_KEY:         {'✅ SET' if brevo_key else '⚠️ NOT SET (Drip emails disabled)'}")
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
from routes.drip_campaign import drip_campaign_bp  # ✅ NEW

app = Flask(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────────────────────────────────────
_EXACT_ORIGINS = {
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5000",
    "https://resumeblast.ai",
    "https://www.resumeblast.ai",
}

_ORIGIN_PATTERNS = [
    re.compile(r'^https://[a-zA-Z0-9-]+\.railway\.app$'),
    re.compile(r'^https://[a-zA-Z0-9-]+\.up\.railway\.app$'),
    re.compile(r'^https://[a-zA-Z0-9-]+\.netlify\.app$'),
]

def _is_allowed(origin: str) -> bool:
    if not origin:
        return False
    if origin in _EXACT_ORIGINS:
        return True
    frontend_url = os.getenv('FRONTEND_URL', '').rstrip('/')
    if frontend_url and origin == frontend_url:
        return True
    return any(p.match(origin) for p in _ORIGIN_PATTERNS)


@app.before_request
def cors_preflight():
    if request.method != 'OPTIONS':
        return
    origin = request.headers.get('Origin', '')
    if not _is_allowed(origin):
        print(f"[CORS] ❌ Preflight blocked: {origin}")
        return make_response('Forbidden', 403)
    resp = make_response('', 204)
    resp.headers['Access-Control-Allow-Origin']      = origin
    resp.headers['Access-Control-Allow-Methods']     = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    resp.headers['Access-Control-Allow-Headers']     = 'Content-Type, Authorization, Accept'
    resp.headers['Access-Control-Allow-Credentials'] = 'true'
    resp.headers['Access-Control-Max-Age']           = '3600'
    return resp


@app.after_request
def cors_headers(response):
    origin = request.headers.get('Origin', '')
    if origin and _is_allowed(origin):
        response.headers['Access-Control-Allow-Origin']      = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Expose-Headers']    = 'Content-Type'
    return response


@app.before_request
def ensure_www():
    if request.method == 'OPTIONS':
        return
    if request.host.split(':')[0] == 'resumeblast.ai':
        return redirect(request.url.replace('resumeblast.ai', 'www.resumeblast.ai', 1), 301)


# ─────────────────────────────────────────────────────────────────────────────
# Blueprints
# ─────────────────────────────────────────────────────────────────────────────
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
app.register_blueprint(drip_campaign_bp)  # ✅ NEW


# ─────────────────────────────────────────────────────────────────────────────
# ✅ APScheduler — Drip Email Scheduler
# Runs every 30 minutes to process Day 4 & Day 8 emails
# ─────────────────────────────────────────────────────────────────────────────
def _start_drip_scheduler():
    """Start APScheduler for drip email processing."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from services.drip_scheduler import run_scheduler_tick

        scheduler = BackgroundScheduler(timezone="UTC")
        scheduler.add_job(
            func=run_scheduler_tick,
            trigger="interval",
            minutes=30,
            id="drip_email_scheduler",
            name="Drip Email Scheduler",
            replace_existing=True
        )
        scheduler.start()
        print("✅ Drip email scheduler started (runs every 30 minutes)")
        return scheduler
    except ImportError:
        print("⚠️ APScheduler not installed — drip scheduler disabled")
        print("   Run: pip install apscheduler")
        return None
    except Exception as e:
        print(f"⚠️ Could not start drip scheduler: {e}")
        return None

# Start scheduler when the app starts (not during import/test)
_drip_scheduler = None
if os.getenv('FLASK_ENV') != 'testing':
    _drip_scheduler = _start_drip_scheduler()


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/')
def home():
    return jsonify({'status': 'success', 'message': 'ResumeBlast API is running', 'version': '1.0.0'})


@app.route('/api/health')
def health():
    return jsonify({
        'status':                    'healthy',
        'stripe_configured':         bool(os.getenv('STRIPE_SECRET_KEY')),
        'supabase_configured':       bool(os.getenv('SUPABASE_SERVICE_ROLE_KEY')),
        'anthropic_configured':      bool(os.getenv('ANTHROPIC_API_KEY')),
        'stripe_webhook_configured': bool(os.getenv('STRIPE_WEBHOOK_SECRET')),
        'brevo_configured':          bool(os.getenv('BREVO_API_KEY')),
        'drip_scheduler_running':    _drip_scheduler is not None and _drip_scheduler.running if _drip_scheduler else False,
    })


@app.route('/api/test-cors', methods=['GET', 'POST', 'PATCH', 'OPTIONS'])
def test_cors():
    origin = request.headers.get('Origin', 'no-origin')
    return jsonify({'success': True, 'origin': origin, 'allowed': _is_allowed(origin)})


if __name__ == '__main__':
    port  = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    print('\n' + '='*70)
    print('🚀 RESUMEBLAST API SERVER STARTING')
    print('='*70)
    print(f'🌐 Port:            {port}')
    print(f'🔧 Debug Mode:      {debug}')
    print(f'💳 Stripe Webhook:  /api/webhooks/stripe')
    print(f'🔍 Analyze:         /api/analyze')
    print(f'📊 User Activity:   /api/user-activity/log')
    print(f'👤 Guest Tracking:  /api/guest/*')
    print(f'📧 Drip Campaigns:  /api/drip/*')
    print(f'⏰ Scheduler:       Every 30 min (Business hours only)')
    print('='*70 + "\n")
    app.run(host='0.0.0.0', port=port, debug=debug)