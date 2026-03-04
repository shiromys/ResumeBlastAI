// /frontend/src/services/blastService.js
// ✅ FIXES:
//   1. stripe_session_id always forwarded to backend
//   2. Cleaner validation — only requires plan_name + resume_url
//   3. Returns already_processed flag from backend

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Trigger email blast via backend API.
 * Backend handles ALL recruiter fetching and drip campaign creation.
 */
export const triggerEmailBlast = async (blastData) => {
  try {
    console.log('[blastService] triggerEmailBlast called');

    // Validate required fields
    if (!blastData.plan_name) {
      throw new Error('Plan name is required');
    }
    if (!blastData.resume_url) {
      throw new Error('Resume URL is required');
    }

    const payload = {
      // ── Required ──────────────────────────────────
      plan_name:         blastData.plan_name,
      resume_url:        blastData.resume_url,

      // ── Session / user identity ────────────────────
      user_id:           blastData.user_id || '',
      stripe_session_id: blastData.stripe_session_id || '',  // ✅ always forwarded

      // ── Candidate info ─────────────────────────────
      candidate_name:    blastData.candidate_name  || 'Professional Candidate',
      candidate_email:   blastData.candidate_email || '',
      candidate_phone:   blastData.candidate_phone || '',
      job_role:          blastData.job_role         || 'Professional',
      years_experience:  String(blastData.years_experience || '0'),
      key_skills:        blastData.key_skills        || 'Professional Skills',
      education_level:   blastData.education_level   || 'Not Specified',
      location:          blastData.location          || 'Remote',
      linkedin_url:      blastData.linkedin_url      || '',

      // ── Resume file info ───────────────────────────
      resume_name:       blastData.resume_name || 'Resume.pdf',
      campaign_id:       blastData.campaign_id || '',
    };

    console.log('[blastService] Sending to /api/blast/send', {
      plan: payload.plan_name,
      candidate: payload.candidate_name,
      session: payload.stripe_session_id?.slice(0, 20),
    });

    const response = await fetch(`${API_URL}/api/blast/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Backend API failed (${response.status})`);
    }

    console.log('[blastService] Blast response:', result);

    return {
      success:           result.success,
      message:           result.message || 'Email blast initiated successfully',
      total_recipients:  result.total_recipients,
      successful_sends:  result.successful_sends,
      failed_sends:      result.failed_sends,
      success_rate:      result.success_rate,
      drip_campaign_id:  result.drip_campaign_id,
      already_processed: result.already_processed || false,
    };

  } catch (error) {
    console.error('[blastService] triggerEmailBlast error:', error);
    throw error;
  }
};

/**
 * Trigger Freemium Blast — registered users only, 11 recruiters, no drip.
 */
export const triggerFreemiumBlast = async (userId, resumeUrl, candidateData) => {
  try {
    console.log('[blastService] triggerFreemiumBlast', { userId });

    const response = await fetch(`${API_URL}/api/blast/freemium`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id:         userId,
        resume_url:      resumeUrl,
        candidate_name:  candidateData.candidate_name,
        candidate_email: candidateData.candidate_email,
        candidate_phone: candidateData.candidate_phone || '',
        job_role:        candidateData.job_role,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Freemium blast failed');
    }

    return result;

  } catch (error) {
    console.error('[blastService] triggerFreemiumBlast error:', error);
    throw error;
  }
};

/**
 * Get real-time status of a specific blast campaign.
 */
export const getBlastStatus = async (campaignId) => {
  try {
    const response = await fetch(`${API_URL}/api/blast/status/${campaignId}`);
    return await response.json();
  } catch (error) {
    console.error('[blastService] getBlastStatus error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Test backend connection.
 */
export const testBackendConnection = async () => {
  try {
    const response = await fetch(`${API_URL}/api/blast/test`);
    const result   = await response.json();
    return {
      success:          response.ok,
      message:          result.message,
      brevo_configured: result.brevo_configured,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Send a single test email (for debugging).
 */
export const sendTestEmail = async (testEmail, resumeUrl) => {
  try {
    const response = await fetch(`${API_URL}/api/blast/test-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_email: testEmail, resume_url: resumeUrl }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Test email failed');
    return result;
  } catch (error) {
    console.error('[blastService] sendTestEmail error:', error);
    throw error;
  }
};