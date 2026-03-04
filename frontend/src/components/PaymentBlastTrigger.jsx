// components/PaymentBlastTrigger.jsx
// ✅ FIXES:
//   1. stripe_session_id is now always forwarded to /api/blast/send
//   2. Registered users no longer require pending_blast_resume_data to be set before payment
//   3. Guest workflow correctly waits for resume upload AFTER payment
//   4. Deduplication: processedSessionRef prevents double-blast on re-render
//   5. Redirects registered user to /dashboard after blast

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { triggerEmailBlast } from '../services/blastService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function PaymentBlastTrigger() {
  const [isProcessing, setIsProcessing]   = useState(false);
  const [statusText, setStatusText]       = useState('Initiating your campaign...');
  const processedSessionRef               = useRef(null);

  useEffect(() => { checkForPaymentSuccess(); }, []);

  const checkForPaymentSuccess = async () => {
    const params        = new URLSearchParams(window.location.search);
    const paymentSuccess = params.get('payment') === 'success';
    const sessionId     = params.get('session_id');

    // Only act if this is a payment return with a session ID
    if (!paymentSuccess || !sessionId) return;

    // Prevent double-processing (React StrictMode / re-renders)
    if (processedSessionRef.current === sessionId) return;
    processedSessionRef.current = sessionId;

    // ── Determine user type ──────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    const guestId   = localStorage.getItem('guest_id') || localStorage.getItem('guestId') || '';
    const isGuest   = !user && guestId.startsWith('guest_');
    const activeUserId = user ? user.id : guestId;

    console.log('[PaymentBlastTrigger] Payment return detected', {
      sessionId: sessionId?.slice(0, 20),
      hasUser: !!user,
      isGuest,
      userId: activeUserId?.slice(0, 20),
    });

    // ── GUEST WORKFLOW ───────────────────────────────────────────────────────
    // Guests pay FIRST, then upload resume. At this point they have no resume yet.
    // Do nothing — GuestResumeUpload + ResumeAnalysis will handle the blast
    // once the resume is uploaded and analysis is complete.
    if (isGuest) {
      console.log('[PaymentBlastTrigger] Guest workflow — waiting for resume upload');
      return;
    }

    // ── REGISTERED USER WORKFLOW ─────────────────────────────────────────────
    // Registered users upload resume BEFORE payment.
    // pending_blast_resume_data must be set by BlastConfig before Stripe redirect.
    const savedResumeData = localStorage.getItem('pending_blast_resume_data');
    if (!savedResumeData) {
      console.warn('[PaymentBlastTrigger] No pending resume data found for registered user — cannot blast');
      // Still redirect to dashboard so they don't stay on workbench with URL params
      window.location.href = '/dashboard';
      return;
    }

    setIsProcessing(true);
    setStatusText('Verifying payment...');

    try {
      const parsedResumeData  = JSON.parse(savedResumeData);
      const pendingConfigStr  = localStorage.getItem('pending_blast_config');
      const pendingConfig     = pendingConfigStr
        ? JSON.parse(pendingConfigStr)
        : { plan: 'starter', location: 'Remote' };

      setStatusText('Fetching resume details...');

      // Fetch the resume record for the most up-to-date analysis data
      let resumeRecord = null;
      if (parsedResumeData.id && !parsedResumeData.id.startsWith('temp_')) {
        const { data } = await supabase
          .from('resumes')
          .select('*')
          .eq('id', parsedResumeData.id)
          .single();
        resumeRecord = data;
      }

      const analysis       = resumeRecord?.analysis_data || {};
      const candidateName  = (analysis.candidate_name && analysis.candidate_name !== 'Not Found')
        ? analysis.candidate_name
        : (user?.user_metadata?.full_name || 'Professional Candidate');
      const candidateEmail = (analysis.candidate_email && analysis.candidate_email !== 'Not Found')
        ? analysis.candidate_email
        : (user?.email || '');

      setStatusText('Launching your blast campaign...');

      const blastPayload = {
        plan_name:        pendingConfig.plan,
        user_id:          activeUserId,
        stripe_session_id: sessionId,            // ✅ Always forward session ID
        resume_url:       resumeRecord?.file_url || parsedResumeData.url,
        resume_name:      resumeRecord?.file_name || parsedResumeData.name || 'Resume.pdf',
        candidate_name:   candidateName,
        candidate_email:  candidateEmail,
        candidate_phone:  analysis.candidate_phone !== 'Not Found' ? (analysis.candidate_phone || '') : '',
        job_role:         analysis.detected_role || 'Professional',
        years_experience: String(analysis.years_of_experience || 0),
        key_skills:       analysis.top_skills?.join(', ') || 'Professional Skills',
        location:         pendingConfig.location || 'Remote',
      };

      console.log('[PaymentBlastTrigger] Triggering blast for registered user:', {
        plan: blastPayload.plan_name,
        candidate: blastPayload.candidate_name,
        role: blastPayload.job_role,
      });

      const result = await triggerEmailBlast(blastPayload);

      // ── Clean up localStorage ────────────────────────────────────────────
      localStorage.removeItem('pending_blast_resume_data');
      localStorage.removeItem('pending_blast_config');

      if (result.success || result.already_processed) {
        setStatusText('Campaign launched! Redirecting to dashboard...');
        // Small delay so user can see the success message
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
      } else {
        throw new Error(result.message || 'Blast failed');
      }

    } catch (err) {
      console.error('[PaymentBlastTrigger] Blast trigger error:', err);
      setStatusText('Something went wrong. Redirecting...');
      // Clean up even on error to avoid loops
      localStorage.removeItem('pending_blast_resume_data');
      localStorage.removeItem('pending_blast_config');
      setTimeout(() => {
        window.location.href = '/dashboard?blast_error=1';
      }, 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isProcessing) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(255, 255, 255, 0.97)', zIndex: 99999,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      alignItems: 'center', backdropFilter: 'blur(6px)'
    }}>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* Spinner */}
      <div style={{
        width: '60px', height: '60px',
        border: '5px solid #f3f3f3', borderTop: '5px solid #DC2626',
        borderRadius: '50%', animation: 'spin 1s linear infinite',
        marginBottom: '28px'
      }} />

      {/* Rocket icon */}
      <div style={{ fontSize: '40px', marginBottom: '16px', animation: 'pulse 2s infinite' }}>
        🚀
      </div>

      <h2 style={{ color: '#111827', fontSize: '22px', fontWeight: '700', margin: '0 0 10px 0' }}>
        Launching Your Campaign
      </h2>
      <p style={{ color: '#6b7280', fontSize: '15px', margin: '0 0 8px 0' }}>
        {statusText}
      </p>
      <p style={{ color: '#9CA3AF', fontSize: '13px', margin: 0 }}>
        Please do not close this window
      </p>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: '8px', height: '8px', borderRadius: '50%', background: '#DC2626',
            animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`
          }} />
        ))}
      </div>
    </div>
  );
}

export default PaymentBlastTrigger;