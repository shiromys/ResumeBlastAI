// src/services/recruiterAuthService.js
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Logic to ensure a recruiter ID is valid for Foreign Key constraints.
 * Only adds to the 'recruiters' table if they don't exist in either table.
 */
const ensureRecruiterExistsForActivity = async (authId, email, alreadyInDB) => {
  if (alreadyInDB) {
    console.log('✅ Recruiter already verified in database. Skipping duplication.');
    return true;
  }

  try {
    console.log('🔄 New recruiter detected, syncing to primary table...');
    const response = await fetch(`${API_URL}/api/admin/recruiters/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_table: 'recruiters',
        email: email,
        id: authId,
        is_active: true
      })
    });
    return response.ok;
  } catch (err) {
    console.error('❌ Sync Error:', err);
    return false;
  }
};

export const checkRecruiterExists = async (email) => {
  try {
    const trimmedEmail = email.trim().toLowerCase();
    
    // Check primary table
    const { data: paid } = await supabase.from('recruiters').select('id, email').eq('email', trimmedEmail).maybeSingle();
    if (paid) return { exists: true, recruiter: paid, source: 'paid' };

    // Check freemium table
    const { data: free } = await supabase.from('freemium_recruiters').select('id, email').eq('email', trimmedEmail).maybeSingle();
    if (free) return { exists: true, recruiter: free, source: 'freemium' };

    return { exists: false };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

export const grantDirectRecruiterAccess = async (email) => {
  try {
    const check = await checkRecruiterExists(email);
    if (check.exists) {
      // Direct access granted for existing recruiters in either table.
      // alreadyInDB = true prevents duplication in the 'recruiters' table.
      await ensureRecruiterExistsForActivity(check.recruiter.id, email, true);
      return { success: true, recruiter: check.recruiter };
    }
    return { success: false, error: "Recruiter not found in verified lists" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export const registerRecruiter = async (email, password) => {
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: password,
      options: { data: { role: 'recruiter' } }
    });

    if (authError) throw authError;

    // Only NEW registrations (alreadyInDB = false) get stored in 'recruiters'
    await ensureRecruiterExistsForActivity(authData.user.id, email, false);
    return { success: true, recruiter: authData.user };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export const getCurrentSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user || null;
}