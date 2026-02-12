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
import './BlastConfig.css'

function BlastConfig({ resumeId, resumeUrl, userData, paymentVerified, onBlastComplete, onCancel }) {
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
      if (!userData?.id) {
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
  }, [userData])

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
      
      const tracking = await trackBlastInitiated(userData.id, {
        resume_id: resumeId,
        industry: currentConfig.industry,
        recipients_count: limit 
      })
      
      if (tracking.success) {
        campaignId = tracking.campaign_id
      }

      const blastData = {
        candidate_name: userData.name || 'Professional Candidate',
        candidate_email: userData.email,
        candidate_phone: userData.phone || '',
        job_role: userData.targetRole || 'Professional',
        resume_url: resumeUrl,
        plan_name: planType,
        campaign_id: campaignId 
      }

      const result = await triggerEmailBlast(blastData)
      
      setStatus('success')
      setStatusMessage(`✅ Blast completed successfully! (${result.successful_sends} sent)`)
      
      localStorage.removeItem('pending_blast_config')
      localStorage.removeItem('pending_blast_resume_data')
      localStorage.removeItem('selected_plan_type')
      
      setTimeout(() => {
        if (onBlastComplete) onBlastComplete(result)
      }, 2000)

    } catch (err) {
      isBlasting.current = false; // Reset lock to allow retry
      console.error('❌ Paid Blast Failed:', err)
      setError(err.message || 'Failed to send blast')
      setStatus('error')
      if (campaignId) await trackBlastFailure(userData.id, campaignId, err.message)
    }
  }

  const getPlanButtonText = (type, defaultText) => {
    const plan = plans[type];
    if (!plan) return defaultText;
    
    const price = (plan.price_cents / 100).toFixed(2);
    return `${plan.display_name} ($${price} - ${plan.recruiter_limit} Recruiters)`;
  };

  if (checkingEligibility || loadingPlans) {
    return (
      <div className="blast-config-overlay">
        <div className="blast-config-modal">
          <div style={{padding:'40px', textAlign:'center'}}>
            <div className="spinner" style={{width: '40px', height: '40px', margin: '0 auto 20px'}}></div>
            <p style={{color: '#6b7280'}}>Loading configuration...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="blast-config-overlay">
      <div className="blast-config-modal">
        <div className="modal-header">
          <h2>
            {status === 'success' ? '🎉 Blast Complete!' : 
             isFreemiumEligible ? '🎁 Free Resume Blast' : ' Premium Resume Blast'}
          </h2>
          {status !== 'blasting' && status !== 'payment_processing' && (
            <button className="close-btn" onClick={onCancel}>✕</button>
          )}
        </div>

        <div className="modal-body">
          {status === 'success' && (
            <div className="success-message" style={{textAlign: 'center', padding: '40px'}}>
              <span style={{fontSize: '64px', marginBottom: '20px', display: 'block'}}>✅</span>
              <h3 style={{margin: '0 0 15px 0', color: '#10B981', fontSize: '24px'}}>Success!</h3>
              <p style={{color: '#6b7280', margin: 0}}>{statusMessage}</p>
            </div>
          )}

          {(status === 'blasting' || status === 'payment_processing') && (
            <div style={{textAlign: 'center', padding: '40px'}}>
              <div className="spinner"></div>
              <h3 style={{margin: '0 0 10px 0', color: '#374151'}}>
                {status === 'payment_processing' ? 'Processing Payment...' : 'Sending Emails...'}
              </h3>
              <p style={{color: '#6b7280', margin: 0}}>{statusMessage}</p>
            </div>
          )}

          {status === 'error' && error && (
            <div className="error-message">
              <strong>⚠️ Error:</strong>
              <p>{error}</p>
            </div>
          )}

          {(status === 'idle' || status === 'error') && (
            <>
              {isFreemiumEligible ? (
                <div style={{textAlign: 'center', padding: '20px 0'}}>
                  <div className="freemium-card" style={{
                    background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', 
                    border: '2px solid #10B981', 
                    borderRadius: '12px',
                    padding: '30px',
                    marginBottom: '25px'
                  }}>
                    <div style={{fontSize: '48px', marginBottom: '15px'}}>🎁</div>
                    <h3 style={{color: '#047857', fontSize: '24px', fontWeight: '700'}}>Free Blast</h3>
                    <p style={{color: '#065F46', fontSize: '16px'}}>
                      Send your resume to {plans['freemium']?.recruiter_limit || 11} Top Recruiters for free!
                    </p>
                  </div>

                  {/* ✅ Instructions for Freemium Disclaimer Acceptance */}
                  {!freemiumDisclaimerAccepted && (
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

                  {/* ✅ Freemium Disclaimer Section */}
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
                        I acknowledge that ResumeBlast.ai does not guarantee interviews, job offers, or employment. I understand that my resume will be sent to recruiters based on my selected plan and that this purchase is final and non-refundable.
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
                        I acknowledge that ResumeBlast.ai does not guarantee interviews, job offers, or employment. I understand that my resume will be sent to recruiters based on my selected plan and that this purchase is final and non-refundable.
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