import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import BlastConfig from './BlastConfig';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * PaymentBlastTrigger
 * Works for BOTH registered and guest users after Stripe payment success.
 * Freemium users do NOT go through here.
 */
function PaymentBlastTrigger() {
  const [showBlast, setShowBlast]   = useState(false);
  const [resumeData, setResumeData] = useState(null);
  const [userData, setUserData]     = useState(null);
  const [isGuestUser, setIsGuestUser] = useState(false);
  const processedSessionRef = useRef(null);

  useEffect(() => { checkForPaymentSuccess(); }, []);

  const checkForPaymentSuccess = async () => {
    try {
      const params        = new URLSearchParams(window.location.search);
      const paymentSuccess = params.get('payment') === 'success';
      const sessionId      = params.get('session_id');
      const guestIdFromUrl = params.get('guest_id');

      if (!paymentSuccess || !sessionId) return;
      if (processedSessionRef.current === sessionId) return;
      processedSessionRef.current = sessionId;

      console.log('=== PAYMENT BLAST TRIGGER ===', sessionId);

      // Resolve identity
      const { data: { user } } = await supabase.auth.getUser();
      const guestId = guestIdFromUrl
        || localStorage.getItem('guest_id')
        || localStorage.getItem('guestId')
        || '';
      const isGuest = !user && guestId.startsWith('guest_');

      if (!user && !isGuest) {
        console.error('No user or guest session found');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      const activeUserId = user ? user.id : guestId;
      const activeEmail  = user
        ? user.email
        : (localStorage.getItem('guest_email') || guestId);

      console.log('User type:', isGuest ? 'GUEST' : 'REGISTERED', '| ID:', activeUserId);
      setIsGuestUser(isGuest);

      // Restore guest_id if it came from URL (Stripe may have cleared localStorage)
      if (isGuest && guestIdFromUrl) {
        localStorage.setItem('guest_id', guestIdFromUrl);
      }

      // Get resume data from localStorage
      const savedResumeData = localStorage.getItem('pending_blast_resume_data');
      if (!savedResumeData) {
        console.error('No resume data in localStorage');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      const parsedResumeData = JSON.parse(savedResumeData);

      // Fetch full resume from Supabase
      const { data: resumeRecord, error: resumeError } = await supabase
        .from('resumes')
        .select('*')
        .eq('id', parsedResumeData.id)
        .single();

      if (resumeError || !resumeRecord) {
        alert('Resume not found. Please upload again.');
        localStorage.removeItem('pending_blast_resume_data');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      // Resolve candidate details
      const analysis = resumeRecord.analysis_data || {};

      let candidateName = analysis.candidate_name;
      if (!candidateName || ['Not Found','Candidate',''].includes(candidateName))
        candidateName = resumeRecord.candidate_name;
      if (!candidateName || ['Not Found','Candidate',''].includes(candidateName))
        candidateName = resumeRecord.file_name?.split('.')[0].replace(/_/g,' ') || '';
      if (!candidateName || candidateName.trim() === '') {
        candidateName = user
          ? (user.user_metadata?.full_name || user.email.split('@')[0])
          : (activeEmail.includes('@') ? activeEmail.split('@')[0] : 'Candidate');
      }

      let candidateEmail = analysis.candidate_email;
      if (!candidateEmail || candidateEmail === 'Not Found')
        candidateEmail = resumeRecord.candidate_email;
      if (!candidateEmail || candidateEmail === 'Not Found')
        candidateEmail = activeEmail;

      const candidatePhone = analysis.candidate_phone !== 'Not Found'
        ? analysis.candidate_phone
        : (resumeRecord.candidate_phone || '');

      const candidateRole = analysis.detected_role
        || resumeRecord.detected_role
        || 'Professional';

      setResumeData({
        id:  resumeRecord.id,
        url: resumeRecord.file_url || parsedResumeData.url,
        text: resumeRecord.extracted_text
      });

      setUserData({
        id:               activeUserId,
        name:             candidateName,
        email:            candidateEmail,
        phone:            candidatePhone,
        targetRole:       candidateRole,
        skills: Array.isArray(analysis.top_skills)
          ? analysis.top_skills.join(', ')
          : 'Professional Skills',
        years_experience: analysis.seniority_level || analysis.total_experience || 'Mid-Level'
      });

      setShowBlast(true);

    } catch (err) {
      console.error('Payment blast trigger error:', err);
      alert('Error preparing blast. Please contact support.');
      localStorage.removeItem('pending_blast_resume_data');
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  if (!showBlast || !resumeData || !userData) return null;

  return (
    <BlastConfig
      resumeId={resumeData.id}
      resumeUrl={resumeData.url}
      paymentVerified={true}
      isGuest={isGuestUser}
      userData={userData}
      onBlastComplete={(result) => {
        setShowBlast(false);
        localStorage.removeItem('pending_blast_resume_data');
        localStorage.removeItem('pending_blast_config');
        if (result?.drip_mode) {
          alert(
            'Day 1 Blast Sent!\n\n' +
            `Resume sent to ${result.successful_sends || 0} recruiters.\n\n` +
            'Follow-ups scheduled automatically:\n' +
            '- Day 4: Follow-up email\n' +
            '- Day 8: Final reminder\n\n' +
            'Check your dashboard for campaign status.'
          );
        } else {
          alert('Blast Successful! Your resume has been sent to recruiters.');
        }
        window.location.href = '/dashboard';
      }}
      onCancel={() => {
        setShowBlast(false);
        window.history.replaceState({}, '', window.location.pathname);
      }}
    />
  );
}

export default PaymentBlastTrigger;