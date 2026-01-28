import { supabase } from '../lib/supabase'

/**
 * 1. Check if email exists in 'recruiters' table
 * Required for the UI to decide whether to show Login or Register screen.
 */
export const checkRecruiterExists = async (email) => {
  try {
    const { data, error } = await supabase
      .from('recruiters')
      .select('id, email')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (error) throw error
    return { exists: !!data, recruiter: data }
  } catch (error) {
    console.error('Check failed:', error)
    return { exists: false, error: error.message }
  }
}

/**
 * 2. Register NEW recruiter using Secure Supabase Auth
 */
export const registerRecruiter = async (email, password) => {
  try {
    const trimmedEmail = email.trim().toLowerCase()
    
    // STEP A: Create user in Supabase Auth securely
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: password,
      options: {
        data: { role: 'recruiter' } // Tag this user as a recruiter
      }
    })

    if (authError) {
      // Handle case where user exists in Auth but not in public table (rare sync issue)
      if (authError.message.includes('already registered')) {
        throw new Error('Email already registered. Please log in.')
      }
      throw authError
    }

    if (!authData.user) throw new Error('Registration failed')

    // STEP B: Create their public profile in the 'recruiters' table
    const newRecruiter = {
      id: authData.user.id, // CRITICAL: Link public ID to Auth ID
      email: trimmedEmail,
      name: trimmedEmail.split('@')[0], // Placeholder name
      company: 'Pending Company',       // Placeholder company
      industry: 'Technology',
      is_active: true,
      created_at: new Date().toISOString()
    }

    const { data, error: dbError } = await supabase
      .from('recruiters')
      .insert(newRecruiter)
      .select()
      .single()

    if (dbError) {
        // If profile already exists (race condition), just return it
        if (dbError.code === '23505') {
            return { success: true, recruiter: newRecruiter }
        }
        throw dbError
    }

    return { success: true, recruiter: data }
  } catch (error) {
    console.error('Registration failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 3. Login existing recruiter using Secure Supabase Auth
 */
export const loginRecruiter = async (email, password) => {
  try {
    // STEP A: Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password
    })

    if (authError) throw new Error('Invalid email or password')

    // STEP B: Fetch their full recruiter profile
    const { data, error: dbError } = await supabase
      .from('recruiters')
      .select('*')
      .eq('id', authData.user.id)
      .single()

    if (dbError) throw dbError

    return { success: true, recruiter: data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}