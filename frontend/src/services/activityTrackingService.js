// src/services/activityTrackingService.js
import { supabase } from '../lib/supabase'

console.log('📊 Activity Tracking Service Loaded (Enhanced v2.0)')

// ========================================================================
// HELPER FUNCTION: Safely get user email
// ========================================================================

/**
 * Safely retrieve user email from multiple sources
 */
const getUserEmail = async (userId, fallbackEmail = null) => {
  try {
    // If fallback email provided, use it
    if (fallbackEmail && fallbackEmail.includes('@')) {
      return fallbackEmail.trim().toLowerCase()
    }
    
    // Try to get from Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!authError && user?.email) {
      return user.email.trim().toLowerCase()
    }
    
    // Try to get from public.users table
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle()
    
    if (!dbError && userData?.email) {
      return userData.email.trim().toLowerCase()
    }
    
    console.warn('⚠️ Could not fetch user email, using placeholder')
    return 'unknown@email.com'
  } catch (error) {
    console.error('❌ Error fetching user email:', error)
    return 'unknown@email.com'
  }
}

// ========================================================================
// USER AUTHENTICATION TRACKING
// ========================================================================

/**
 * Track user login event
 */
export const trackUserLogin = async (userId, email, metadata = {}) => {
  try {
    console.log('📊 [LOGIN TRACKING] Starting for user:', userId)
    
    // Ensure we have a valid email
    const userEmail = await getUserEmail(userId, email)
    console.log('📊 [LOGIN TRACKING] Email confirmed:', userEmail)
    
    // 1. Log activity to user_activity table
    console.log('📊 [LOGIN TRACKING] Inserting login activity...')
    const { data: activityData, error: activityError } = await supabase
      .from('user_activity')
      .insert({
        user_id: userId,
        email: userEmail,
        event_type: 'login',
        event_timestamp: new Date().toISOString(),
        metadata: {
          ...metadata,
          login_timestamp: new Date().toISOString()
        }
      })
      .select()

    if (activityError) {
      console.error('❌ [LOGIN TRACKING] Failed to log activity:', activityError)
      // Continue anyway - don't fail login if activity tracking fails
    } else {
      console.log('✅ [LOGIN TRACKING] Activity logged successfully')
    }

    // 2. Check if user exists in public.users table
    console.log('📊 [LOGIN TRACKING] Checking user record...')
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, email, login_count')
      .eq('id', userId)
      .maybeSingle()

    if (fetchError) {
      console.error('❌ [LOGIN TRACKING] Error checking user:', fetchError)
    }

    if (existingUser) {
      // User exists - update login count and timestamp
      console.log('📊 [LOGIN TRACKING] Updating existing user record...')
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          last_login_at: new Date().toISOString(),
          login_count: (existingUser.login_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
      
      if (updateError) {
        console.error('❌ [LOGIN TRACKING] Failed to update user:', updateError)
      } else {
        console.log('✅ [LOGIN TRACKING] User record updated')
      }
    } else {
      // User doesn't exist - create record
      console.log('⚠️ [LOGIN TRACKING] User not found in public.users, creating...')
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: userEmail,
          last_login_at: new Date().toISOString(),
          login_count: 1,
          account_status: 'active',
          created_at: new Date().toISOString()
        })
      
      if (insertError) {
        console.error('❌ [LOGIN TRACKING] Failed to create user record:', insertError)
      } else {
        console.log('✅ [LOGIN TRACKING] User record created')
      }
    }

    console.log('✅ [LOGIN TRACKING] Completed successfully')
    return { success: true }
    
  } catch (error) {
    console.error('❌ [LOGIN TRACKING] Unexpected error:', error)
    // Don't throw - we don't want to break login flow
    return { success: false, error: error.message }
  }
}

/**
 * Track user signup event - CRITICAL FUNCTION
 */
