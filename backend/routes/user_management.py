from flask import Blueprint, request, jsonify
from services.user_service import UserService

user_management_bp = Blueprint('user_management', __name__)

@user_management_bp.route('/api/admin/users/delete', methods=['POST'])
def delete_user():
    try:
        data = request.json
        email = data.get('email')
        user_id = data.get('user_id')
        reason = data.get('reason', 'Admin deletion')
        # ✅ Get the admin email sent from frontend (default to 'system' if missing)
        admin_email = data.get('admin_email', 'system')
        
        if not email:
            return jsonify({'success': False, 'error': 'Email required'}), 400
            
        # ✅ Pass admin_email to the service as 'deleted_by'
        summary = UserService.delete_user_data(email, user_id, reason, deleted_by=admin_email)
        
        return jsonify({
            'success': True, 
            'message': 'User deleted successfully',
            'details': summary
        }), 200
        
    except Exception as e:
        print(f"❌ Delete User Error: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500