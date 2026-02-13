// frontend/src/services/authService.js
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Check if user email is blacklisted/deleted
 * Call this BEFORE allowing signup or login
 */
export const checkBlacklist = async (email) => {
  try {
    console.log('🔍 Checking blacklist for:', email);
    
    const response = await fetch(`${API_URL}/api/auth/check-blacklist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.toLowerCase() }),
    });

    const data = await response.json();

    // Check specifically for the is_blacklisted flag
    if (data.is_blacklisted) {
      console.log('🚫 User is blacklisted:', email);
      return {
        allowed: false,
        reason: data.reason,
        // ✅ Return the specific message from backend
        message: data.message || "For the signup/login contact support"
      };
    }

    console.log('✅ User not blacklisted, can proceed');
    return {
      allowed: true,
      message: 'Account is in good standing'
    };

  } catch (error) {
    console.error('❌ Error checking blacklist:', error);
    // On network error, we typically allow to proceed to not block valid users 
    // if the server is just down, unless you want strict blocking.
    return {
      allowed: true,
      error: error.message,
      message: 'Could not verify account status'
    };
  }
};

/**
 * Enhanced signup with blacklist check
 */
export const signUp = async (email, password, fullName) => {
  try {
    console.log('\n=== 📝 SIGNUP PROCESS STARTED ===');
    console.log('Email:', email);

    // STEP 1: Check blacklist FIRST
    // This blocks deleted users from creating new accounts
    console.log('Step 1: Checking blacklist...');
    const blacklistCheck = await checkBlacklist(email);

    if (!blacklistCheck.allowed) {
      console.log('🚫 Signup blocked - User is blacklisted');
      return {
        success: false,
        error: blacklistCheck.message, // "For the signup/login contact support"
        isBlacklisted: true
      };
    }

    console.log('✅ Blacklist check passed');

    // STEP 2: Proceed with Supabase signup
    console.log('Step 2: Creating Supabase auth account...');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      console.error('❌ Supabase auth signup error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }

    if (!data.user) {
      console.error('❌ No user data returned from Supabase auth');
      return {
        success: false,
        error: 'Failed to create user account'
      };
    }

    console.log('✅ Supabase auth user created:', data.user.id);

    // ✅ STEP 3: Insert user into users table (THIS WAS MISSING!)
    console.log('Step 3: Inserting user into users table...');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([
        {
          id: data.user.id,
          email: email.toLowerCase(),
          full_name: fullName,
          role: 'job_seeker',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (userError) {
      console.error('❌ Error inserting into users table:', userError);
      console.error('Error details:', JSON.stringify(userError, null, 2));
      
      // Don't throw error - auth user is created, just log the issue
      console.warn('⚠️ User created in auth but failed to insert into users table');
      console.warn('⚠️ User ID:', data.user.id);
      console.warn('⚠️ This might be due to RLS policies or database trigger issues');
      
      // Still return success since auth user was created
      // The database trigger should handle this, but we're logging the issue
      return {
        success: true,
        user: data.user,
        session: data.session,
        warning: 'User created but table insert failed - may need manual sync'
      };
    }

    console.log('✅ User successfully inserted into users table:', userData);
    console.log('=== ✅ SIGNUP PROCESS COMPLETED ===\n');

    return {
      success: true,
      user: userData,
      session: data.session
    };

  } catch (error) {
    console.error('❌ Signup error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Enhanced login with blacklist check
 */
export const signIn = async (email, password) => {
  try {
    console.log('\n=== 🔐 LOGIN PROCESS STARTED ===');
    console.log('Email:', email);

    // STEP 1: Check blacklist FIRST
    // This blocks deleted users from logging back in
    console.log('Step 1: Checking blacklist...');
    const blacklistCheck = await checkBlacklist(email);

    if (!blacklistCheck.allowed) {
      console.log('🚫 Login blocked - User is blacklisted');
      return {
        success: false,
        error: blacklistCheck.message, // "For the signup/login contact support"
        isBlacklisted: true
      };
    }

    console.log('✅ Blacklist check passed');

    // STEP 2: Proceed with Supabase login
    console.log('Step 2: Authenticating with Supabase...');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('❌ Login error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }

    // STEP 3: Fetch user data from users table
    console.log('Step 3: Fetching user data from users table...');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError) {
      console.warn('⚠️ Could not fetch user from users table:', userError);
      // Still allow login but use auth data
      return {
        success: true,
        user: data.user,
        session: data.session,
        warning: 'User data not found in users table'
      };
    }

    console.log('✅ Login successful');
    console.log('=== ✅ LOGIN PROCESS COMPLETED ===\n');

    return {
      success: true,
      user: userData,
      session: data.session
    };

  } catch (error) {
    console.error('❌ Login error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check auth status including blacklist (Restoring Session)
 */
export const checkAuthStatus = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        authenticated: false,
        user: null
      };
    }

    // Double check blacklist on session restore
    const blacklistCheck = await checkBlacklist(user.email);

    if (!blacklistCheck.allowed) {
      // User is blacklisted, force sign out immediately
      await supabase.auth.signOut();
      
      return {
        authenticated: false,
        user: null,
        isBlacklisted: true,
        message: blacklistCheck.message
      };
    }

    // Fetch user data from users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.warn('⚠️ Could not fetch user from users table:', userError);
      // Still return authenticated but with auth data only
      return {
        authenticated: true,
        user: user,
        isBlacklisted: false,
        warning: 'User data not found in users table'
      };
    }

    return {
      authenticated: true,
      user: userData,
      isBlacklisted: false
    };

  } catch (error) {
    console.error('Error checking auth status:', error);
    return {
      authenticated: false,
      user: null,
      error: error.message
    };
  }
};

/**
 * Sign out
 */
export const signOut = async () => {
  try {
    await supabase.auth.signOut();
    return { success: true };
  } catch (error) {
    console.error('Error signing out:', error);
    return {
      success: false,
      error: error.message
    };
  }
};