export const trackUserSignup = async (userId, email, metadata = {}) => {
  try {
    console.log('\n========================================')
    console.log('📊 [SIGNUP TRACKING] STARTING')
    console.log('📊 [SIGNUP TRACKING] User ID:', userId)
    console.log('📊 [SIGNUP TRACKING] Email:', email)
    console.log('📊 [SIGNUP TRACKING] Metadata:', metadata)
    console.log('========================================\n')
    
    // Ensure we have a valid email
    const userEmail = await getUserEmail(userId, email)
    console.log('📊 [SIGNUP TRACKING] Email confirmed:', userEmail)
    
    // Extract full name from metadata
    const fullName = metadata.full_name || metadata.fullName || userEmail.split('@')[0]
    console.log('📊 [SIGNUP TRACKING] Full name:', fullName)

    // STEP 1: Create/Update user in public.users table
    console.log('📊 [SIGNUP TRACKING] Step 1: Creating user record...')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: userEmail,
        full_name: fullName,
        created_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
        login_count: 1,
        account_status: 'active',
        updated_at: new Date().toISOString()
      }, { 
        onConflict: 'id',
        ignoreDuplicates: false 
      })
      .select()

    if (userError) {
      console.error('❌ [SIGNUP TRACKING] Failed to create user record:', userError)
      console.error('❌ [SIGNUP TRACKING] Error details:', JSON.stringify(userError, null, 2))
      throw new Error(`Failed to create user record: ${userError.message}`)
    }
    
    console.log('✅ [SIGNUP TRACKING] User record created successfully')
    console.log('✅ [SIGNUP TRACKING] User data:', userData)

    // STEP 2: Log signup activity in user_activity table
    console.log('📊 [SIGNUP TRACKING] Step 2: Logging signup activity...')
    
    const activityPayload = {
      user_id: userId,
      email: userEmail,
      event_type: 'signup',
      event_timestamp: new Date().toISOString(),
      metadata: {
        full_name: fullName,
        signup_method: metadata.signup_method || 'email',
        signup_timestamp: new Date().toISOString(),
        ...metadata
      }
    }
    
    console.log('📊 [SIGNUP TRACKING] Activity payload:', JSON.stringify(activityPayload, null, 2))
    
    const { data: activityData, error: activityError } = await supabase
      .from('user_activity')
      .insert(activityPayload)
      .select()

    if (activityError) {
      console.error('❌ [SIGNUP TRACKING] Failed to log signup activity:', activityError)
      console.error('❌ [SIGNUP TRACKING] Error details:', JSON.stringify(activityError, null, 2))
      
      // This is important but not critical - user was already created
      console.warn('⚠️ [SIGNUP TRACKING] User created but activity not logged')
      
      // Try one more time with minimal data
      console.log('📊 [SIGNUP TRACKING] Retrying with minimal payload...')
      const { error: retryError } = await supabase
        .from('user_activity')
        .insert({
          user_id: userId,
          email: userEmail,
          event_type: 'signup',
          event_timestamp: new Date().toISOString()
        })
      
      if (retryError) {
        console.error('❌ [SIGNUP TRACKING] Retry also failed:', retryError)
      } else {
        console.log('✅ [SIGNUP TRACKING] Activity logged on retry')
      }
    } else {
      console.log('✅ [SIGNUP TRACKING] Signup activity logged successfully')
      console.log('✅ [SIGNUP TRACKING] Activity data:', activityData)
    }

    console.log('\n========================================')
    console.log('✅ [SIGNUP TRACKING] COMPLETED SUCCESSFULLY')
    console.log('========================================\n')
    
    return { success: true, userData, activityData }
    
  } catch (error) {
    console.error('\n========================================')
    console.error('❌ [SIGNUP TRACKING] CRITICAL ERROR')
    console.error('❌ [SIGNUP TRACKING] Error:', error)
    console.error('❌ [SIGNUP TRACKING] Stack:', error.stack)
    console.error('========================================\n')
    
    // Re-throw to let caller know something went wrong
    throw error
  }
}

// ========================================================================
// RESUME UPLOAD TRACKING
// ========================================================================

