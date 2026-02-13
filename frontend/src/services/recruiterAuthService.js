// src/services/recruiterAuthService.js
import { supabase } from '../lib/supabase'

export const getCurrentSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) return null;
    return session.user;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

/**
 * UPDATED: Checks database tables AND handles Auth system conflicts
 */
export const checkRecruiterExists = async (email) => {
  try {
    const trimmedEmail = email.trim().toLowerCase();

    // 1. Check primary recruiters table
    const { data: paidRecruiter } = await supabase
      .from('recruiters')
      .select('id, email')
      .eq('email', trimmedEmail)
      .maybeSingle();

    if (paidRecruiter) return { exists: true, recruiter: paidRecruiter };

    // 2. Check freemium_recruiters table
    const { data: freeRecruiter } = await supabase
      .from('freemium_recruiters')
      .select('id, email')
      .eq('email', trimmedEmail)
      .maybeSingle();

    if (freeRecruiter) return { exists: true, recruiter: freeRecruiter };

    return { exists: false };
  } catch (error) {
    console.error('Check failed:', error);
    return { exists: false, error: error.message };
  }
}

/**
 * FIXED: Handles 422 errors by catching existing users in the Auth system
 */
export const registerRecruiter = async (email, password) => {
  try {
    const trimmedEmail = email.trim().toLowerCase()
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: password,
      options: {
        data: { role: 'recruiter' }
      }
    })

    if (authError) {
      // Catch "Email already registered" or 422 status
      if (authError.message.toLowerCase().includes('already registered') || authError.status === 422) {
        return { 
          success: false, 
          isExisting: true, 
          error: 'Email already registered in Auth system. Please use Login.' 
        }
      }
      throw authError
    }

    if (!authData.user) throw new Error('Registration failed')

    // Ensure the database record exists in the 'recruiters' table
    const newRecruiter = {
      id: authData.user.id,
      email: trimmedEmail,
      is_active: true,
      email_status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error: dbError } = await supabase
      .from('recruiters')
      .upsert(newRecruiter) 
      .select()
      .single()

    if (dbError) throw dbError

    return { success: true, recruiter: data || newRecruiter }
  } catch (error) {
    console.error('Registration failed:', error)
    return { success: false, error: error.message }
  }
}

export const loginRecruiter = async (email, password) => {
  try {
    const trimmedEmail = email.trim().toLowerCase()
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: password
    })

    if (authError) {
        // If login fails with 400 Bad Request, it usually means wrong password
        throw new Error('Invalid email or password')
    }

    // Double check that they are in a recruiter table
    const { data: paid } = await supabase.from('recruiters').select('*').eq('id', authData.user.id).maybeSingle()
    if (paid) return { success: true, recruiter: paid }

    const { data: free } = await supabase.from('freemium_recruiters').select('*').eq('email', authData.user.email).maybeSingle()
    if (free) return { success: true, recruiter: free }

    throw new Error('Recruiter profile not found')
  } catch (error) {
    return { success: false, error: error.message }
  }
}