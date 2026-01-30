// src/services/activityTrackingService.js
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

console.log('📊 Activity Tracking Service Loaded (Backend-Driven)')

// ========================================================================
// INTERNAL HELPER: Send Log to Backend API
// ========================================================================
/**
 * Sends activity data to the Python backend to bypass RLS policies
 */
const logToBackend = async (userId, email, eventType, metadata) => {
  try {
    const payload = {
      user_id: userId,
      email: email,
      event_type: eventType,
      metadata: metadata
    }

    // Use fetch with keepalive to ensure request completes even if page unloads
    // We don't await this because we don't want to block the UI for logging
    fetch(`${API_URL}/api/user-activity/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(err => console.error(`❌ Background log failed for ${eventType}:`, err))

    return { success: true }
  } catch (error) {
    console.error(`❌ Failed to send ${eventType} to backend:`, error)
    return { success: false, error: error.message }
  }
}

// Helper to get email safely
const getUserEmail = async (userId, fallbackEmail = null) => {
  if (fallbackEmail && fallbackEmail.includes('@')) return fallbackEmail.trim().toLowerCase()
  
  // Try getting user from session first
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email) return user.email
  
  return 'unknown@email.com'
}

// ========================================================================
// TRACKING FUNCTIONS
// ========================================================================

export const trackUserLogin = async (userId, email, metadata = {}) => {
  const userEmail = await getUserEmail(userId, email)
  
  // 1. Log to Backend (Bypasses RLS)
  logToBackend(userId, userEmail, 'login', { 
    ...metadata, 
    login_timestamp: new Date().toISOString() 
  })

  // 2. Update Users Table (Keep existing logic as it works for you)
  try {
    const { data: user } = await supabase.from('users').select('login_count').eq('id', userId).single()
    
    await supabase.from('users').update({
        last_login_at: new Date().toISOString(),
        login_count: (user?.login_count || 0) + 1,
        updated_at: new Date().toISOString()
    }).eq('id', userId)
  } catch (e) { 
    console.warn('User table update warning:', e) 
  }

  return { success: true }
}

export const trackUserSignup = async (userId, email, metadata = {}) => {
  const userEmail = await getUserEmail(userId, email)
  const fullName = metadata.full_name || userEmail.split('@')[0]

  // 1. Create User Record (Keep existing logic as it works for you)
  const { data, error } = await supabase.from('users').upsert({
    id: userId,
    email: userEmail,
    full_name: fullName,
    created_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
    login_count: 1,
    account_status: 'active'
  }, { onConflict: 'id' })

  if (error) {
    console.error('❌ Error updating users table:', error)
  }

  // 2. Log Signup to Backend (Bypasses RLS)
  await logToBackend(userId, userEmail, 'signup', { 
    ...metadata, 
    signup_method: 'email',
    full_name: fullName
  })

  return { success: true }
}

export const trackResumeUpload = async (userId, resumeData) => {
  const userEmail = await getUserEmail(userId)
  
  // Insert Resume (Keep existing logic)
  const { data: resumeRecord, error } = await supabase
    .from('resumes')
    .insert({
      user_id: userId,
      file_name: resumeData.file_name,
      file_url: resumeData.file_url,
      extracted_text: resumeData.extracted_text,
      status: 'uploaded',
      uploaded_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    console.error('❌ Error inserting resume:', error)
    return { success: false, error: error.message }
  }

  // Log to Backend
  logToBackend(userId, userEmail, 'resume_upload', {
    resume_id: resumeRecord.id,
    file_name: resumeData.file_name,
    file_size: resumeData.file_size
  })

  return { success: true, resume_id: resumeRecord.id }
}

export const trackResumeAnalysis = async (userId, resumeId, analysisData) => {
  const userEmail = await getUserEmail(userId)

  // Update Resume (Keep existing logic)
  await supabase.from('resumes').update({
    analysis_data: analysisData,
    analyzed_at: new Date().toISOString(),
    ats_score: analysisData.ats_score,
    status: 'analyzed'
  }).eq('id', resumeId)

  // Log to Backend
  logToBackend(userId, userEmail, 'resume_analysis', {
    resume_id: resumeId,
    ats_score: analysisData.ats_score
  })

  return { success: true }
}

export const trackPaymentSuccess = async (userId, sessionId, paymentData) => {
  const userEmail = await getUserEmail(userId)
  
  // Log directly to backend
  await logToBackend(userId, userEmail, 'payment_completed', {
    session_id: sessionId,
    amount: paymentData.amount,
    currency: paymentData.currency
  })
  
  return { success: true }
}

export const trackBlastInitiated = async (userId, blastData) => {
  const userEmail = await getUserEmail(userId)
  
  // Create Campaign (Keep existing logic)
  const { data: campaign, error } = await supabase.from('blast_campaigns').insert({
    user_id: userId,
    resume_id: blastData.resume_id,
    industry: blastData.industry,
    status: 'initiated',
    initiated_at: new Date().toISOString()
  }).select().single()

  if (error) console.error('Error creating campaign:', error)

  // Log to Backend
  logToBackend(userId, userEmail, 'blast_initiated', {
    campaign_id: campaign?.id,
    industry: blastData.industry,
    recipients_count: blastData.recipients_count
  })

  return { success: true, campaign_id: campaign?.id }
}

// Wrapper functions for other events
export const trackPaymentInitiated = async (uid, email, amt) => 
  logToBackend(uid, email, 'payment_initiated', { amount: amt })

export const trackPaymentFailure = async (uid, err) => 
  logToBackend(uid, null, 'payment_failed', { error: err })

export const trackBlastCompleted = async (uid, cid) => 
  logToBackend(uid, null, 'blast_completed', { campaign_id: cid })

export const trackBlastFailure = async (uid, cid, err) => 
  logToBackend(uid, null, 'blast_failed', { campaign_id: cid, error: err })

export const getUserActivitySummary = async (userId) => {
  // Reading is usually fine with RLS if user owns data, 
  // but if this fails, you might need a backend endpoint for reading too.
  // For now, we assume reading your own data is allowed by Supabase RLS.
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