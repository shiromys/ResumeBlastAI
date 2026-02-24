import { useState, useEffect, useRef } from 'react'
import { triggerFreemiumBlast } from '../services/blastService'
import { initiateCheckout } from '../services/paymentService'
import { supabase } from '../lib/supabase'
import {
  trackPaymentInitiated, trackPaymentFailure,
  trackBlastInitiated, trackBlastCompleted, trackBlastFailure
} from '../services/activityTrackingService'
import { saveGuestBlastStart, saveGuestBlastComplete } from '../services/guestTrackingService'
import './BlastConfig.css'

const PLAN_CONFIG = {
  free:         { label: 'Free Plan',          price: '$0.00',  recruiters: 11,   drip: false },
  starter:      { label: 'Starter Plan',       price: '$9.99',  recruiters: 250,  drip: true  },
  basic:        { label: 'Basic Plan',         price: '$14.99', recruiters: 500,  drip: true  },
  professional: { label: 'Professional Plan',  price: '$29.99', recruiters: 750,  drip: true, comingSoon: true },
  growth:       { label: 'Growth Plan',        price: '$39.99', recruiters: 1000, drip: true, comingSoon: true },
  advanced:     { label: 'Advanced Plan',      price: '$49.99', recruiters: 1250, drip: true, comingSoon: true },
  premium:      { label: 'Premium Plan',       price: '$59.99', recruiters: 1500, drip: true, comingSoon: true },
}

const PAID_PLAN_KEYS = ['starter','basic','professional','growth','advanced','premium']

