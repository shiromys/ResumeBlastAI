import { useState, useEffect, useRef } from 'react'
import { triggerEmailBlast, triggerFreemiumBlast } from '../services/blastService'
import { initiateCheckout } from '../services/paymentService'
import { supabase } from '../lib/supabase'
import { 
  trackPaymentInitiated, 
  trackPaymentFailure,
  trackBlastInitiated, 
  trackBlastCompleted, 
  trackBlastFailure 
} from '../services/activityTrackingService'
import { saveGuestBlastStart, saveGuestBlastComplete } from '../services/guestTrackingService' // ✅ ADDED: Guest DB tracking
import './BlastConfig.css'

function BlastConfig({ resumeId, resumeUrl, userData, isGuest, paymentVerified, onBlastComplete, onCancel }) {
  const [blastConfig, setBlastConfig] = useState({
    industry: 'Technology',
    recruiterCount: 50,
    location: 'Remote'
  })
  
  const [status, setStatus] = useState('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState(null)
  
  // Freemium State
  const [isFreemiumEligible, setIsFreemiumEligible] = useState(false)
  const [checkingEligibility, setCheckingEligibility] = useState(true)
  const [freemiumDisclaimerAccepted, setFreemiumDisclaimerAccepted] = useState(false) // ✅ Added for Freemium

  // Plans State
  const [plans, setPlans] = useState({})
  const [loadingPlans, setLoadingPlans] = useState(true)

  // Disclaimer State (Paid Plans)
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false)

  // ✅ IDEMPOTENCY LOCK: Prevents double-triggering the blast logic
  const isBlasting = useRef(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  // 1. Fetch Plans from Database
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch(`${API_URL}/api/plans/public`);
        if (response.ok) {
          const data = await response.json();
          const planMap = {};
          if (data.plans) {
            data.plans.forEach(p => planMap[p.key_name] = p);
            setPlans(planMap);
          }
        }
      } catch (err) {
        console.error("Failed to load plans:", err);
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  // 2. Check Freemium Eligibility
  useEffect(() => {
    const checkEligibility = async () => {
      // ✅ Guests are not eligible for Freemium
      if (!userData?.id || isGuest) {
        setIsFreemiumEligible(false)
        setCheckingEligibility(false)
        return
      }
      
      try {
        console.log('🔍 Checking blast history for user:', userData.id)
        
        const { count, error } = await supabase
          .from('blast_campaigns')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userData.id)
          
        if (error) {
          console.error('Error checking eligibility:', error)
          setIsFreemiumEligible(false)
        } else {
          const eligible = count === 0
          setIsFreemiumEligible(eligible)
          console.log(`🎁 Freemium Eligible: ${eligible} (Previous Blasts: ${count})`)
        }
      } catch (err) {
        console.error('Error in eligibility check:', err)
        setIsFreemiumEligible(false)
      } finally {
        setCheckingEligibility(false)
      }
    }
    
    checkEligibility()
  }, [userData, isGuest])

  // 3. Trigger Auto Blast on Payment Success
  useEffect(() => {
    if (paymentVerified) {
      console.log('✅ Payment Verified - Initiating Paid Blast...')
      const savedConfig = localStorage.getItem('pending_blast_config')
      const savedPlan = localStorage.getItem('selected_plan_type') || 'basic'
      
      if (savedConfig) {
        try {
          const parsedConfig = JSON.parse(savedConfig)
          setBlastConfig(parsedConfig)
        } catch (e) {
          console.error('Error parsing saved config:', e)
        }
      }
      
      setTimeout(() => {
        handleAutoBlast(savedPlan)
      }, 500)
    }
  }, [paymentVerified])

  const handleFreemiumBlast = async () => {
    // ✅ Check disclaimer before proceeding
    if (!freemiumDisclaimerAccepted) {
      alert("Please accept the disclaimer to proceed with your free blast.");
      return;
    }

    // ✅ PREVENT DOUBLE TRIGGER
    if (isBlasting.current) return;
    isBlasting.current = true;

    try {
      setStatus('blasting')
      const limit = plans['freemium']?.recruiter_limit || 11;
      setStatusMessage(`Sending your resume to ${limit} Verified Recruiters (Free Plan)...`)
      setError(null)
      
      const result = await triggerFreemiumBlast(
        userData.id, 
        resumeUrl, 
        {
          candidate_name: userData.name,
          candidate_email: userData.email,
          candidate_phone: userData.phone || '',
          job_role: userData.targetRole || 'Professional'
        }
      )
      
      setStatus('success')
      setStatusMessage(`✅ Freemium Blast Sent Successfully! (${result.successful_sends || limit} emails sent)`)
      setIsFreemiumEligible(false) 
      
      setTimeout(() => {
        if (onBlastComplete) onBlastComplete(result)
      }, 2000)
      
    } catch (err) {
      isBlasting.current = false; // Reset lock to allow retry
      console.error('❌ Freemium Blast Failed:', err)
      setError(err.message || 'Failed to send freemium blast')
      setStatus('error')
      setStatusMessage('')
    }
  }

  const handlePaymentAndBlast = async (planType) => {
    if (!disclaimerAccepted) {
        alert("Please accept the disclaimer to proceed.");
        return;
    }

    try {
      setStatus('payment_processing')
      setStatusMessage(`Redirecting to secure payment for ${planType.toUpperCase()} plan...`)
      setError(null)
      
      localStorage.setItem('pending_blast_config', JSON.stringify(blastConfig))
      localStorage.setItem('selected_plan_type', planType)
      
      // ✅ FIX: Set guest session flag BEFORE Stripe redirect so App.jsx
      // can detect this is a guest returning from payment and route to workbench.
      if (isGuest) {
        localStorage.setItem('is_guest_session', 'true')
        console.log('🏷️ Guest session flag set before Stripe redirect')
      }

      if (resumeId && resumeUrl) {
        localStorage.setItem('pending_blast_resume_data', JSON.stringify({
          id: resumeId, 
          url: resumeUrl, 
          timestamp: Date.now()
        }))
      }
      
      let amount = 999;
      if (plans[planType]) {
          amount = plans[planType].price_cents;
      } else {
          amount = planType === 'pro' ? 1299 : 999;
      }

      await trackPaymentInitiated(userData.id, userData.email, amount)
      
      await initiateCheckout({ 
        email: userData.email, 
        id: userData.id,
        plan: planType,
        disclaimer_accepted: true 
      })
      
    } catch (error) {
      console.error('❌ Payment Error:', error)
      setError(error.message || 'Failed to initiate payment')
      setStatus('idle')
      setStatusMessage('')
      await trackPaymentFailure(userData.id, error.message)
    }
  }

  const handleAutoBlast = async (planType) => {
    // ✅ PREVENT DOUBLE TRIGGER
    if (isBlasting.current) return;
    isBlasting.current = true;

    setStatus('blasting')
    
    let limit = 250;
    if (plans[planType]) {
        limit = plans[planType].recruiter_limit;
    } else {
        limit = planType === 'pro' ? 500 : 250;
    }

    setStatusMessage(`Payment verified! Sending to ${limit} recruiters...`)
    setError(null)
    let campaignId = null

    try {
      const savedConfigStr = localStorage.getItem('pending_blast_config')
      const currentConfig = savedConfigStr ? JSON.parse(savedConfigStr) : blastConfig
      
      // ✅ Registered user blast tracking (unchanged)
      if (!isGuest) {
        const tracking = await trackBlastInitiated(userData.id, {
          resume_id: resumeId,
          industry: currentConfig.industry,
          recipients_count: limit 
        })
        if (tracking.success) {
          campaignId = tracking.campaign_id
        }
      }

      // ✅ ADDED: Save blast start to guest_users table for guest users
      // Fire-and-forget — does NOT affect the blast flow
      if (isGuest) {
        saveGuestBlastStart({
          industry: currentConfig.industry,
          recipients_count: limit,
          plan_name: planType
        });
      }

      const blastData = {
        user_id: userData.id,
        resume_url: resumeUrl,
        industry: currentConfig.industry,
        plan: planType,
        candidate_name: userData.name,
        candidate_email: userData.email,
        candidate_phone: userData.phone || '',
        job_role: userData.targetRole || 'Professional',
        campaign_id: campaignId
      }

      const result = await triggerEmailBlast(blastData)
      
      // ✅ Registered user completion tracking (unchanged)
      if (!isGuest && campaignId) {
        await trackBlastCompleted(userData.id, campaignId, {
          total_recipients: result.total_recipients || limit,
          successful_sends: result.successful_sends || 0,
          failed_sends: result.failed_sends || 0,
        })
      }

      // ✅ ADDED: Save blast completion to guest_users table
      if (isGuest) {
        saveGuestBlastComplete({
          success_rate: result.success_rate,
          total_recipients: result.total_recipients,
          successful_sends: result.successful_sends,
          failed_sends: result.failed_sends
        });
      }

      // Clean up localStorage
      localStorage.removeItem('pending_blast_config')
      localStorage.removeItem('selected_plan_type')
      localStorage.removeItem('pending_blast_resume_data')

      setStatus('success')
      setStatusMessage(`✅ Blast Sent! ${result.successful_sends || limit} emails delivered to recruiters.`)
      
      setTimeout(() => {
        if (onBlastComplete) onBlastComplete(result)
      }, 2000)

    } catch (err) {
      isBlasting.current = false;
      console.error('❌ Blast Failed:', err)

      if (!isGuest && campaignId) {
        await trackBlastFailure(userData.id, campaignId, err.message)
      }
      
      setError(err.message || 'Blast failed. Please contact support.')
      setStatus('error')
      setStatusMessage('')
    }
  }

  const getPlanButtonText = (planKey, fallback) => {
    if (loadingPlans) return 'Loading...';
    if (plans[planKey]) {
      const p = plans[planKey];
      return `${p.name} ($${(p.price_cents / 100).toFixed(2)} - ${p.recruiter_limit} Recruiters)`;
    }
    return fallback;
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  if (status === 'blasting') {
    return (
      <div className="blast-config">
        <div className="blast-status sending">
          <div className="blast-spinner"></div>
          <h3>🚀 Blasting Your Resume!</h3>
          <p>{statusMessage}</p>
          <p style={{fontSize: '13px', color: '#6b7280', marginTop: '10px'}}>
            This may take 1-2 minutes. Please don't close this tab.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="blast-config">
        <div className="blast-status success">
          <div style={{fontSize: '60px', marginBottom: '20px'}}>🎉</div>
          <h3>Resume Blast Successful!</h3>
          <p>{statusMessage}</p>
          <p style={{fontSize: '13px', color: '#6b7280', marginTop: '10px'}}>
            Recruiters have received your resume and may reach out soon. Check your email regularly!
          </p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="blast-config">
        <div className="blast-status error">
          <div style={{fontSize: '60px', marginBottom: '20px'}}>❌</div>
          <h3>Blast Failed</h3>
          <p>{error}</p>
          <button onClick={() => { setStatus('idle'); setError(null); isBlasting.current = false; }} className="btn-blast" style={{marginTop: '20px'}}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (status === 'payment_processing') {
    return (
      <div className="blast-config">
        <div className="blast-status sending">
          <div className="blast-spinner"></div>
          <h3>Redirecting to Payment...</h3>
          <p>{statusMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="blast-config">
      <div className="blast-config-inner">
        <div className="blast-config-header">
          <h2>🚀 Configure Your Resume Blast</h2>
          <p>Select your target industry and blast your resume to verified recruiters</p>
        </div>

        <div className="blast-config-body">
          {checkingEligibility ? (
            <div style={{textAlign: 'center', padding: '40px'}}>
              <div className="blast-spinner"></div>
              <p>Checking eligibility...</p>
            </div>
          ) : (
            <>
              <div className="config-section">
                <label className="config-label">Target Industry</label>
                <select 
                  value={blastConfig.industry}
                  onChange={(e) => setBlastConfig({...blastConfig, industry: e.target.value})}
                  className="config-select"
                >
                  <option value="Technology">Technology</option>
                  <option value="Finance">Finance</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Sales">Sales</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Design">Design</option>
                  <option value="Operations">Operations</option>
                  <option value="HR">Human Resources</option>
                  <option value="Legal">Legal</option>
                  <option value="Education">Education</option>
                  <option value="Consulting">Consulting</option>
                  <option value="Retail">Retail</option>
                  <option value="Manufacturing">Manufacturing</option>
                  <option value="Real Estate">Real Estate</option>
                  <option value="Media">Media & Entertainment</option>
                  <option value="Non-Profit">Non-Profit</option>
                  <option value="Government">Government</option>
                  <option value="Logistics">Logistics & Supply Chain</option>
                  <option value="General">General (All Industries)</option>
                </select>
              </div>

              {isFreemiumEligible ? (
                <div className="freemium-section">
                  <div style={{
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    borderRadius: '12px',
                    padding: '20px',
                    color: 'white',
                    marginBottom: '20px',
                    textAlign: 'center'
                  }}>
                    <div style={{fontSize: '30px', marginBottom: '10px'}}>🎁</div>
                    <h3 style={{margin: '0 0 8px 0', fontSize: '20px'}}>You're Eligible for a Free Blast!</h3>
                    <p style={{margin: 0, fontSize: '14px', opacity: 0.9}}>
                      Send your resume to {plans['freemium']?.recruiter_limit || 11} verified recruiters — completely free
                    </p>
                  </div>

                  <div className="disclaimer-section" style={{
                    marginBottom: '20px', 
                    padding: '15px', 
                    background: freemiumDisclaimerAccepted ? '#F0FDF4' : '#FEF2F2', 
                    borderRadius: '8px', 
                    border: freemiumDisclaimerAccepted ? '2px solid #10B981' : '2px solid #EF4444',
                    transition: 'all 0.3s ease',
                    textAlign: 'left'
                  }}>
                    <label style={{display: 'flex', gap: '12px', cursor: 'pointer', alignItems: 'flex-start'}}>
                      <input 
                        type="checkbox" 
                        checked={freemiumDisclaimerAccepted} 
                        onChange={(e) => setFreemiumDisclaimerAccepted(e.target.checked)}
                        style={{
                          marginTop: '3px', 
                          width: '20px', 
                          height: '20px', 
                          accentColor: '#10B981',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{
                        color: '#374151', 
                        fontSize: '13px', 
                        lineHeight: '1.6',
                        fontWeight: '500'
                      }}>
                        I understand that ResumeBlast.ai does not guarantee interviews, job offers, or employment. I acknowledge that my resume will be sent to recruiters based on my selected plan and that this blast is final and can not be reversed.
                      </span>
                    </label>
                  </div>

                  <button 
                    onClick={handleFreemiumBlast} 
                    className="btn-blast" 
                    disabled={!freemiumDisclaimerAccepted}
                    style={{
                      background: freemiumDisclaimerAccepted ? '#10B981' : '#9CA3AF', 
                      width: '100%', 
                      padding: '18px',
                      opacity: freemiumDisclaimerAccepted ? 1 : 0.6,
                      cursor: freemiumDisclaimerAccepted ? 'pointer' : 'not-allowed'
                    }}
                  >
                     Send Free Blast ({plans['freemium']?.recruiter_limit || 11} Recruiters)
                  </button>
                </div>
              ) : (
                <div className="plans-container">
                   <div className="payment-banner">
                    <div>
                      <h3>Select a Paid Plan</h3>
                      <p>Blast your resume to hundreds of recruiters</p>
                    </div>
                  </div>
                  
                  {!disclaimerAccepted && (
                    <div style={{
                      marginBottom: '15px',
                      padding: '12px',
                      background: '#FEF3C7',
                      borderRadius: '6px',
                      border: '1px solid #F59E0B',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <span style={{fontSize: '20px'}}>ℹ️</span>
                      <span style={{
                        fontSize: '13px',
                        color: '#92400E',
                        fontWeight: '500',
                        textAlign: 'left'
                      }}>
                        Please accept the disclaimer below to proceed with your resume blast
                      </span>
                    </div>
                  )}

                  <div className="disclaimer-section" style={{
                    marginBottom: '20px', 
                    padding: '15px', 
                    background: disclaimerAccepted ? '#F0FDF4' : '#FEF2F2', 
                    borderRadius: '8px', 
                    border: disclaimerAccepted ? '2px solid #10B981' : '2px solid #EF4444',
                    transition: 'all 0.3s ease',
                    textAlign: 'left'
                  }}>
                    <label style={{display: 'flex', gap: '12px', cursor: 'pointer', alignItems: 'flex-start'}}>
                      <input 
                        type="checkbox" 
                        checked={disclaimerAccepted} 
                        onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                        style={{
                          marginTop: '3px', 
                          width: '20px', 
                          height: '20px', 
                          accentColor: '#DC2626',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{
                        color: '#374151', 
                        fontSize: '13px', 
                        lineHeight: '1.6',
                        fontWeight: '500'
                      }}>
                        I understand that ResumeBlast.ai does not guarantee interviews, job offers, or employment. I acknowledge that my resume will be sent to recruiters based on my selected plan and that this blast is final and can not be reversed.
                      </span>
                    </label>
                  </div>

                  <div style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                    <button 
                        onClick={() => handlePaymentAndBlast('basic')} 
                        className="btn-blast" 
                        style={{
                            background: disclaimerAccepted 
                              ? 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)' 
                              : 'linear-gradient(135deg, #FCA5A5 0%, #F87171 100%)',
                            color: 'white',
                            cursor: disclaimerAccepted ? 'pointer' : 'not-allowed',
                            opacity: disclaimerAccepted ? 1 : 0.6,
                            border: 'none',
                            padding: '16px 24px',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: '600',
                            transition: 'all 0.3s ease',
                            boxShadow: disclaimerAccepted 
                              ? '0 4px 6px rgba(220, 38, 38, 0.3)' 
                              : '0 2px 4px rgba(0, 0, 0, 0.1)',
                            transform: disclaimerAccepted ? 'none' : 'scale(0.98)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                        disabled={!disclaimerAccepted}
                    >
                      {!disclaimerAccepted && (
                        <span style={{
                          position: 'absolute',
                          top: '8px',
                          right: '12px',
                          fontSize: '20px'
                        }}>🔒</span>
                      )}
                       {getPlanButtonText('basic', 'Basic Plan ($9.99 - 250 Recruiters)')}
                    </button>
                    
                    <button 
                        onClick={() => handlePaymentAndBlast('pro')} 
                        className="btn-blast" 
                        style={{
                            background: disclaimerAccepted 
                              ? 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)' 
                              : 'linear-gradient(135deg, #FCA5A5 0%, #F87171 100%)',
                            color: 'white',
                            cursor: disclaimerAccepted ? 'pointer' : 'not-allowed',
                            opacity: disclaimerAccepted ? 1 : 0.6,
                            border: disclaimerAccepted ? '2px solid #FBBF24' : 'none', 
                            padding: '16px 24px',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: '600',
                            transition: 'all 0.3s ease',
                            boxShadow: disclaimerAccepted 
                              ? '0 4px 6px rgba(220, 38, 38, 0.3), 0 0 20px rgba(251, 191, 36, 0.3)' 
                              : '0 2px 4px rgba(0, 0, 0, 0.1)',
                            transform: disclaimerAccepted ? 'none' : 'scale(0.98)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                        disabled={!disclaimerAccepted}
                    >
                      {!disclaimerAccepted && (
                        <span style={{
                          position: 'absolute',
                          top: '8px',
                          right: '12px',
                          fontSize: '20px'
                        }}>🔒</span>
                      )}
                       {getPlanButtonText('pro', 'Pro Plan ($12.99 - 500 Recruiters)')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default BlastConfig;