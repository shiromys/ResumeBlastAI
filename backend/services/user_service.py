# backend/services/user_service.py
import os
import requests
from datetime import datetime
import json
import traceback

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

class UserService:
    @staticmethod
    def _get_headers():
        """Get Supabase headers with service role key"""
        return {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }

    @staticmethod
    def get_full_user_data(user_id):
        """Fetch full user record for archiving before deletion"""
        try:
            url = f"{SUPABASE_URL}/rest/v1/users?id=eq.{user_id}"
            resp = requests.get(url, headers=UserService._get_headers())
            if resp.status_code == 200:
                data = resp.json()
                # Return the first record found
                return data[0] if data else None
            return None
        except Exception as e:
            print(f"⚠️ Failed to fetch user archive data: {e}")
            return None

    @staticmethod
    def delete_user_data(email, user_id=None, reason="Admin deletion", deleted_by="system"):
        """
        Complete user data deletion orchestration:
        1. Resolve user_id if not provided
        2. Archive user data (fetch before delete)
        3. Add to blacklist (deleted_users table) with admin info
        4. Delete from all database tables
        5. Ban user in users table
        6. Delete from Supabase Auth
        """
        print(f"\n{'='*70}")
        print(f"🗑️  STARTING USER DELETION")
        print(f"{'='*70}")
        print(f"📧 Email: {email}")
        print(f"👤 Deleted By: {deleted_by}")
        
        deletion_summary = {
            'email': email,
            'reason': reason,
            'timestamp': datetime.utcnow().isoformat(),
            'steps_completed': []
        }
        
        # STEP 1: Resolve User ID
        if not user_id:
            print(f"\n🔍 Step 1: Resolving user ID...")
            user_id = UserService.get_user_id_by_email(email)
            if user_id:
                print(f"✅ User ID found: {user_id}")
                deletion_summary['user_id'] = user_id
            else:
                print(f"⚠️  User ID not found for {email}")
                deletion_summary['user_id'] = None
        else:
            deletion_summary['user_id'] = user_id
            print(f"✅ User ID provided: {user_id}")
        
        # STEP 1.5: Fetch Data to Archive (Before deleting!)
        user_archive_data = None
        if user_id:
            print(f"\n📦 Step 1.5: Fetching user data for archiving...")
            user_archive_data = UserService.get_full_user_data(user_id)
            if user_archive_data:
                print(f"✅ User data archived (contains {len(user_archive_data)} fields)")
            else:
                print(f"⚠️  No user data found to archive")

        # STEP 2: Add to Blacklist (CRITICAL - Do this first!)
        print(f"\n🚫 Step 2: Adding to blacklist...")
        
        # ✅ Pass deleted_by and the archived data
        blacklist_result = UserService.add_to_blacklist(email, user_id, reason, deleted_by, user_archive_data)
        
        if blacklist_result:
            print(f"   ✅ BLACKLIST STEP SUCCEEDED")
            deletion_summary['steps_completed'].append('blacklist')
        else:
            print(f"   ❌ BLACKLIST STEP FAILED")
        
        if user_id:
            # STEP 3: Ban user in users table (before deletion)
            # This ensures if deletion fails, they are at least locked out
            print(f"\n⛔ Step 3: Banning user account...")
            UserService.ban_user(user_id, reason)
            deletion_summary['steps_completed'].append('ban_user')
            
            # STEP 4: Delete from all database tables
            print(f"\n🗂️  Step 4: Deleting from database tables...")
            tables_deleted = UserService.delete_from_all_tables(user_id)
            deletion_summary['steps_completed'].append('database_cleanup')
            deletion_summary['tables_deleted'] = tables_deleted
            
            # STEP 5: Delete from Supabase Auth
            print(f"\n🔐 Step 5: Deleting from authentication...")
            UserService.delete_from_auth(user_id)
            deletion_summary['steps_completed'].append('auth_deletion')
        
        print(f"\n{'='*70}")
        print(f"✅ USER DELETION COMPLETED")
        print(f"{'='*70}")
        print(f"Steps completed: {deletion_summary.get('steps_completed')}")
        print(f"Tables deleted: {len(deletion_summary.get('tables_deleted', []))}")
        print(f"{'='*70}\n")
        
        return deletion_summary

    @staticmethod
    def get_user_id_by_email(email):
        """Find user ID by email"""
        try:
            # Try public.users first (faster)
            url = f"{SUPABASE_URL}/rest/v1/users?email=eq.{email}&select=id"
            resp = requests.get(url, headers=UserService._get_headers())
            
            if resp.status_code == 200:
                data = resp.json()
                if data and len(data) > 0:
                    return data[0]['id']
            
            # Try payments table as fallback
            url = f"{SUPABASE_URL}/rest/v1/payments?user_email=eq.{email}&select=user_id&limit=1"
            resp = requests.get(url, headers=UserService._get_headers())
            
            if resp.status_code == 200:
                data = resp.json()
                if data and len(data) > 0:
                    return data[0]['user_id']
            
            return None
            
        except Exception as e:
            print(f"❌ Error finding user ID: {e}")
            return None

    @staticmethod
    def add_to_blacklist(email, original_user_id, reason, deleted_by="system", original_data=None):
        """Add email to deleted_users blacklist with full archive data"""
        try:
            url = f"{SUPABASE_URL}/rest/v1/deleted_users"
            
            # Prepare the data
            data = {
                'email': email.lower(),
                'original_user_id': original_user_id,
                'reason': reason,
                'deleted_at': datetime.utcnow().isoformat(),
                'deleted_by': deleted_by,
                'original_data': original_data,
                'metadata': {
                    'deletion_timestamp': datetime.utcnow().isoformat(),
                    'reason_category': 'refund' if 'refund' in reason.lower() else 'admin'
                }
            }
            
            # Get headers
            headers = UserService._get_headers()
            headers['Prefer'] = 'resolution=merge-duplicates,return=representation'
            
            # Make the request
            response = requests.post(url, json=data, headers=headers, timeout=10)
            
            if response.status_code in [200, 201]:
                return True
            else:
                print(f"   ❌ FAILED to add to blacklist! Status: {response.status_code}")
                print(f"      Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"   ❌ UNEXPECTED ERROR in add_to_blacklist: {str(e)}")
            return False

    @staticmethod
    def ban_user(user_id, reason):
        """Ban user in users table (mark as banned before deletion)"""
        try:
            url = f"{SUPABASE_URL}/rest/v1/users?id=eq.{user_id}"
            
            data = {
                'is_banned': True,
                'ban_reason': reason,
                'banned_at': datetime.utcnow().isoformat(),
                'account_status': 'banned',
                'updated_at': datetime.utcnow().isoformat()
            }
            
            requests.patch(url, json=data, headers=UserService._get_headers())
        except Exception as e:
            print(f"⚠️  Error banning user: {e}")

    @staticmethod
    def delete_from_all_tables(user_id):
        """
        Delete user data from all tables
        Returns list of tables that were successfully cleaned
        """
        # ✅ ADDED 'user_profiles' to this list to ensure proper deletion
        tables = [
            'user_profiles',        # <--- Critical Addition
            'resume_uploads',
            'blast_history', 
            'payment_history',
            'user_activity',
            'recruiter_activity',
            'support_tickets',
            'payments',
            'resumes',
            'blast_campaigns',
            'resume_analysis',
            'blast_recipients',
            'blast_responses',
            'contact_submissions'
        ]
        
        deleted_tables = []
        
        # 1. Delete Child Tables First
        for table in tables:
            try:
                # Construct URL (handle both snake_case column names usually found in these tables)
                url = f"{SUPABASE_URL}/rest/v1/{table}?user_id=eq.{user_id}"
                
                # Special case for tables that might use 'id' as the FK (like user_profiles often does)
                if table == 'user_profiles':
                     url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{user_id}"

                response = requests.delete(url, headers=UserService._get_headers())
                
                if response.status_code in [200, 204]:
                    print(f"   ✓ Cleared: {table}")
                    deleted_tables.append(table)
                else:
                    # Ignore 404s or cases where table doesn't exist/empty
                    print(f"   - Skipped: {table} ({response.status_code})")
                    
            except Exception as e:
                print(f"   ⚠  Error clearing {table}: {e}")
        
        # 2. Finally Delete from 'users' table
        try:
            print(f"   🗑️ Attempting to delete from 'users' table...")
            url = f"{SUPABASE_URL}/rest/v1/users?id=eq.{user_id}"
            response = requests.delete(url, headers=UserService._get_headers())
            
            if response.status_code in [200, 204]:
                print(f"   ✅ SUCCESSFULLY DELETED USER RECORD")
                deleted_tables.append('users')
            else:
                print(f"   ❌ Failed to delete from users table. Status: {response.status_code}")
                print(f"      Error: {response.text}")
                print(f"      HINT: Check if there are other tables referencing 'users.id' that are not in the list above.")
                
        except Exception as e:
            print(f"   ⚠  Error clearing users: {e}")
        
        return deleted_tables

    @staticmethod
    def delete_from_auth(user_id):
        """Delete user from Supabase Auth"""
        try:
            url = f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
            response = requests.delete(url, headers=UserService._get_headers())
            
            if response.status_code in [200, 204]:
                print(f"✅ Deleted from Supabase Auth")
            else:
                print(f"⚠️  Auth deletion response: {response.status_code}")
                
        except Exception as e:
            print(f"⚠️  Auth deletion error: {e}")