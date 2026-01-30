# backend/routes/user_activity.py
from flask import Blueprint, request, jsonify
from services.user_activity_service import UserActivityService

user_activity_bp = Blueprint('user_activity', __name__, url_prefix='/api/user-activity')

@user_activity_bp.route('/log', methods=['POST'])
def log_user_activity():
    """
    Endpoint to log user activity from frontend
    """
    try:
        data = request.json
        user_id = data.get('user_id')
        email = data.get('email')
        event_type = data.get('event_type')
        metadata = data.get('metadata', {})
        
        # Validation
        if not user_id or not event_type:
            return jsonify({
                'success': False,
                'error': 'user_id and event_type are required'
            }), 400
        
        # Call Service
        result = UserActivityService.log_activity(
            user_id=user_id,
            email=email,
            event_type=event_type,
            metadata=metadata
        )
        
        status_code = 200 if result['success'] else 500
        return jsonify(result), status_code
        
    except Exception as e:
        print(f"❌ Route Error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500