function BlastConfig({ resumeId, resumeUrl, userData, isGuest, paymentVerified, onBlastComplete, onCancel }) {
  const [blastConfig, setBlastConfig]   = useState({ industry: 'Technology', location: 'Remote' })
  const [status, setStatus]             = useState('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError]               = useState(null)
  const [isFreemiumEligible, setIsFreemiumEligible] = useState(false)
  const [checkingEligibility, setCheckingEligibility] = useState(true)
  const [freemiumDisclaimerAccepted, setFreemiumDisclaimerAccepted] = useState(false)
  const [plans, setPlans]               = useState({})
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false)
  const isBlasting = useRef(false)
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  // Fetch plans from DB
  useEffect(() => {
    fetch(`${API_URL}/api/plans/public`)
      .then(r => r.json())
      .then(data => {
        const m = {}
        data.plans?.forEach(p => { m[p.key_name] = p })
        setPlans(m)
      })
      .catch(console.error)
      .finally(() => setLoadingPlans(false))
  }, [])

  // Check freemium eligibility — registered users only, never guests
  useEffect(() => {
    if (!userData?.id || isGuest) {
      setIsFreemiumEligible(false)
      setCheckingEligibility(false)
      return
    }
    supabase.from('blast_campaigns').select('*',{count:'exact',head:true}).eq('user_id',userData.id)
      .then(({ count, error }) => {
        setIsFreemiumEligible(!error && count === 0)
      })
      .catch(() => setIsFreemiumEligible(false))
      .finally(() => setCheckingEligibility(false))
  }, [userData, isGuest])

  // If paymentVerified=true, blast is already handled by backend drip system
  useEffect(() => {
    if (paymentVerified && !isBlasting.current) {
      setStatus('success')
      setStatusMessage('Your Day 1 blast has been sent! Follow-up emails will go out automatically on Day 4 and Day 8.')
      setTimeout(() => onBlastComplete && onBlastComplete({ drip_mode: true }), 3000)
    }
  }, [paymentVerified])

  const handleFreemiumBlast = async () => {
    if (isBlasting.current || !freemiumDisclaimerAccepted) return
    isBlasting.current = true
    setStatus('sending')
    setStatusMessage('Sending your resume to recruiters...')
    try {
      if (!isGuest) await trackBlastInitiated(userData.id, 'freemium', 'free')
      else await saveGuestBlastStart(userData.id, 'freemium')

      const result = await triggerFreemiumBlast(userData.id, resumeUrl, {
        candidate_name: userData.name, candidate_email: userData.email,
        candidate_phone: userData.phone || '', job_role: userData.targetRole
      })

      if (result.success) {
        setStatus('success')
        setStatusMessage(`Resume sent to ${result.details?.total || 11} recruiters!`)
        if (!isGuest) await trackBlastCompleted(userData.id, result)
        else await saveGuestBlastComplete(userData.id, result)
        setTimeout(() => onBlastComplete && onBlastComplete(result), 2000)
      } else {
        throw new Error(result.error || 'Freemium blast failed')
      }
    } catch (err) {
      setStatus('error')
      setError(err.message)
      isBlasting.current = false
      if (!isGuest) await trackBlastFailure(userData.id, err.message)
    }
  }

  const handlePaymentAndBlast = async (planKey) => {
    if (!disclaimerAccepted || isBlasting.current) return
    isBlasting.current = true
    setStatus('payment_processing')
    setStatusMessage('Redirecting to secure payment...')
    try {
      localStorage.setItem('pending_blast_resume_data', JSON.stringify({ id: resumeId, url: resumeUrl }))
      localStorage.setItem('pending_blast_config', JSON.stringify({ plan: planKey, industry: blastConfig.industry, location: blastConfig.location }))
      if (!isGuest) await trackPaymentInitiated(userData.id, planKey)
      await initiateCheckout({ email: userData.email, user_id: userData.id, plan: planKey, disclaimer_accepted: disclaimerAccepted })
      isBlasting.current = false
    } catch (err) {
      setStatus('error')
      setError(err.message || 'Payment failed. Please try again.')
      isBlasting.current = false
      if (!isGuest) await trackPaymentFailure(userData.id, err.message)
    }
  }

  if (status === 'sending') return (
    <div className="blast-config"><div className="blast-status sending">
      <div className="blast-spinner"></div>
      <h3>Sending Your Resume...</h3><p>{statusMessage}</p>
    </div></div>
  )

  if (status === 'success') return (
    <div className="blast-config"><div className="blast-status success">
      <div style={{fontSize:'60px',marginBottom:'20px'}}>🎉</div>
      <h3>Blast Initiated!</h3><p>{statusMessage}</p>
      <p style={{fontSize:'13px',color:'#6b7280',marginTop:'10px'}}>
        Check your dashboard to track drip campaign progress.
      </p>
    </div></div>
  )

  if (status === 'error') return (
    <div className="blast-config"><div className="blast-status error">
      <div style={{fontSize:'60px',marginBottom:'20px'}}>❌</div>
      <h3>Something Went Wrong</h3><p>{error}</p>
      <button onClick={() => { setStatus('idle'); setError(null); isBlasting.current = false }} className="btn-blast" style={{marginTop:'20px'}}>
        Try Again
      </button>
    </div></div>
  )

  if (status === 'payment_processing') return (
    <div className="blast-config"><div className="blast-status sending">
      <div className="blast-spinner"></div>
      <h3>Redirecting to Payment...</h3><p>{statusMessage}</p>
    </div></div>
  )

  return (
    <div className="blast-config">
      <div className="blast-config-inner">
        <div className="blast-config-header">
          <h2>🚀 Configure Your Resume Blast</h2>
          <p>Select your plan and reach verified recruiters</p>
          {isGuest && (
            <div style={{background:'#FEF3C7',border:'1px solid #F59E0B',borderRadius:'8px',padding:'10px 14px',fontSize:'13px',color:'#92400E',marginTop:'10px'}}>
              👤 Guest session active — your campaign will be tracked by session ID
            </div>
          )}
        </div>

        <div className="blast-config-body">
          {checkingEligibility ? (
            <div style={{textAlign:'center',padding:'40px'}}>
              <div className="blast-spinner"></div><p>Checking eligibility...</p>
            </div>
          ) : (
            <>
              {/* Industry */}
              <div className="config-section">
                <label className="config-label">Target Industry</label>
                <select value={blastConfig.industry} onChange={e => setBlastConfig({...blastConfig,industry:e.target.value})} className="config-select">
                  {['Technology','Finance','Healthcare','Marketing','Sales','Engineering','Design','Operations','HR','Legal','Education','Consulting','Retail','Manufacturing','Real Estate','Media & Entertainment','Non-Profit','Government','Logistics & Supply Chain','General (All Industries)'].map(ind => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>

              {/* FREEMIUM — registered users only, one-time, no drip */}
              {isFreemiumEligible && !isGuest && (
                <div className="freemium-section">
                  <div style={{background:'linear-gradient(135deg,#10B981,#059669)',borderRadius:'12px',padding:'20px',color:'white',marginBottom:'20px',textAlign:'center'}}>
                    <div style={{fontSize:'30px',marginBottom:'10px'}}>🎁</div>
                    <h3 style={{margin:'0 0 8px 0',fontSize:'20px'}}>You're Eligible for a Free Blast!</h3>
                    <p style={{margin:'0',fontSize:'14px',opacity:0.9}}>
                      Send to {plans['free']?.recruiter_limit || 11} recruiters — completely free
                    </p>
                    <p style={{margin:'6px 0 0',fontSize:'12px',opacity:0.8}}>
                      One-time send (drip follow-ups available on paid plans)
                    </p>
                  </div>
                  <div style={{marginBottom:'20px',padding:'15px',background:freemiumDisclaimerAccepted?'#F0FDF4':'#FEF2F2',borderRadius:'8px',border:freemiumDisclaimerAccepted?'2px solid #10B981':'2px solid #EF4444'}}>
                    <label style={{display:'flex',gap:'12px',cursor:'pointer',alignItems:'flex-start'}}>
                      <input type="checkbox" checked={freemiumDisclaimerAccepted} onChange={e=>setFreemiumDisclaimerAccepted(e.target.checked)} style={{marginTop:'3px',width:'20px',height:'20px',accentColor:'#10B981'}}/>
                      <span style={{color:'#374151',fontSize:'13px',lineHeight:'1.6',fontWeight:'500'}}>
                        I understand ResumeBlast.ai does not guarantee interviews or employment. This blast is final and cannot be reversed.
                      </span>
                    </label>
                  </div>
                  <button onClick={handleFreemiumBlast} disabled={!freemiumDisclaimerAccepted} className="btn-blast"
                    style={{background:freemiumDisclaimerAccepted?'#10B981':'#9CA3AF',width:'100%',padding:'18px',opacity:freemiumDisclaimerAccepted?1:0.6,cursor:freemiumDisclaimerAccepted?'pointer':'not-allowed'}}>
                    🎁 Send Free Blast ({plans['free']?.recruiter_limit || 11} Recruiters)
                  </button>
                  <div style={{textAlign:'center',margin:'20px 0 10px',color:'#6B7280',fontSize:'14px'}}>
                    — or upgrade to a drip campaign —
                  </div>
                </div>
              )}

              {/* PAID PLANS — all users including guests */}
              <div className="plans-container">
                <div className="payment-banner">
                  <h3>📧 3-Wave Drip Campaign Plans</h3>
                  <p>Day 1 → Day 4 Follow-up → Day 8 Final Reminder</p>
                </div>

                {/* Disclaimer */}
                <div style={{marginBottom:'20px',padding:'15px',background:disclaimerAccepted?'#F0FDF4':'#FEF2F2',borderRadius:'8px',border:disclaimerAccepted?'2px solid #10B981':'2px solid #EF4444',transition:'all 0.3s ease'}}>
                  <label style={{display:'flex',gap:'12px',cursor:'pointer',alignItems:'flex-start'}}>
                    <input type="checkbox" checked={disclaimerAccepted} onChange={e=>setDisclaimerAccepted(e.target.checked)} style={{marginTop:'3px',width:'20px',height:'20px',accentColor:'#DC2626'}}/>
                    <span style={{color:'#374151',fontSize:'13px',lineHeight:'1.6',fontWeight:'500'}}>
                      I understand ResumeBlast.ai does not guarantee interviews, job offers, or employment.
                      I acknowledge my resume will be sent to recruiters per the selected plan and this campaign is final and cannot be reversed.
                    </span>
                  </label>
                </div>

                {!disclaimerAccepted && (
                  <div style={{marginBottom:'15px',padding:'10px 14px',background:'#FEF3C7',borderRadius:'6px',border:'1px solid #F59E0B',fontSize:'13px',color:'#92400E'}}>
                    ℹ️ Accept the disclaimer above to unlock the plans below
                  </div>
                )}

                {/* Plan buttons */}
                <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                  {PAID_PLAN_KEYS.map(planKey => {
                    const config    = PLAN_CONFIG[planKey]
                    const dbPlan    = plans[planKey]
                    const price     = dbPlan ? `$${(dbPlan.price_cents/100).toFixed(2)}` : config.price
                    const recruiters = dbPlan?.recruiter_limit || config.recruiters
                    const isPopular = planKey === 'basic'
                    const isComingSoon = config.comingSoon === true
                    const isDisabled = !disclaimerAccepted || isComingSoon
                    return (
                      <div key={planKey} style={{position:'relative'}}>
                      {isComingSoon && (
                        <div style={{
                          position:'absolute',top:0,left:0,right:0,bottom:0,
                          borderRadius:'8px',zIndex:2,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          background:'rgba(0,0,0,0.55)',cursor:'not-allowed'
                        }}>
                          <span style={{
                            background:'#374151',color:'white',
                            padding:'6px 16px',borderRadius:'20px',
                            fontSize:'13px',fontWeight:'800',letterSpacing:'0.5px'
                          }}>🔜 Coming Soon</span>
                        </div>
                      )}
                      <button key={planKey} onClick={() => !isComingSoon && handlePaymentAndBlast(planKey)} disabled={isDisabled} className="btn-blast"
                        style={{background:isComingSoon?'linear-gradient(135deg,#6B7280,#4B5563)':disclaimerAccepted?'linear-gradient(135deg,#DC2626,#991B1B)':'linear-gradient(135deg,#FCA5A5,#F87171)',color:'white',cursor:isDisabled?'not-allowed':'pointer',opacity:isComingSoon?0.7:disclaimerAccepted?1:0.6,border:isPopular&&disclaimerAccepted&&!isComingSoon?'2px solid #FBBF24':'none',padding:'16px 24px',borderRadius:'8px',fontSize:'15px',fontWeight:'600',position:'relative',textAlign:'left',transition:'all 0.3s ease',boxShadow:disclaimerAccepted&&!isComingSoon?'0 4px 6px rgba(220,38,38,0.3)':'none',width:'100%'}}>
                        {isPopular && (
                          <span style={{position:'absolute',top:'-10px',right:'16px',background:'#FBBF24',color:'#000',fontSize:'11px',fontWeight:'700',padding:'2px 10px',borderRadius:'20px'}}>
                            MOST POPULAR
                          </span>
                        )}
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span>{config.label}</span>
                          <span style={{fontSize:'18px',fontWeight:'800'}}>{price}</span>
                        </div>
                        <div style={{fontSize:'12px',opacity:0.85,marginTop:'4px'}}>
                          📧 {recruiters.toLocaleString()} recruiters • 3-wave drip (Day 1 → Day 4 → Day 8)
                        </div>
                        {!disclaimerAccepted && !isComingSoon && (
                          <span style={{position:'absolute',top:'50%',right:'16px',transform:'translateY(-50%)',fontSize:'18px'}}>🔒</span>
                        )}
                      </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default BlastConfig