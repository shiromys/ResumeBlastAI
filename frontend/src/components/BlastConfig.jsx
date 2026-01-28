import { useState, useEffect } from 'react'
import { triggerEmailBlast, triggerFreemiumBlast } from '../services/blastService'
import { fetchRecruiters } from '../services/supabaseService'
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
  
  // ✅ Freemium State
  const [isFreemiumEligible, setIsFreemiumEligible] = useState(false)
  const [checkingEligibility, setCheckingEligibility] = useState(true)

  // 1. Check Freemium Eligibility on Mount
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
          // If count is 0, they are eligible for freemium
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

  // 2. Trigger blast if paymentVerified is TRUE (Only for Paid Flow)
  useEffect(() => {
    if (paymentVerified) {
      console.log('✅ Payment Verified - Initiating Paid Blast...')
      const savedConfig = localStorage.getItem('pending_blast_config')
      if (savedConfig) {
        try {
          setBlastConfig(JSON.parse(savedConfig))
        } catch (e) {
          console.error('Error parsing saved config:', e)
        }
      }
      setTimeout(() => {
        handleAutoBlast()
      }, 500)
    }
  }, [paymentVerified])

  // ✅ 3. Handler for Freemium Blast
  const handleFreemiumBlast = async () => {
    try {
      setStatus('blasting')
      setStatusMessage('Sending your resume to 11 Verified Recruiters (Free Plan)...')
      setError(null)
      
      console.log('🎁 Starting Freemium Blast...')
      console.log('User ID:', userData.id)
      console.log('Resume URL:', resumeUrl)
      
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
      
      console.log('✅ Freemium Blast Result:', result)
      
      setStatus('success')
      setStatusMessage(`✅ Freemium Blast Sent Successfully! (${result.details?.successful || 11} emails sent)`)
      setIsFreemiumEligible(false) // No longer eligible
      
      setTimeout(() => {
        if (onBlastComplete) onBlastComplete(result)
      }, 2000)
      
    } catch (err) {
      console.error('❌ Freemium Blast Failed:', err)
      setError(err.message || 'Failed to send freemium blast')
      setStatus('error')
      setStatusMessage('')
    }
  }

  // 4. Handler for Paid Blast (Payment Flow)
  const handlePaymentAndBlast = async () => {
    try {
      setStatus('payment_processing')
      setStatusMessage('Redirecting to secure payment...')
      setError(null)
      
      // Save config for after payment
      localStorage.setItem('pending_blast_config', JSON.stringify(blastConfig))
      if (resumeId && resumeUrl) {
        localStorage.setItem('pending_blast_resume_data', JSON.stringify({
          id: resumeId, 
          url: resumeUrl, 
          timestamp: Date.now()
        }))
      }
      
      console.log('💳 Initiating payment for user:', userData.email)
      
      // Track payment initiation
      await trackPaymentInitiated(userData.id, userData.email, 14900)
      
      // Redirect to Stripe checkout
      await initiateCheckout({ 
        email: userData.email, 
        id: userData.id 
      })
      
    } catch (error) {
      console.error('❌ Payment Error:', error)
      setError(error.message || 'Failed to initiate payment')
      setStatus('idle')
      setStatusMessage('')
      
      // Track payment failure
      await trackPaymentFailure(userData.id, userData.email, error.message)
    }
  }

  // 5. Handle Auto Blast After Payment
  const handleAutoBlast = async () => {
    console.log('=== 🚀 PAID BLAST STARTED ===')
    setStatus('blasting')
    setStatusMessage('Payment verified! Finding matching recruiters...')
    setError(null)
    let campaignId = null

    try {
      // Get saved config
      const savedConfigStr = localStorage.getItem('pending_blast_config')
      const currentConfig = savedConfigStr ? JSON.parse(savedConfigStr) : blastConfig
      
      console.log('📊 Fetching recruiters for industry:', currentConfig.industry)
      
      // Fetch recruiters
      const recruiters = await fetchRecruiters(currentConfig.industry, 50)
      const effectiveRecruiters = (recruiters && recruiters.length > 0) ? recruiters : [
        { email: 'demo@example.com', name: 'Demo Recruiter', company: 'Demo Company' }
      ]

      console.log(`✅ Found ${effectiveRecruiters.length} recruiters`)

      // Extract file name from URL
      let correctFileName = 'Resume.pdf'
      if (resumeUrl) {
        try {
          const urlObj = new URL(resumeUrl)
          const pathName = urlObj.pathname.split('/').pop() 
          if (pathName) correctFileName = decodeURIComponent(pathName)
        } catch (e) {
          console.error('Error parsing resume URL:', e)
        }
      }

      // Prepare blast data
      const blastData = {
        candidate_name: userData.name || 'Professional Candidate',
        candidate_email: userData.email,
        candidate_phone: userData.phone || '',
        job_role: userData.targetRole || 'Professional',
        resume_url: resumeUrl,
        resume_name: correctFileName,
        recipients: effectiveRecruiters.map(r => ({
          email: r.email, 
          name: r.name, 
          company: r.company
        }))
      }

      console.log('📧 Blast Data Prepared:', {
        candidate: blastData.candidate_name,
        recipients: blastData.recipients.length
      })

      // Track initiation
      const tracking = await trackBlastInitiated(userData.id, {
        resume_id: resumeId,
        industry: currentConfig.industry,
        recipients_count: effectiveRecruiters.length
      })
      
      if (tracking.success) {
        campaignId = tracking.campaign_id
        console.log('✅ Campaign tracked:', campaignId)
      }

      // Send Blast
      setStatusMessage(`Sending to ${effectiveRecruiters.length} recruiters...`)
      const result = await triggerEmailBlast(blastData)
      
      console.log('✅ Blast Result:', result)
      
      // Track completion
      if (campaignId) {
        await trackBlastCompleted(userData.id, campaignId, result)
      }

      setStatus('success')
      setStatusMessage(`✅ Blast completed successfully! (${result.successful_sends} sent)`)
      
      // Cleanup
      localStorage.removeItem('pending_blast_config')
      localStorage.removeItem('pending_blast_resume_data')
      
      // Remove payment params from URL
      const url = new URL(window.location)
      url.searchParams.delete('payment')
      url.searchParams.delete('session_id')
      window.history.replaceState({}, '', url.pathname + url.search)
      
      setTimeout(() => {
        if (onBlastComplete) onBlastComplete(result)
      }, 2000)

    } catch (err) {
      console.error('❌ Blast Failed:', err)
      setError(err.message || 'Failed to send blast')
      setStatus('error')
      setStatusMessage('')
      
      if (campaignId) {
        await trackBlastFailure(userData.id, campaignId, err.message)
      }
    }
  }

  // Loading state while checking eligibility
  if (checkingEligibility) {
    return (
      <div className="blast-config-overlay">
        <div className="blast-config-modal">
          <div style={{padding:'40px', textAlign:'center'}}>
            <div className="spinner" style={{width: '40px', height: '40px', margin: '0 auto 20px'}}></div>
            <p style={{color: '#6b7280'}}>Checking your eligibility...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="blast-config-overlay">
      <div className="blast-config-modal">
        {/* Header */}
        <div className="modal-header">
          <h2>
            {status === 'success' ? '🎉 Blast Complete!' : 
             isFreemiumEligible ? '🎁 Free Resume Blast' : '🚀 Premium Resume Blast'}
          </h2>
          {status !== 'blasting' && status !== 'payment_processing' && (
            <button className="close-btn" onClick={onCancel}>✕</button>
          )}
        </div>

        <div className="modal-body">
          {/* Success View */}
          {status === 'success' && (
            <div className="success-message" style={{textAlign: 'center', padding: '40px'}}>
              <span style={{fontSize: '64px', marginBottom: '20px', display: 'block'}}>✅</span>
              <h3 style={{margin: '0 0 15px 0', color: '#10B981', fontSize: '24px'}}>Success!</h3>
              <p style={{color: '#6b7280', margin: 0}}>{statusMessage}</p>
            </div>
          )}

          {/* Loading View */}
          {(status === 'blasting' || status === 'payment_processing') && (
            <div style={{textAlign: 'center', padding: '40px'}}>
              <div className="spinner" style={{
                width: '50px', 
                height: '50px', 
                margin: '0 auto 20px',
                border: '4px solid #f3f3f3',
                borderTop: '4px solid #DC2626',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <h3 style={{margin: '0 0 10px 0', color: '#374151'}}>
                {status === 'payment_processing' ? 'Processing Payment...' : 'Sending Emails...'}
              </h3>
              <p style={{color: '#6b7280', margin: 0}}>{statusMessage}</p>
            </div>
          )}

          {/* Error View */}
          {status === 'error' && error && (
            <div className="error-message" style={{
              background: '#FEE2E2',
              border: '1px solid #DC2626',
              borderRadius: '8px',
              padding: '15px',
              marginBottom: '20px'
            }}>
              <strong style={{color: '#991B1B'}}>⚠️ Error:</strong>
              <p style={{margin: '5px 0 0 0', color: '#B91C1C'}}>{error}</p>
            </div>
          )}

          {/* Config View */}
          {(status === 'idle' || status === 'error') && (
            <>
              {/* FREEMIUM VIEW */}
              {isFreemiumEligible ? (
                <div style={{textAlign: 'center', padding: '20px 0'}}>
                  <div style={{
                    background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', 
                    border: '2px solid #10B981', 
                    borderRadius: '12px',
                    padding: '30px',
                    marginBottom: '25px',
                    boxShadow: '0 4px 6px rgba(16, 185, 129, 0.1)'
                  }}>
                    <div style={{fontSize: '48px', marginBottom: '15px'}}>🎁</div>
                    <h3 style={{
                      color: '#047857', 
                      fontSize: '24px', 
                      margin: '0 0 10px 0',
                      fontWeight: '700'
                    }}>
                      One-Time Free Blast
                    </h3>
                    <p style={{
                      color: '#065F46', 
                      marginBottom: '20px',
                      fontSize: '16px',
                      lineHeight: '1.6'
                    }}>
                      As a new user, send your resume to our curated list of{' '}
                      <strong style={{color: '#047857'}}>11 Top Recruiters</strong> for free!
                    </p>
                    
                    {/* Recruiter List Preview */}
                    <div style={{
                      background: 'white',
                      padding: '15px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#374151',
                      border: '1px solid #A7F3D0',
                      marginBottom: '15px'
                    }}>
                      <div style={{fontWeight: 'bold', color: '#059669', marginBottom: '8px'}}>
                        📋 Includes Recruiters From:
                      </div>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center'}}>
                        <span style={{
                          background: '#F0FDF4',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          border: '1px solid #BBF7D0',
                          fontSize: '12px'
                        }}>
                          Shiro Technologies
                        </span>
                        <span style={{
                          background: '#F0FDF4',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          border: '1px solid #BBF7D0',
                          fontSize: '12px'
                        }}>
                          Star Workforce
                        </span>
                        <span style={{
                          background: '#F0FDF4',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          border: '1px solid #BBF7D0',
                          fontSize: '12px'
                        }}>
                          StarTekk
                        </span>
                        <span style={{
                          background: '#F0FDF4',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          border: '1px solid #BBF7D0',
                          fontSize: '12px'
                        }}>
                          + 8 More Verified Recruiters
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleFreemiumBlast}
                    className="btn-blast"
                    disabled={status === 'blasting'}
                    style={{
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      width: '100%',
                      padding: '18px',
                      fontSize: '18px',
                      fontWeight: '700',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      cursor: status === 'blasting' ? 'not-allowed' : 'pointer',
                      transition: 'transform 0.2s',
                      boxShadow: '0 4px 6px rgba(16, 185, 129, 0.3)'
                    }}
                    onMouseOver={(e) => {
                      if (status !== 'blasting') {
                        e.target.style.transform = 'translateY(-2px)'
                        e.target.style.boxShadow = '0 6px 8px rgba(16, 185, 129, 0.4)'
                      }
                    }}
                    onMouseOut={(e) => {
                      e.target.style.transform = 'translateY(0)'
                      e.target.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    🚀 Send Free Blast (11 Recruiters)
                  </button>
                  
                  <p style={{
                    fontSize: '12px', 
                    color: '#6b7280', 
                    marginTop: '15px',
                    fontStyle: 'italic'
                  }}>
                    *Your next blast will require the $149 Premium Plan
                  </p>
                </div>
              ) : (
                /* PAID VIEW (Existing Premium Plan) */
                <>
                  <div className="payment-banner" style={{
                    background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                    border: '2px solid #DC2626',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '25px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <h3 style={{margin:0, color:'#991B1B', fontSize: '20px', fontWeight: '700'}}>
                        Premium Distribution
                      </h3>
                      <p style={{margin:'5px 0 0 0', fontSize:'14px', color:'#B91C1C'}}>
                        Send to 500+ Verified Recruiters
                      </p>
                    </div>
                    <div style={{fontSize: '28px', fontWeight: 'bold', color:'#DC2626'}}>
                      $149
                    </div>
                  </div>

                  <div className="config-section">
                    <label style={{
                      display:'block', 
                      marginBottom:'8px', 
                      fontWeight:'600', 
                      color:'#374151'
                    }}>
                      Target Industry
                    </label>
                    <select 
                      value={blastConfig.industry} 
                      onChange={(e) => setBlastConfig({...blastConfig, industry: e.target.value})} 
                      style={{
                        width: '100%', 
                        padding: '12px', 
                        marginBottom: '20px', 
                        border: '2px solid #E5E7EB', 
                        borderRadius: '8px',
                        fontSize: '15px'
                      }}
                    >
                      <option value="Technology">Technology</option>
                      <option value="Finance">Finance</option>
                      <option value="Healthcare">Healthcare</option>
                      <option value="Marketing">Marketing</option>
                      <option value="All">All Industries</option>
                    </select>
                  </div>
                  
                  <div className="modal-footer" style={{
                    padding: '20px 0 0 0',
                    display: 'flex',
                    gap: '15px'
                  }}>
                    <button 
                      onClick={onCancel} 
                      className="cancel-btn"
                      style={{
                        flex: '1',
                        padding: '14px',
                        background: '#F3F4F6',
                        border: '1px solid #D1D5DB',
                        borderRadius: '8px',
                        color: '#374151',
                        fontSize: '16px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handlePaymentAndBlast} 
                      className="btn-blast"
                      disabled={status === 'payment_processing'}
                      style={{
                        flex: '2',
                        padding: '14px',
                        background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'white',
                        fontSize: '16px',
                        fontWeight: '700',
                        cursor: status === 'payment_processing' ? 'not-allowed' : 'pointer'
                      }}
                    >
                      ⚡ Pay $149 & Blast
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default BlastConfig