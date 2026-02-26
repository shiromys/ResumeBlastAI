import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { initiateCheckout } from '../services/paymentService'
import './LandingPage.css'

// --- CountUp ---
const CountUp = ({ end, duration = 500, suffix = '' }) => {
  const [count, setCount] = useState(0)
  const countRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setIsVisible(true)
      else { setIsVisible(false); setCount(0) }
    }, { threshold: 0.1 })
    if (countRef.current) observer.observe(countRef.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!isVisible) return
    let startTimestamp = null
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / duration, 1)
      setCount(Math.floor(progress * end))
      if (progress < 1) window.requestAnimationFrame(step)
      else setCount(end)
    }
    window.requestAnimationFrame(step)
  }, [isVisible, end, duration])
  return <span ref={countRef}>{count}{suffix}</span>
}

// --- TypewriterEffect ---
const TypewriterEffect = ({ text, delay = 0, infinite = false, onTypeEnd, onDeleteStart }) => {
  const [currentText, setCurrentText] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStarted, setIsStarted] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setIsStarted(true), delay)
    return () => clearTimeout(timer)
  }, [delay])
  useEffect(() => {
    if (!isStarted) return
    let timer
    const typeSpeed = isDeleting ? 30 : 60
    const pauseTime = 500
    if (!isDeleting && currentIndex < text.length) {
      timer = setTimeout(() => { setCurrentText(prev => prev + text[currentIndex]); setCurrentIndex(prev => prev + 1) }, typeSpeed)
    } else if (!isDeleting && currentIndex === text.length) {
      if (onTypeEnd) onTypeEnd()
      if (infinite) { timer = setTimeout(() => { setIsDeleting(true); if (onDeleteStart) onDeleteStart() }, pauseTime) }
    } else if (isDeleting && currentIndex > 0) {
      timer = setTimeout(() => { setCurrentText(prev => prev.slice(0, -1)); setCurrentIndex(prev => prev - 1) }, typeSpeed)
    } else if (isDeleting && currentIndex === 0) { setIsDeleting(false) }
    return () => clearTimeout(timer)
  }, [currentIndex, isDeleting, isStarted, text, infinite, onTypeEnd, onDeleteStart])
  return <span>{currentText}</span>
}

// --- Plan static config (mirrors Supabase plans table) ---
const PLAN_CONFIG = {
  free: { 
    label: 'Free', price: '$0', defaultCents: 0, defaultLimit: 11, drip: false, badge: null, 
    features: ['11 verified recruiters', 'Resume analysis', 'Guaranteed delivery', 'Professional template', 'Email support'] 
  },
  starter: { 
    label: 'Starter', price: '$9.99', defaultCents: 999, defaultLimit: 250, drip: true, badge: null, 
    features: ['250 recruiters', 'Resume Analysis', '3-Wave drip campaign', 'Industry-specific list', 'regular support', 'Guaranteed email delivery'] 
  },
  basic: { 
    label: 'Basic plan', price: '$14.99', defaultCents: 1499, defaultLimit: 500, drip: true, badge: 'MOST POPULAR', 
    features: ['500 recruiters', 'Resume Analysis', 'Curated Resume score', '3-wave drip campaign', 'industry specific list', 'Guaranteed email delivery', 'Support response within 24 hours'] 
  },
  professional: { 
    label: 'Professional', price: '$29.99', defaultCents: 2999, defaultLimit: 750, drip: true, badge: null, comingSoon: true, 
    features: ['750 recruiters', 'Resume Analysis', 'Skill Analysis', '3-wave drip campaign', 'Industry-specific list', 'Guaranteed email delivery', 'Periodical email delivery status (optional)', 'Support response within 24 hours', 'Express email support'] 
  },
  growth: { 
    label: 'Growth', price: '$39.99', defaultCents: 3999, defaultLimit: 1000, drip: true, badge: null, comingSoon: true, 
    features: ['1000 recruiters', 'Resume Analysis', 'Skill Analysis', '3-wave drip campaign', 'Industry-specific list', 'Guaranteed email delivery', 'periodical email delivery status', 'Priority email support within 12 hours', 'Express email support within 8 hours (optional)'] 
  },
  advanced: { 
    label: 'Advance', price: '$49.99', defaultCents: 4999, defaultLimit: 1250, drip: true, badge: null, comingSoon: true, 
    features: ['1250 recruiters', 'Resume Analysis', 'Skill Analysis', '3-wave drip campaign', 'Industry-specific list', 'Guaranteed email delivery', 'Periodical email delivery status', 'Express email support within 8 hours'] 
  },
  premium: { 
    label: 'Premium', price: '$59.99', defaultCents: 5999, defaultLimit: 1500, drip: true, badge: 'BEST RESULTS', comingSoon: true, 
    features: ['1500 recruiters', 'everything in Advance plan', 'Customized plan according to enterprise requirement', 'Call us for customisation'] 
  },
}