export const trackResumeUpload = async (userId, resumeData) => {
  try {
    console.log('📊 [RESUME UPLOAD] Starting tracking for user:', userId)
    
    const userEmail = await getUserEmail(userId)
    
    const uploadData = {
      user_id: userId,
      file_name: resumeData.file_name || resumeData.name || 'unknown.pdf',
      file_url: resumeData.file_url || resumeData.url || '',
      file_size: resumeData.file_size || resumeData.size || 0,
      file_type: resumeData.file_type || resumeData.type || 'pdf',
      extracted_text: resumeData.extracted_text || resumeData.text || '',
      status: 'uploaded',
      uploaded_at: new Date().toISOString(),
      metadata: {
        extraction_method: resumeData.extraction_method || 'auto',
        text_length: (resumeData.extracted_text || resumeData.text || '').length
      }
    }

    // Insert resume record
    const { data: resumeRecord, error: resumeError } = await supabase
      .from('resumes')
      .insert(uploadData)
      .select()
      .single()

    if (resumeError) {
      console.error('❌ [RESUME UPLOAD] Insert failed:', resumeError)
      throw resumeError
    }

    console.log('✅ [RESUME UPLOAD] Resume inserted, ID:', resumeRecord.id)

    // Update user's resume count
    const { data: userData } = await supabase
      .from('users')
      .select('resume_count')
      .eq('id', userId)
      .maybeSingle()

    const currentCount = userData?.resume_count || 0

    await supabase
      .from('users')
      .update({ 
        resume_uploaded_at: new Date().toISOString(),
        resume_count: currentCount + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    // Log activity
    await supabase
      .from('user_activity')
      .insert({
        user_id: userId,
        email: userEmail,
        event_type: 'resume_upload',
        event_timestamp: new Date().toISOString(),
        metadata: {
          file_name: uploadData.file_name,
          resume_id: resumeRecord.id,
          file_size: uploadData.file_size
        }
      })

    console.log('✅ [RESUME UPLOAD] Tracking completed')
    return { 
      success: true, 
      data: resumeRecord, 
      resume_id: resumeRecord.id 
    }
  } catch (error) {
    console.error('❌ [RESUME UPLOAD] Error:', error)
    return { success: false, error: error.message }
  }
}

// ========================================================================
// RESUME ANALYSIS TRACKING
// ========================================================================

export const trackResumeAnalysis = async (userId, resumeId, analysisData) => {
  try {
    console.log('📊 [RESUME ANALYSIS] Starting for resume:', resumeId)
    
    const userEmail = await getUserEmail(userId)
    
    // Format all skills
    const allSkillsFlat = [
      ...(analysisData.all_skills?.technical_skills || []),
      ...(analysisData.all_skills?.soft_skills || []),
      ...(analysisData.all_skills?.tools_technologies || []),
      ...(analysisData.all_skills?.certifications || []),
      ...(analysisData.all_skills?.languages || [])
    ]
    
    // Update resume with analysis
    await supabase
      .from('resumes')
      .update({
        analysis_data: analysisData,
        analyzed_at: new Date().toISOString(),
        ats_score: analysisData.ats_score || null,
        detected_role: analysisData.detected_role || null,
        seniority_level: analysisData.seniority_level || null,
        years_experience: analysisData.years_of_experience || null,
        all_skills: analysisData.all_skills || {},
        total_skills_count: analysisData.total_skills_count || allSkillsFlat.length,
        status: 'analyzed'
      })
      .eq('id', resumeId)

    // Log activity
    await supabase
      .from('user_activity')
      .insert({
        user_id: userId,
        email: userEmail,
        event_type: 'resume_analysis',
        event_timestamp: new Date().toISOString(),
        metadata: {
          resume_id: resumeId,
          ats_score: analysisData.ats_score,
          detected_role: analysisData.detected_role,
          total_skills_found: analysisData.total_skills_count || allSkillsFlat.length,
          score_breakdown: analysisData.score_breakdown
        }
      })

    console.log('✅ [RESUME ANALYSIS] Tracking completed')
    return { success: true }
  } catch (error) {
    console.error('❌ [RESUME ANALYSIS] Error:', error)
    return { success: false, error: error.message }
  }
}

// ========================================================================
// PAYMENT TRACKING
// ========================================================================

export const trackPaymentInitiated = async (userId, email, amount) => {
  try {
    console.log('📊 [PAYMENT] Tracking initiation:', amount)
    
    const userEmail = await getUserEmail(userId, email)
    
    await supabase
      .from('user_activity')
      .insert({
        user_id: userId,
        email: userEmail,
        event_type: 'payment_initiated',
        event_timestamp: new Date().toISOString(),
        metadata: {
          amount: amount,
          currency: 'usd'
        }
      })

    console.log('✅ [PAYMENT] Initiation tracked')
    return { success: true }
  } catch (error) {
    console.error('❌ [PAYMENT] Error:', error)
    return { success: false, error: error.message }
  }
}

export const trackPaymentSuccess = async (userId, sessionId, paymentData) => {
  try {
    console.log('📊 [PAYMENT] Tracking success:', sessionId)
    
    const userEmail = await getUserEmail(userId)
    
    await supabase
      .from('user_activity')
      .insert({
        user_id: userId,
        email: userEmail,
        event_type: 'payment_completed',
        event_timestamp: new Date().toISOString(),
        metadata: {
          session_id: sessionId,
          amount: paymentData.amount,
          currency: paymentData.currency || 'usd',
          payment_status: paymentData.payment_status
        }
      })

    await supabase
      .from('users')
      .update({
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    console.log('✅ [PAYMENT] Success tracked')
    return { success: true }
  } catch (error) {
    console.error('❌ [PAYMENT] Error:', error)
    return { success: false, error: error.message }
  }
}

export const trackPaymentFailure = async (userId, errorMsg) => {
  try {
    const userEmail = await getUserEmail(userId)
    
    await supabase
      .from('user_activity')
      .insert({
        user_id: userId,
        email: userEmail,
        event_type: 'payment_failed',
        event_timestamp: new Date().toISOString(),
        metadata: { error: errorMsg }
      })

    return { success: true }
  } catch (error) {
    console.error('❌ [PAYMENT FAILURE] Error:', error)
    return { success: false, error: error.message }
  }
}

// ========================================================================
// BLAST CAMPAIGN TRACKING
// ========================================================================

export const trackBlastInitiated = async (userId, blastData) => {
  try {
    console.log('📊 [BLAST] Tracking initiation')
    
    const userEmail = await getUserEmail(userId)
    
    const { data: campaign, error: campaignError } = await supabase
      .from('blast_campaigns')
      .insert({
        user_id: userId,
        resume_id: blastData.resume_id,
        industry: blastData.industry,
        recipients_count: blastData.recipients_count,
        status: 'initiated',
        initiated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (campaignError) {
      console.error('❌ [BLAST] Campaign insert failed:', campaignError)
      throw campaignError
    }

    await supabase
      .from('user_activity')
      .insert({
        user_id: userId,
        email: userEmail,
        event_type: 'blast_initiated',
        event_timestamp: new Date().toISOString(),
        metadata: {
          campaign_id: campaign.id,
          industry: blastData.industry,
          recipients_count: blastData.recipients_count
        }
      })

    console.log('✅ [BLAST] Initiation tracked, campaign ID:', campaign.id)
    return { success: true, campaign_id: campaign.id }
  } catch (error) {
    console.error('❌ [BLAST] Error:', error)
    return { success: false, error: error.message }
  }
}

export const trackBlastCompleted = async (userId, campaignId, result) => {
  try {
    console.log('📊 [BLAST] Tracking completion:', campaignId)
    
    const userEmail = await getUserEmail(userId)
    
    await supabase
      .from('blast_campaigns')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result_data: result
      })
      .eq('id', campaignId)

    await supabase
      .from('user_activity')
      .insert({
        user_id: userId,
        email: userEmail,
        event_type: 'blast_completed',
        event_timestamp: new Date().toISOString(),
        metadata: { campaign_id: campaignId }
      })

    console.log('✅ [BLAST] Completion tracked')
    return { success: true }
  } catch (error) {
    console.error('❌ [BLAST] Error:', error)
    return { success: false, error: error.message }
  }
}

export const trackBlastFailure = async (userId, campaignId, errorMessage) => {
  try {
    console.log('📊 [BLAST] Tracking failure:', campaignId)
    
    const userEmail = await getUserEmail(userId)
    
    await supabase
      .from('blast_campaigns')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: errorMessage
      })
      .eq('id', campaignId)

    await supabase
      .from('user_activity')
      .insert({
        user_id: userId,
        email: userEmail,
        event_type: 'blast_failed',
        event_timestamp: new Date().toISOString(),
        metadata: { 
          campaign_id: campaignId,
          error: errorMessage 
        }
      })

    console.log('✅ [BLAST] Failure tracked')
    return { success: true }
  } catch (error) {
    console.error('❌ [BLAST] Error:', error)
    return { success: false, error: error.message }
  }
}

// ========================================================================
// ANALYTICS & REPORTING
// ========================================================================

export const getUserActivitySummary = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_activity')
      .select('event_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error

    const summary = {}
    data.forEach(activity => {
      summary[activity.event_type] = (summary[activity.event_type] || 0) + 1
    })

    return { success: true, data: summary }
  } catch (error) {
    console.error('❌ Error fetching activity summary:', error)
    return { success: false, error: error.message }
  }
}

export const getRecentActivities = async (userId, limit = 20) => {
  try {
    const { data, error } = await supabase
      .from('user_activity')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error) {
    console.error('❌ Error fetching recent activities:', error)
    return { success: false, error: error.message, data: [] }
  }
}

// Export all functions
export default {
  trackUserLogin,
  trackUserSignup,
  trackResumeUpload,
  trackResumeAnalysis,
  trackPaymentInitiated,
  trackPaymentSuccess,
  trackPaymentFailure,
  trackBlastInitiated,
  trackBlastCompleted,
  trackBlastFailure,
  getUserActivitySummary,
  getRecentActivities
}