// /frontend/src/services/blastService.js
// ✅ FIXED: Works with backend-driven recruiter selection

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

console.log('🔧 blastService.js loaded - Backend Integration (Backend fetches recruiters)');

/**
 * ✅ FIXED: Trigger email blast via backend API
 * Backend handles ALL recruiter fetching and selection based on plan
 */
export const triggerEmailBlast = async (blastData) => {
  try {
    console.log('');
    console.log('=== TRIGGER EMAIL BLAST STARTED ===');
    
    // ✅ VALIDATION: Check required fields (NOT recipients anymore!)
    if (!blastData.plan_name) {
      throw new Error('❌ Plan name is required');
    }
    
    if (!blastData.resume_url) {
      throw new Error('❌ Resume URL is required');
    }

    console.log(`✅ Validation passed`);
    console.log(`   Plan: ${blastData.plan_name}`);
    console.log(`   Campaign ID: ${blastData.campaign_id || 'Not provided'}`);

    // ✅ PREPARE PAYLOAD: Backend will fetch recruiters
    const payload = {
      // Plan information (backend uses this to fetch recruiters)
      plan_name: blastData.plan_name,
      campaign_id: blastData.campaign_id,
      
      // Candidate information
      candidate_name: blastData.candidate_name || 'Professional Candidate',
      candidate_email: blastData.candidate_email || 'candidate@example.com',
      candidate_phone: blastData.candidate_phone || '',
      job_role: blastData.job_role || 'Professional',
      years_experience: String(blastData.years_experience || '0'),
      key_skills: blastData.key_skills || 'Professional Skills',
      education_level: blastData.education_level || 'Not Specified',
      location: blastData.location || 'Remote',
      linkedin_url: blastData.linkedin_url || '',
      
      // Resume File Info
      resume_url: blastData.resume_url,
      resume_name: blastData.resume_name || 'Resume.pdf'
    };

    console.log('📦 Payload prepared:');
    console.log('  - Candidate:', payload.candidate_name);
    console.log('  - Plan:', payload.plan_name);
    console.log('  - Resume:', payload.resume_name);
    console.log('  - Campaign ID:', payload.campaign_id);

    // ✅ SEND REQUEST TO BACKEND
    console.log('📡 Sending POST request to backend API...');
    console.log('   URL:', `${API_URL}/api/blast/send`);

    const response = await fetch(`${API_URL}/api/blast/send`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Backend API failed (${response.status})`);
    }

    console.log('✅ Backend response:', result);
    
    return {
      success: true,
      message: result.message || 'Email blast initiated successfully',
      total_recipients: result.total_recipients,
      successful_sends: result.successful_sends,
      failed_sends: result.failed_sends,
      success_rate: result.success_rate,
      detailed_results: result.detailed_results
    };

  } catch (error) {
    console.error('=== ❌ ERROR IN triggerEmailBlast ===', error);
    throw error;
  }
};

/**
 * ✅ Trigger Freemium Blast (Resend.com)
 * Sends to the specific 11 recruiters for free users.
 */
export const triggerFreemiumBlast = async (userId, resumeUrl, candidateData) => {
  try {
    console.log('🎁 Triggering Freemium Blast for user:', userId);
    console.log('📡 Sending POST request to:', `${API_URL}/api/blast/freemium`);
    
    const response = await fetch(`${API_URL}/api/blast/freemium`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        resume_url: resumeUrl,
        // Pass specific candidate details needed for the email
        candidate_name: candidateData.candidate_name,
        candidate_email: candidateData.candidate_email,
        candidate_phone: candidateData.candidate_phone,
        job_role: candidateData.job_role
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Freemium API Error:', result);
      throw new Error(result.error || 'Freemium blast failed');
    }
    
    console.log('✅ Freemium blast successful:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Freemium Service Error:', error);
    throw error;
  }
};

/**
 * Test backend blast connection
 */
export const testBackendConnection = async () => {
  try {
    console.log('🧪 Testing backend blast API connection...');
    
    const response = await fetch(`${API_URL}/api/blast/test`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Backend connection test successful:', result);
      return {
        success: true,
        message: result.message,
        brevo_configured: result.brevo_configured,
        resend_configured: result.resend_configured,
        integration_type: result.integration_type
      };
    } else {
      console.error('❌ Backend connection test failed:', result);
      return {
        success: false,
        error: result.error || 'Connection test failed'
      };
    }
    
  } catch (error) {
    console.error('❌ Backend connection test error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Send test email (for debugging)
 */
export const sendTestEmail = async (testEmail, resumeUrl) => {
  try {
    console.log(`🧪 Sending test email to: ${testEmail}`);
    
    const response = await fetch(`${API_URL}/api/blast/test-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test_email: testEmail,
        resume_url: resumeUrl
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Test email sent successfully:', result);
      return result;
    } else {
      console.error('❌ Test email failed:', result);
      throw new Error(result.error || 'Test email failed');
    }
    
  } catch (error) {
    console.error('❌ Test email error:', error);
    throw error;
  }
};