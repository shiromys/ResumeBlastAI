// src/services/recruiterAuthService.js
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Logic to ensure a recruiter ID is valid for Foreign Key constraints.
 * 
 * CHANGE: New registrations (alreadyInDB = false) now go to 'app_registered_recruiters'
 *         instead of 'recruiters'. The 'recruiters' table is reserved for verified/paid
 *         recruiters that are manually added by the admin.
 * 
 * Existing verified recruiters (alreadyInDB = true) are NOT touched — no duplication.
 */
const ensureRecruiterExistsForActivity = async (authId, email, alreadyInDB) => {
  if (alreadyInDB) {
    console.log('✅ Recruiter already verified in database. Skipping duplication.');
    return true;
  }

  try {
    // ✅ CHANGE: New app-registered (unverified) recruiters are stored in
    // 'app_registered_recruiters' — NOT in the 'recruiters' table.
    console.log('🔄 New app-registered recruiter detected, syncing to app_registered_recruiters table...');
    const response = await fetch(`${API_URL}/api/admin/recruiters/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_table: 'app_registered_recruiters', // ✅ CHANGED: was 'recruiters'
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

/**
 * Check if a recruiter exists in either verified table.
 * 
 * UNCHANGED: Still checks 'recruiters' (verified/paid) and 'freemium_recruiters'.
 * NOTE: app_registered_recruiters are NOT checked here intentionally —
 *       those recruiter logins would re-register through Supabase Auth on next visit.
 *       If you want app-registered recruiters to be able to log back in, add a
 *       third check below (see comment).
 */
export const checkRecruiterExists = async (email) => {
  try {
    const trimmedEmail = email.trim().toLowerCase();
    
    // Check primary verified table
    const { data: paid } = await supabase.from('recruiters').select('id, email').eq('email', trimmedEmail).maybeSingle();
    if (paid) return { exists: true, recruiter: paid, source: 'paid' };

    // Check freemium table
    const { data: free } = await supabase.from('freemium_recruiters').select('id, email').eq('email', trimmedEmail).maybeSingle();
    if (free) return { exists: true, recruiter: free, source: 'freemium' };

    // ✅ ADDED: Check app_registered_recruiters table so that previously
    // registered (unverified) recruiters can log back in without re-registering.
    const { data: appReg } = await supabase
      .from('app_registered_recruiters')
      .select('id, email')
      .eq('email', trimmedEmail)
      .maybeSingle();
    if (appReg) return { exists: true, recruiter: appReg, source: 'app_registered' };

    return { exists: false };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

/**
 * Grant direct access to an existing recruiter (verified or app-registered).
 * UNCHANGED in logic — relies on checkRecruiterExists which now also covers app_registered.
 */
export const grantDirectRecruiterAccess = async (email) => {
  try {
    const check = await checkRecruiterExists(email);
    if (check.exists) {
      // alreadyInDB = true prevents any duplication attempt
      await ensureRecruiterExistsForActivity(check.recruiter.id, email, true);
      return { success: true, recruiter: check.recruiter };
    }
    return { success: false, error: "Recruiter not found in verified lists" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Register a brand new recruiter via the application.
 * 
 * CHANGE: Their profile record is now stored in 'app_registered_recruiters'
 *         (unverified) instead of 'recruiters' (verified).
 *         Supabase Auth signup is unchanged.
 */
export const registerRecruiter = async (email, password) => {
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: password,
      options: { data: { role: 'recruiter' } }
    });

    if (authError) throw authError;

    // ✅ CHANGE: alreadyInDB = false → ensureRecruiterExistsForActivity will now
    // insert into 'app_registered_recruiters' instead of 'recruiters'
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