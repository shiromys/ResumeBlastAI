// src/services/guestTrackingService.js
// Handles all data persistence for non-registered (guest) users.
// IP address is captured server-side from request headers — NOT sent from frontend.
// Zero impact on registered user flow.

import { getGuestId } from './activityTrackingService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Internal POST helper — fire-and-forget.
 * keepalive: true ensures the request completes even if page navigates away.
 */
const guestPost = async (path, body) => {
  try {
    const res = await fetch(`${API_URL}/api/guest${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    });
    const result = await res.json();
    if (!result.success) {
      console.warn(`⚠️ GuestTracking [${path}] failed:`, result.error);
    }
    return result;
  } catch (err) {
    // Non-blocking — never throws, just logs
    console.error(`❌ GuestTracking [${path}] error:`, err);
    return { success: false };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED FUNCTIONS
// IP address is captured AUTOMATICALLY by the backend from request headers.
// Frontend never needs to read or send the IP — backend handles it entirely.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WHEN: Guest selects a pricing plan (before Stripe payment redirect)
 * WHAT: Creates guest_users row in DB. IP captured by backend automatically.
 */
export const initGuestSession = () => {
  const guestId = getGuestId();
  console.log('🆔 Guest session init:', guestId);
  // IP not sent from frontend — backend reads it from request.headers
  return guestPost('/init', { guest_id: guestId });
};

/**
 * WHEN: After resume upload + text extraction completes successfully
 * WHAT: Saves file metadata + extracted text to guest_users row.
 *       Also appends to resume_history array so repeat visits are preserved.
 *
 * @param {object} resumeData - { file_name, file_url, file_size, file_type, extracted_text }
 */
export const saveGuestResume = (resumeData) => {
  const guestId = getGuestId();
  console.log('📄 Saving guest resume:', resumeData.file_name);
  return guestPost('/resume', { guest_id: guestId, resume_data: resumeData });
};

/**
 * WHEN: After AI analysis result received and displayed to user
 * WHAT: Saves full analysis JSON + extracts key fields as separate columns:
 *       ats_score, detected_role, seniority_level, years_of_experience,
 *       recommended_industry, education_summary, candidate_name,
 *       candidate_email, candidate_phone, location, linkedin_url,
 *       top_skills, total_skills_count
 *
 * @param {object} analysisData - Full analysis object from /api/analyze
 */
export const saveGuestAnalysis = (analysisData) => {
  const guestId = getGuestId();
  console.log('🤖 Saving guest analysis | ATS Score:', analysisData.ats_score);
  return guestPost('/analysis', { guest_id: guestId, analysis_data: analysisData });
};

/**
 * WHEN: When guest triggers a blast (after payment verified)
 * WHAT: Records blast initiation with plan, industry, recipient count.
 *
 * @param {object} blastData - { industry, recipients_count, plan_name }
 */
export const saveGuestBlastStart = (blastData) => {
  const guestId = getGuestId();
  console.log('🚀 Saving guest blast start');
  return guestPost('/blast/start', { guest_id: guestId, blast_data: blastData });
};

/**
 * WHEN: After blast API returns final results
 * WHAT: Records completion with success_rate, total sent, failed count.
 *
 * @param {object} results - { success_rate, total_recipients, successful_sends, failed_sends }
 */
export const saveGuestBlastComplete = (results) => {
  const guestId = getGuestId();
  console.log('✅ Saving guest blast completion');
  return guestPost('/blast/complete', { guest_id: guestId, results });
};