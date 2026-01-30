# backend/services/user_activity_service.py
import os
import requests
from datetime import datetime
import json

class UserActivityService:
    """
    Service for tracking user activities using direct HTTP requests to Supabase REST API
    Uses Service Role Key to bypass RLS policies.
    """
    
    @staticmethod
    def _get_headers():
        """Get headers for Supabase REST API requests with Admin Privileges"""
        api_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        return {
            'apikey': api_key,
            'Authorization': f"Bearer {api_key}",
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    
    @staticmethod
    def _get_base_url():
        return f"{os.getenv('SUPABASE_URL')}/rest/v1"
    
    @staticmethod
    def log_activity(user_id, email, event_type, metadata=None):
        """
        Log user activity to user_activity table
        """
        try:
            url = f"{UserActivityService._get_base_url()}/user_activity"
            
            activity_data = {
                'user_id': user_id,
                'email': email,
                'event_type': event_type,
                'metadata': metadata or {},
                'event_timestamp': datetime.utcnow().isoformat(),
                'created_at': datetime.utcnow().isoformat()
            }
            
            print(f"📝 Backend Logging: {event_type} for {email}")
            
            response = requests.post(
                url,
                headers=UserActivityService._get_headers(),
                json=activity_data,
                timeout=10
            )
            
            if response.status_code in [200, 201]:
                print(f"✅ Activity logged successfully: {event_type}")
                return {'success': True, 'data': response.json()}
            else:
                error_msg = f"Status {response.status_code}: {response.text}"
                print(f"❌ Failed to log activity: {error_msg}")
                return {'success': False, 'error': error_msg}
            
        except Exception as e:
            print(f"❌ Exception in UserActivityService: {str(e)}")
            return {'success': False, 'error': str(e)}