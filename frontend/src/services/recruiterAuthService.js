// src/services/recruiterAuthService.js
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Syncs a newly registered recruiter into the app_registered_recruiters table.
 * Only called for brand-new registrations (alreadyInDB = false).
 * Verified/paid recruiters (alreadyInDB = true) are never touched.
 */
const ensureRecruiterExistsForActivity = async (authId, email, alreadyInDB) => {
  if (alreadyInDB) {
    console.log('✅ Recruiter already verified in database. Skipping duplication.');
    return true;
  }

  try {
    // ✅ FIXED: Routes new app registrations to 'app_registered_recruiters'
    // instead of 'recruiters' (which is reserved for verified/paid recruiters).
    console.log('🔄 New app-registered recruiter detected, syncing to app_registered_recruiters table...');
    const response = await fetch(`${API_URL}/api/admin/recruiters/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_table: 'app_registered_recruiters', // ✅ FIXED: was 'recruiters'
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
 * Check if a recruiter exists across all three tables:
 * 1. recruiters                  → verified/paid (manually added by admin)
 * 2. freemium_recruiters         → freemium tier
 * 3. app_registered_recruiters   → self-registered through the app (unverified)
 */
export const checkRecruiterExists = async (email) => {
  try {
    const trimmedEmail = email.trim().toLowerCase();

    // Check verified/paid table
    const { data: paid } = await supabase
      .from('recruiters')
      .select('id, email')
      .eq('email', trimmedEmail)
      .maybeSingle();
    if (paid) return { exists: true, recruiter: paid, source: 'paid' };

    // Check freemium table
    const { data: free } = await supabase
      .from('freemium_recruiters')
      .select('id, email')
      .eq('email', trimmedEmail)
      .maybeSingle();
    if (free) return { exists: true, recruiter: free, source: 'freemium' };

    // ✅ ADDED: Check app_registered_recruiters so previously self-registered
    // recruiters can log back in without being forced to re-register.
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
 * Grant direct access to an existing recruiter (any table).
 * Unchanged in logic — relies on checkRecruiterExists which covers all 3 tables.
 */
export const grantDirectRecruiterAccess = async (email) => {
  try {
    const check = await checkRecruiterExists(email);
    if (check.exists) {
      await ensureRecruiterExistsForActivity(check.recruiter.id, email, true);
      return { success: true, recruiter: check.recruiter };
    }
    return { success: false, error: "Recruiter not found in verified lists" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Register a brand-new recruiter via the application.
 *
 * ✅ FIXED: Handles the case where the user already exists in Supabase Auth
 * (e.g. registered on localhost but app_registered_recruiters record is missing).
 * In that case we sign them in with their password instead of trying to sign up again,
 * then ensure their record exists in app_registered_recruiters.
 */
export const registerRecruiter = async (email, password) => {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: password,
      options: { data: { role: 'recruiter' } }
    });

    // ✅ FIXED: Supabase returns 422 "User already registered" when the email
    // already exists in Auth. We catch that and sign them in instead,
    // then sync their record to app_registered_recruiters if it is missing.
    if (authError) {
      const alreadyExists =
        authError.message?.toLowerCase().includes('user already registered') ||
        authError.message?.toLowerCase().includes('already registered') ||
        authError.status === 422;

      if (alreadyExists) {
        console.log('⚠️ User already in Supabase Auth — attempting sign-in instead...');

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: password,
        });

        if (signInError) {
          return { success: false, error: 'This email is already registered. Please check your password and try again.' };
        }

        const user = signInData.user;

        // Ensure the app_registered_recruiters record exists (may be missing
        // if the previous registration attempt failed mid-way).
        const check = await checkRecruiterExists(normalizedEmail);
        if (!check.exists) {
          console.log('🔄 Auth user found but no DB record — syncing to app_registered_recruiters...');
          await ensureRecruiterExistsForActivity(user.id, normalizedEmail, false);
        }

        return { success: true, recruiter: user };
      }

      // Any other auth error — bubble it up
      throw authError;
    }

    // Normal new registration path
    await ensureRecruiterExistsForActivity(authData.user.id, normalizedEmail, false);
    return { success: true, recruiter: authData.user };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

export const getCurrentSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user || null;
}