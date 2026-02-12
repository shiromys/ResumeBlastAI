import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import BlastConfig from './BlastConfig';

/**
 * PaymentBlastTrigger Component
 * * This component runs on every page load and checks if the user just completed
 * a payment. It fetches the resume data from the database and ensures 
 * the Candidate Name and Email are used (instead of Login details).
 */
function PaymentBlastTrigger() {
  const [showBlast, setShowBlast] = useState(false);
  const [resumeData, setResumeData] = useState(null);
  const [userData, setUserData] = useState(null);

  // ✅ IDEMPOTENCY CHECK: Ensures we don't process the same session multiple times
  const processedSessionRef = useRef(null);

  useEffect(() => {
    checkForPaymentSuccess();
  }, []);

  const checkForPaymentSuccess = async () => {
    try {
      // 1. Check URL for payment success
      const params = new URLSearchParams(window.location.search);
      const paymentSuccess = params.get('payment') === 'success';
      const sessionId = params.get('session_id');

      // ✅ EXIT if not a successful payment return OR if this session was already processed
      if (!paymentSuccess || !sessionId || processedSessionRef.current === sessionId) {
        return;
      }

      // Mark this session as processed immediately
      processedSessionRef.current = sessionId;

      console.log('');
      console.log('=== 💳 PAYMENT BLAST TRIGGER ACTIVATED ===');
      console.log('Session ID:', sessionId);

      // 2. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('❌ No user found for payment blast trigger');
        return;
      }

      // 3. Get resume data from localStorage
      const savedResumeData = localStorage.getItem('pending_blast_resume_data');
      if (!savedResumeData) {
        console.error('❌ No resume data found in localStorage');
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      const parsedResumeData = JSON.parse(savedResumeData);

      // 4. Fetch the complete resume record from database
      const { data: resumeRecord, error: resumeError } = await supabase
        .from('resumes')
        .select('*')
        .eq('id', parsedResumeData.id)
        .single();

      if (resumeError || !resumeRecord) {
        console.error('❌ Could not fetch resume from database:', resumeError);
        alert('Resume not found in database. Please upload again.');
        localStorage.removeItem('pending_blast_resume_data');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      console.log('✅ Resume fetched from database');

      // --- CRITICAL FIX: Extract Candidate Info from Analysis Data ---
      const analysis = resumeRecord.analysis_data || {};

      // 1. Resolve Name (Strict Priority: AI Analysis > DB Column > Filename > Login Name)
      let candidateName = analysis.candidate_name;
      
      // If AI failed to get name, try the root column
      if (!candidateName || candidateName === 'Not Found' || candidateName === 'Candidate') {
          candidateName = resumeRecord.candidate_name;
      }
      
      // If still invalid, try to use the filename (better than login email)
      if (!candidateName || candidateName === 'Not Found' || candidateName === 'Candidate') {
          // Remove extension and underscores from filename
          candidateName = resumeRecord.file_name?.split('.')[0].replace(/_/g, ' ') || '';
      }

      // Final fallback to login name only if absolutely nothing else exists
      if (!candidateName || candidateName.trim() === '') {
          candidateName = user.user_metadata?.full_name || user.email.split('@')[0];
      }

      // 2. Resolve Email
      let candidateEmail = analysis.candidate_email;
      if (!candidateEmail || candidateEmail === 'Not Found') {
          candidateEmail = resumeRecord.candidate_email;
      }
      if (!candidateEmail || candidateEmail === 'Not Found') {
          candidateEmail = user.email; // Fallback to login email
      }

      // 3. Resolve Phone
      const candidatePhone = analysis.candidate_phone !== 'Not Found' 
          ? analysis.candidate_phone 
          : (resumeRecord.candidate_phone || '');

      // 4. Resolve Role
      const candidateRole = analysis.detected_role || 
                            resumeRecord.detected_role || 
                            'Professional';

      // 5. Prepare data for BlastConfig
      const preparedResumeData = {
        id: resumeRecord.id,
        url: resumeRecord.file_url || parsedResumeData.url,
        text: resumeRecord.extracted_text
      };

      const preparedUserData = {
        id: user.id,
        name: candidateName, // ✅ Now strictly prioritized
        email: candidateEmail,
        phone: candidatePhone,
        targetRole: candidateRole,
        skills: Array.isArray(analysis.top_skills) 
          ? analysis.top_skills.join(', ') 
          : 'Professional Skills',
        years_experience: analysis.seniority_level || 
                         analysis.total_experience || 
                         'Mid-Level'
      };

      console.log('✅ Data prepared for blast:');
      console.log('   Candidate Name:', preparedUserData.name);
      console.log('   Candidate Email:', preparedUserData.email);
      console.log('   Target Role:', preparedUserData.targetRole);

      // 6. Set state to show BlastConfig
      setResumeData(preparedResumeData);
      setUserData(preparedUserData);
      setShowBlast(true);

    } catch (error) {
      console.error('=== ❌ ERROR IN PAYMENT BLAST TRIGGER ===', error);
      alert('Error preparing blast data. Please try again or contact support.');
      localStorage.removeItem('pending_blast_resume_data');
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  if (!showBlast || !resumeData || !userData) {
    return null;
  }

  return (
    <BlastConfig
      resumeId={resumeData.id}
      resumeUrl={resumeData.url}
      paymentVerified={true}
      userData={userData}
      onBlastComplete={(result) => {
        console.log('🎉 Blast completed successfully:', result);
        setShowBlast(false);
        localStorage.removeItem('pending_blast_resume_data');
        localStorage.removeItem('pending_blast_config');
        alert('✅ Blast Successful!\n\nYour resume has been sent to recruiters. Check your email for responses!');
        window.location.href = '/dashboard';
      }}
      onCancel={() => {
        console.log('❌ Blast cancelled by user');
        setShowBlast(false);
        window.history.replaceState({}, '', window.location.pathname);
      }}
    />
  );
}

export default PaymentBlastTrigger;