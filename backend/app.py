from flask import Flask, jsonify, request, redirect 
from flask_cors import CORS
import os
from pathlib import Path
from dotenv import load_dotenv
from routes.contact import contact_bp

# ✅ ROBUST LOCAL LOADING: Use absolute path to the backend directory
BASE_DIR = Path(__file__).resolve().parent
manual_env_path = BASE_DIR / '.env'

if manual_env_path.exists():
    # Force reload to ensure any changes in the file are picked up
    load_dotenv(dotenv_path=manual_env_path, override=True)
    print(f"✅ Success: Environment loaded from {manual_env_path}")
else:
    print(f"❌ CRITICAL ERROR: .env not found at: {manual_env_path}")
    print("Please ensure your .env file is inside the 'backend' folder.")

# ✅ VERIFY ALL ENVIRONMENT VARIABLES
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
print(f"STRIPE_WEBHOOK_SECRET: {'✅ SET (' + (stripe_webhook_secret[:15] if stripe_webhook_secret else '') + '...)' if stripe_webhook_secret else '⚠️ NOT SET (optional for webhooks)'}")
print("="*70 + "\n")

# ❌ STOP SERVER IF CRITICAL VARS MISSING
if not supabase_url:
    print("🚨 CRITICAL ERROR: SUPABASE_URL is not set!")
    print("   Please check your .env file in the backend folder")
    print("   Expected location: backend/.env")
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
from routes.guest_routes import guest_bp  # ✅ ADDED: Guest user tracking

app = Flask(__name__)

# ✅ NEW: FORCE REDIRECT FROM NAKED TO WWW
# This ensures users always see the updated version at www.resumeblast.ai
@app.before_request
def ensure_www():
    url_parts = request.host.split(':') # Handle port if present
    host = url_parts[0]
    if host == "resumeblast.ai":
        target_url = request.url.replace("resumeblast.ai", "www.resumeblast.ai", 1)
        return redirect(target_url, code=301)

# ✅ UPDATED CORS CONFIGURATION
CORS(app, 
     resources={
         r"/*": {
             "origins": [
                 "http://localhost:5173",
                 "http://localhost:3000",
                 "http://localhost:5000",
                 "https://resumeblast.ai",
                 "https://www.resumeblast.ai", # ✅ ADDED: Explicitly allow the www subdomain
                 "https://*.railway.app",      # ✅ ADDED: Allow all Railway subdomains for stability
                 os.getenv('FRONTEND_URL', '*')
             ],
             "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
             "allow_headers": ["Content-Type", "Authorization", "Accept"],
             "supports_credentials": True,
             "expose_headers": ["Content-Type"],
             "max_age": 3600
         }
     }
)

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
app.register_blueprint(guest_bp)  # ✅ ADDED: Guest user tracking routes

@app.route('/')
def home():
    return jsonify({
        'status': 'success',
        'message': 'ResumeBlast API is running',
        'version': '1.0.0'
    })

@app.route('/api/health')
def health():
    return jsonify({
        'status': 'healthy',
        'stripe_configured': bool(os.getenv('STRIPE_SECRET_KEY')),
        'webhook_configured': bool(os.getenv('MAKE_WEBHOOK_URL')),
        'supabase_configured': bool(os.getenv('SUPABASE_SERVICE_ROLE_KEY')),
        'anthropic_configured': bool(os.getenv('ANTHROPIC_API_KEY')),
        'stripe_webhook_configured': bool(os.getenv('STRIPE_WEBHOOK_SECRET')),
        'bounce_webhooks_configured': True
    })

@app.route('/api/test-cors', methods=['GET', 'POST', 'PATCH', 'OPTIONS'])
def test_cors():
    return jsonify({
        'success': True,
        'message': 'CORS is working correctly',
        'cors_enabled': True
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
    print(f'👤 Guest Tracking: /api/guest/*')  # ✅ ADDED: Log line for guest routes
    print('='*70 + "\n")
    
    app.run(host='0.0.0.0', port=port, debug=debug)