// src/services/activityTrackingService.js
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

console.log('📊 Activity Tracking Service Loaded (Backend-Driven)')

// ========================================================================
// INTERNAL HELPER: Persistent Guest ID & Backend Logging
// ========================================================================

/**
 * Generates or retrieves a unique, persistent ID for non-registered users
 * stored in the browser's localStorage.
 */
export const getGuestId = () => {
  let guestId = localStorage.getItem('rb_guest_tracker_id');
  if (!guestId) {
    // Unique format: guest_timestamp_randomString
    guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('rb_guest_tracker_id', guestId);
  }
  return guestId;
};

/**
 * Sends activity data to the Python backend to bypass RLS policies
 */
const logToBackend = async (userId, email, eventType, metadata) => {
  try {
    // ✅ FIX: If no userId is provided, use the unique guest ID
    const effectiveUserId = userId || getGuestId();
    
    // ✅ FIX: Generate a tracking email for guests if email is missing or generic
    const effectiveEmail = (email && email !== 'unknown@email.com') ? email : 
      (effectiveUserId.startsWith('guest') ? `${effectiveUserId}@resumeblast.ai` : 'unknown@email.com');

    const payload = {
      user_id: effectiveUserId,
      email: effectiveEmail,
      event_type: eventType,
      metadata: {
        ...metadata,
        is_guest: effectiveUserId.startsWith('guest')
      }
    }

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

const getUserEmail = async (userId, fallbackEmail = null) => {
  if (fallbackEmail && fallbackEmail.includes('@')) return fallbackEmail.trim().toLowerCase()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email) return user.email
  return 'unknown@email.com'
}

// ========================================================================
// TRACKING FUNCTIONS
// ========================================================================

export const trackUserLogin = async (userId, email, metadata = {}) => {
  const userEmail = await getUserEmail(userId, email)
  logToBackend(userId, userEmail, 'login', { ...metadata, login_timestamp: new Date().toISOString() })
  try {
    const { data: user } = await supabase.from('users').select('login_count').eq('id', userId).single()
    await supabase.from('users').update({
        last_login_at: new Date().toISOString(),
        login_count: (user?.login_count || 0) + 1,
        updated_at: new Date().toISOString()
    }).eq('id', userId)
  } catch (e) { console.warn('User table update warning:', e) }
  return { success: true }
}

export const trackUserSignup = async (userId, email, metadata = {}) => {
  const userEmail = await getUserEmail(userId, email)
  const fullName = metadata.full_name || userEmail.split('@')[0]
  const { data, error } = await supabase.from('users').upsert({
    id: userId, email: userEmail, full_name: fullName,
    created_at: new Date().toISOString(), last_login_at: new Date().toISOString(),
    login_count: 1, account_status: 'active'
  }, { onConflict: 'id' })
  if (error) console.error('❌ Error updating users table:', error)
  await logToBackend(userId, userEmail, 'signup', { ...metadata, signup_method: 'email', full_name: fullName })
  return { success: true }
}

export const trackResumeUpload = async (userId, resumeData) => {
  const userEmail = await getUserEmail(userId)
  const effectiveUserId = userId || getGuestId();
  let resumeId = `temp_${Date.now()}`;

  // ✅ Only attempt Supabase Insert if the user is registered (UUID)
  // Non-registered guest data is tracked via logToBackend only to prevent RLS/foreign key errors
  if (userId && !userId.startsWith('guest')) {
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
      .select().single()

    if (error) console.error('❌ Error inserting resume:', error)
    else resumeId = resumeRecord.id;
  }

  // ✅ Log to Backend (This handles the storage for Guests)
  logToBackend(effectiveUserId, userEmail, 'resume_upload', {
    resume_id: resumeId,
    file_name: resumeData.file_name,
    file_size: resumeData.file_size
  })
  return { success: true, resume_id: resumeId }
}

export const trackResumeAnalysis = async (userId, resumeId, analysisData) => {
  const userEmail = await getUserEmail(userId)
  if (userId && !userId.startsWith('guest')) {
      await supabase.from('resumes').update({
        analysis_data: analysisData, analyzed_at: new Date().toISOString(),
        ats_score: analysisData.ats_score, status: 'analyzed'
      }).eq('id', resumeId)
  }
  logToBackend(userId, userEmail, 'resume_analysis', { resume_id: resumeId, ats_score: analysisData.ats_score })
  return { success: true }
}

export const trackPaymentSuccess = async (userId, sessionId, paymentData) => {
  const userEmail = await getUserEmail(userId)
  await logToBackend(userId, userEmail, 'payment_completed', { 
    session_id: sessionId, amount: paymentData.amount, currency: paymentData.currency 
  })
  return { success: true }
}

export const trackBlastInitiated = async (userId, blastData) => {
  const userEmail = await getUserEmail(userId)
  let campaignId = null;
  if (userId && !userId.startsWith('guest')) {
      const { data: campaign, error } = await supabase.from('blast_campaigns').insert({
        user_id: userId, resume_id: blastData.resume_id, industry: blastData.industry,
        status: 'initiated', initiated_at: new Date().toISOString()
      }).select().single()
      if (error) console.error('Error creating campaign:', error)
      campaignId = campaign?.id;
  }
  logToBackend(userId, userEmail, 'blast_initiated', {
    campaign_id: campaignId, industry: blastData.industry, recipients_count: blastData.recipients_count
  })
  return { success: true, campaign_id: campaignId }
}

export const trackPaymentInitiated = async (uid, email, amt) => logToBackend(uid, email, 'payment_initiated', { amount: amt })
export const trackPaymentFailure = async (uid, err) => logToBackend(uid, null, 'payment_failed', { error: err })
export const trackBlastCompleted = async (uid, cid) => logToBackend(uid, null, 'blast_completed', { campaign_id: cid })
export const trackBlastFailure = async (uid, cid, err) => logToBackend(uid, null, 'blast_failed', { campaign_id: cid, error: err })

export const getUserActivitySummary = async (userId) => {
  try {
    const { data, error } = await supabase.from('user_activity').select('event_type, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    const summary = {};
    data.forEach(activity => { summary[activity.event_type] = (summary[activity.event_type] || 0) + 1 });
    return { success: true, data: summary }
  } catch (error) {
    console.error('❌ Error fetching activity summary:', error)
    return { success: false, error: error.message }
  }
}

export const getRecentActivities = async (userId, limit = 20) => {
  try {
    const { data, error } = await supabase.from('user_activity').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error) {
    console.error('❌ Error fetching recent activities:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export default {
  getGuestId, 
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