const PAID_KEYS = ['starter', 'basic', 'professional', 'growth', 'advanced', 'premium']

function LandingPage({ onGetStarted, user }) {
  const [plans, setPlans] = useState({})
  const location = useLocation()

  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    fetch(`${API_URL}/api/plans/public`)
      .then(res => res.json())
      .then(data => {
        if (data.plans) {
          const m = {}
          data.plans.forEach(p => { m[p.key_name] = p })
          setPlans(m)
        }
      })
      .catch(err => console.error('Failed to load plans:', err))

    const scrollTarget = sessionStorage.getItem('scrollTarget')
    const skipReset = location?.state?.skipScrollReset

    if (scrollTarget) {
      sessionStorage.removeItem('scrollTarget')
      // Use multiple attempts — first reset scroll to top ourselves,
      // then after the page fully renders, scroll to the target section.
      // This prevents React Router scroll restoration from interfering.
      window.scrollTo(0, 0)
      const timer = setTimeout(() => {
        const el = document.getElementById(scrollTarget)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 500)
      return () => clearTimeout(timer)
    } else if (!skipReset) {
      window.scrollTo(0, 0)
    }
  }, [])

  const handlePlanSelection = async (planKey) => {
    const isDisabled = planKey !== 'starter' && planKey !== 'basic' && planKey !== 'free'
    if (isDisabled) return
    if (planKey === 'free' || user) { onGetStarted(); return }
    try {
      let guestId = localStorage.getItem('rb_guest_tracker_id')
      if (!guestId) { guestId = 'guest_' + Date.now(); localStorage.setItem('rb_guest_tracker_id', guestId) }
      localStorage.setItem('is_guest_session', 'true')
      localStorage.setItem('selected_plan_type', planKey)
      await initiateCheckout({ email: 'guest@resumeblast.ai', id: guestId, plan: planKey, disclaimer_accepted: true })
    } catch (err) { console.error('Payment failed:', err) }
  }

  const getPriceParts = (key) => {
    const cents = plans[key]?.price_cents ?? PLAN_CONFIG[key]?.defaultCents ?? 0
    const whole = Math.floor(cents / 100)
    const fraction = (cents % 100).toString().padEnd(2, '0')
    return { whole, fraction, full: `$${whole}.${fraction}` }
  }

  const getLimit = (key) => plans[key]?.recruiter_limit || PLAN_CONFIG[key]?.defaultLimit || 0

  return (
    <div className="landing-page">

      {/* ── HERO ── */}
      <section id="home" className="hero">
        <div className="hero-content">
          <div className="tagline-wrapper">
            <p className="tagline animated-wipe">
              AI-Powered Resume Distribution to <span className="counter-badge">1,500+</span> Recruiters
            </p>
          </div>
          <h1>
            <span style={{display:'block',minHeight:'1.2em'}}><TypewriterEffect text="Stop Applying." /></span>
            <span className="highlight-container" style={{display:'block',minHeight:'1.2em'}}>
              <TypewriterEffect text="Start Blasting." delay={800} infinite={true} />
            </span>
          </h1>
          <div className="hero-highlight-block">
            <p className="subtitle">
              Don't waste time rewriting your resume. Our engine analyzes your profile and sends it directly to{' '}
              <strong style={{color:'#DC2626',fontWeight:'800'}}><CountUp end={1500} suffix="+" /> verified recruiters</strong>{' '}
              looking for your skills — automatically over 8 days.
            </p>
            <div className="cta-container">
              <button className="cta-button large" onClick={onGetStarted}>Start Your Job Search</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="how-it-works">
        <h2>How It Works</h2>
        <p className="section-subtitle">Get noticed in 4 simple steps</p>
        <div className="steps">
          <div className="step"><div className="step-number">1</div><div className="step-icon">📄</div><h3>Upload Resume</h3><p>Upload your resume in PDF, TXT or DOCX format. No rewriting or reformatting required.</p></div>
          <div className="step"><div className="step-number">2</div><div className="step-icon">🤖</div><h3>AI Analysis</h3><p>Our AI scans your resume to detect your role, seniority, and best-fit industry automatically.</p></div>
          <div className="step"><div className="step-number">3</div><div className="step-icon">📧</div><h3>3-Wave Drip Blast</h3><p>Day 1 introduction → Day 4 follow-up → Day 8 final reminder. Maximum recruiter engagement.</p></div>
          <div className="step"><div className="step-number">4</div><div className="step-icon">📊</div><h3>Track Results</h3><p>Real-time dashboard showing your campaign status across all 3 waves.</p></div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="pricing">
        <h2>Choose Your Plan</h2>
        <p className="section-subtitle">Flexible plans that scale with your job search</p>

        <div style={{ maxWidth: '1200px', margin: '50px auto 0', padding: '0 20px' }}>

          {/* MAIN PAID TIERS GRID */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '24px',
            alignItems: 'stretch',
            marginBottom: '40px'
          }}>
            {PAID_KEYS.map(key => {
              const c = PLAN_CONFIG[key]
              const p = getPriceParts(key)
              const limit = getLimit(key)
              
              // Only Starter and Basic are enabled
              const isDisabled = key !== 'starter' && key !== 'basic'
              
              return (
                <div key={key} style={{
                  background: 'white',
                  padding: '32px 24px',
                  borderRadius: '16px',
                  border: '2px solid #DC2626',
                  boxShadow: '0 12px 24px -8px rgba(220,38,38,0.15)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  textAlign: 'left',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}>
                  {c.badge && (
                    <div style={{
                      position: 'absolute', top: '-12px', left: '24px',
                      background: '#DC2626',
                      color: 'white',
                      padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap'
                    }}>
                      {c.badge}
                    </div>
                  )}
                  {isDisabled && !c.badge && (
                    <div style={{
                      position: 'absolute', top: '-12px', left: '24px',
                      background: '#6B7280', color: 'white',
                      padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap'
                    }}>
                      COMING SOON
                    </div>
                  )}

                  <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: '0 0 16px' }}>
                    {c.label}
                  </h3>
                  
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '36px', fontWeight: '800', color: '#111827', lineHeight: '1' }}>
                      {p.full === '$0.00' ? '$0' : p.full}
                    </span>
                    <span style={{ fontSize: '14px', color: '#6B7280', fontWeight: '500' }}>
                      / one-time
                    </span>
                  </div>
                  
                  <p style={{ fontSize: '14px', color: '#4B5563', margin: '0 0 24px', minHeight: '42px', lineHeight: '1.5' }}>
                    Maximum exposure with automated drip follow-ups.
                  </p>
                  
                  <button 
                    onClick={() => handlePlanSelection(key)}
                    disabled={isDisabled}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      background: '#DC2626',
                      color: 'white',
                      border: '1px solid #DC2626',
                      marginBottom: '32px',
                      transition: 'all 0.2s',
                      opacity: isDisabled ? 0.6 : 1
                    }}
                  >
                    {isDisabled ? 'Coming Soon' : 'Get started'}
                  </button>

                  <div style={{ flexGrow: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#111827' }}>●</span> {limit.toLocaleString()} verified recruiters
                    </div>
                    {c.drip && (
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#111827' }}>●</span> 3-wave drip campaign
                      </div>
                    )}
                    
                    <div style={{ height: '1px', background: '#E5E7EB', margin: '16px 0' }}></div>
                    
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {c.features
                        .filter(f => !f.toLowerCase().includes('recruiters') && !f.toLowerCase().includes('3-wave drip') && !f.toLowerCase().includes('day 1 → day 4 → day 8'))
                        .map((feature, idx) => (
                        <li key={idx} style={{ 
                          display: 'flex', alignItems: 'flex-start', gap: '10px', 
                          fontSize: '14px', color: '#4B5563', marginBottom: '12px', lineHeight: '1.4'
                        }}>
                          <span style={{ color: '#059669', flexShrink: 0, fontWeight: 'bold' }}>✓</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>

          {/* FREE PLAN WIDE CARD */}
          <div style={{
            background: 'white',
            padding: '40px',
            borderRadius: '16px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '40px',
            marginBottom: '40px',
            flexWrap: 'wrap',
            textAlign: 'left'
          }}>
            <div style={{ flex: '1 1 300px' }}>
              <h3 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: '0 0 8px' }}>
                {PLAN_CONFIG.free.label}
              </h3>
              <p style={{ fontSize: '15px', color: '#4B5563', margin: '0 0 24px', lineHeight: '1.5' }}>
                $0 free forever – the perfect plan to get your job search started with basic delivery.
              </p>
              <button 
                onClick={() => handlePlanSelection('free')}
                style={{
                  padding: '12px 24px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  background: 'white',
                  color: '#374151',
                  border: '1px solid #D1D5DB',
                  transition: 'all 0.2s',
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = '#F9FAFB' }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'white' }}
              >
                Start for free
              </button>
            </div>

            <div style={{ flex: '2 1 400px' }}>
               <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                 {PLAN_CONFIG.free.features.map((feature, idx) => (
                   <li key={idx} style={{ 
                     display: 'flex', alignItems: 'center', gap: '10px', 
                     fontSize: '14px', color: '#4B5563', lineHeight: '1.4'
                   }}>
                     <span style={{ color: '#059669', flexShrink: 0, fontWeight: 'bold' }}>✓</span>
                     <span>{feature}</span>
                   </li>
                 ))}
               </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── UPSELLS ── */}
      <section className="upsells">
        <h2>Explore Our Other Career Tools</h2>
        <div className="upsell-cards">
          <a href="https://instantresumeai.com" target="_blank" rel="noopener noreferrer" className="upsell-card">
            <h3>⚡ InstantResumeAI</h3>
            <p>Get your resume AI-enhanced in minutes without mass distribution. Perfect for quick updates.</p>
            <span className="learn-more">Learn More →</span>
          </a>
          <a href="https://www.cloudsourcehrm.us/" target="_blank" rel="noopener noreferrer" className="upsell-card">
            <h3>📧 CloudeSourceHRM</h3>
            <p>Access our premium recruiter database with 10,000+ contacts for targeted outreach campaigns.</p>
            <span className="learn-more">Learn More →</span>
          </a>
          <a href="https://blastyourresume.com" target="_blank" rel="noopener noreferrer" className="upsell-card">
            <h3>💼 BlastYourResume</h3>
            <p>Automated job application system — apply to 100+ jobs per day on major job boards.</p>
            <span className="learn-more">Learn More →</span>
          </a>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="final-cta">
        <h2>Ready to Land Your Dream Job?</h2>
        <p>Join 1,000+ professionals who found their next opportunity with ResumeBlast.ai</p>
        <button className="cta-button large" onClick={onGetStarted}>Start Your Job Search Now</button>
        <p className="cta-subtext">🔒 Secure checkout via Stripe</p>
      </section>

    </div>
  )
}

export default LandingPage