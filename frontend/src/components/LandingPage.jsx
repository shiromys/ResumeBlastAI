import { useEffect, useState, useRef } from 'react'
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
  free:         { label: 'Free',         price: '$0',     defaultCents: 0,    defaultLimit: 11,   drip: false, badge: null,           features: ['11 verified recruiters','Resume analysis','Guaranteed delivery','Professional template','Email support'] },
  starter:      { label: 'Starter',      price: '$9.99',  defaultCents: 999,  defaultLimit: 250,  drip: true,  badge: null,           features: ['250 verified recruiters','3-wave drip campaign','Day 1 → Day 4 → Day 8','Industry-specific list','Priority support'] },
  basic:        { label: 'Basic',        price: '$14.99', defaultCents: 1499, defaultLimit: 500,  drip: true,  badge: 'MOST POPULAR', features: ['500 verified recruiters','3-wave drip campaign','Day 1 → Day 4 → Day 8','Domain-specific list','Skill analysis'] },
  professional: { label: 'Professional', price: '$29.99', defaultCents: 2999, defaultLimit: 750,  drip: true,  badge: null,           comingSoon: true, features: ['750 verified recruiters','3-wave drip campaign','Day 1 → Day 4 → Day 8','Resume score report','Priority support'] },
  growth:       { label: 'Growth',       price: '$39.99', defaultCents: 3999, defaultLimit: 1000, drip: true,  badge: null,           comingSoon: true, features: ['1,000 verified recruiters','3-wave drip campaign','Day 1 → Day 4 → Day 8','Custom recruiter filter','Dedicated support'] },
  advanced:     { label: 'Advanced',     price: '$49.99', defaultCents: 4999, defaultLimit: 1250, drip: true,  badge: null,           comingSoon: true, features: ['1,250 verified recruiters','3-wave drip campaign','Day 1 → Day 4 → Day 8','Full analytics dashboard','VIP support'] },
  premium:      { label: 'Premium',      price: '$59.99', defaultCents: 5999, defaultLimit: 1500, drip: true,  badge: 'BEST RESULTS', comingSoon: true, features: ['1,500 verified recruiters','3-wave drip campaign','Day 1 → Day 4 → Day 8','Everything included','White-glove support'] },
}

const PAID_KEYS = ['starter', 'basic', 'professional', 'growth', 'advanced', 'premium']

function LandingPage({ onGetStarted, user }) {
  const [plans, setPlans]               = useState({})
  const [activeTab, setActiveTab]       = useState('basic')

  useEffect(() => {
    window.scrollTo(0, 0)
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
  }, [])

  const handlePlanSelection = async (planKey) => {
    if (PLAN_CONFIG[planKey]?.comingSoon) return
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

  const activeConfig = PLAN_CONFIG[activeTab]
  const activePrice  = getPriceParts(activeTab)

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
        <p className="section-subtitle">Start free. Upgrade for maximum exposure with our 3-wave drip system.</p>

        <div style={{maxWidth:'1100px',margin:'50px auto 0',padding:'0 20px'}}>

          {/* Free card — same style as existing cards */}
          <div style={{display:'flex',justifyContent:'center',marginBottom:'32px'}}>
            <div className="pricing-card" style={{
              width:'300px',minWidth:'280px',position:'relative',
              border:'2px solid #DC2626',padding:'0'
            }}>
              <div className="price-header" style={{padding:'20px 20px 10px',borderBottom:'1px solid #F3F4F6'}}>
                <h3 style={{fontSize:'20px',fontWeight:'700',margin:'0 0 5px',color:'#1F2937'}}>Free Plan</h3>
                <div className="price-tag" style={{margin:'5px 0',display:'flex',alignItems:'flex-start',justifyContent:'center'}}>
                  <span className="currency" style={{fontSize:'20px',fontWeight:'600',color:'#374151',marginTop:'4px'}}>$</span>
                  <span className="amount" style={{fontSize:'48px',fontWeight:'800',color:'#1F2937',lineHeight:'1'}}>0</span>
                </div>
                <p className="price-description" style={{fontSize:'12px',color:'#6B7280',margin:'5px 0'}}>One-time send • No drip follow-ups</p>
              </div>
              <ul className="features-list" style={{listStyle:'none',padding:'15px 25px',margin:'0'}}>
                {[
                  <><strong>{getLimit('free')} Verified Recruiters</strong></>,
                  'Resume Analysis',
                  'Guaranteed Email Delivery',
                  'Professional Template',
                  'Email support'
                ].map((item, i, arr) => (
                  <li key={i} style={{padding:'5px 0',borderBottom:i<arr.length-1?'1px solid #F3F4F6':'none',fontSize:'13px',color:'#374151',display:'flex',alignItems:'center'}}>
                    <span style={{color:'#DC2626',marginRight:'8px',fontSize:'14px',fontWeight:'700'}}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div style={{padding:'0 20px 20px'}}>
                <button className="cta-button" onClick={() => handlePlanSelection('free')}
                  style={{background:'white',color:'#DC2626',width:'100%',padding:'12px',fontSize:'14px',fontWeight:'700',border:'2px solid #DC2626',borderRadius:'6px',cursor:'pointer'}}>
                  Try for Free
                </button>
              </div>
            </div>
          </div>

          {/* Drip plans header */}
          <div style={{textAlign:'center',marginBottom:'24px'}}>
            <div style={{
              display:'inline-flex',alignItems:'center',gap:'10px',
              background:'linear-gradient(135deg,#DC2626,#991B1B)',
              color:'white',padding:'8px 24px',borderRadius:'24px',
              fontSize:'13px',fontWeight:'700',letterSpacing:'0.5px',
              boxShadow:'0 4px 12px rgba(220,38,38,0.3)'
            }}>
              📧 3-WAVE DRIP CAMPAIGN PLANS — Day 1 → Day 4 → Day 8 📧
            </div>
          </div>

          {/* Plan tab selector */}
          <div style={{display:'flex',gap:'8px',justifyContent:'center',flexWrap:'wrap',marginBottom:'28px'}}>
            {PAID_KEYS.map(key => {
              const c = PLAN_CONFIG[key]
              const isActive = activeTab === key
              return (
                <button key={key} onClick={() => { if(!c.comingSoon) setActiveTab(key) }}
                  style={{
                    padding:'8px 16px',borderRadius:'8px',
                    border: isActive ? '2px solid #DC2626' : c.comingSoon ? '2px solid #D1D5DB' : '2px solid #E5E7EB',
                    background: isActive ? '#DC2626' : c.comingSoon ? '#F3F4F6' : 'white',
                    color: isActive ? 'white' : c.comingSoon ? '#9CA3AF' : '#374151',
                    fontWeight:'600',fontSize:'13px',cursor:c.comingSoon?'not-allowed':'pointer',
                    transition:'all 0.2s',position:'relative',opacity:c.comingSoon?0.75:1
                  }}>
                  {c.label}
                  {c.comingSoon && (
                    <span style={{
                      position:'absolute',top:'-10px',left:'50%',transform:'translateX(-50%)',
                      background:'#6B7280',color:'white',fontSize:'9px',
                      fontWeight:'800',padding:'2px 7px',borderRadius:'10px',whiteSpace:'nowrap'
                    }}>COMING SOON</span>
                  )}
                  {!c.comingSoon && c.badge && (
                    <span style={{
                      position:'absolute',top:'-10px',right:'-4px',
                      background:'#FBBF24',color:'#000',fontSize:'9px',
                      fontWeight:'800',padding:'2px 6px',borderRadius:'10px',whiteSpace:'nowrap'
                    }}>{c.badge}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Active plan card — matches existing card style exactly */}
          <div className="pricing-card featured"
            style={{
              maxWidth:'680px',margin:'0 auto',
              position:'relative',border:'2px solid #DC2626',padding:'0',
              boxShadow:'0 8px 32px rgba(220,38,38,0.12)',
              transition:'all 0.3s ease'
            }}>
            {activeConfig.badge && (
              <div className="popular-badge" style={{
                background:'#DC2626',position:'absolute',top:'-12px',left:'50%',
                transform:'translateX(-50%)',padding:'3px 14px',borderRadius:'20px',
                fontSize:'11px',fontWeight:'700',color:'white',whiteSpace:'nowrap'
              }}>
                {activeConfig.badge}
              </div>
            )}

            <div className="price-header" style={{padding:'28px 28px 16px',borderBottom:'1px solid #F3F4F6'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'16px'}}>
                <div>
                  <h3 style={{fontSize:'22px',fontWeight:'700',margin:'0 0 6px',color:'#1F2937'}}>{activeConfig.label} Plan</h3>
                  <div className="price-tag" style={{display:'flex',alignItems:'flex-start'}}>
                    <span className="currency" style={{fontSize:'20px',fontWeight:'600',color:'#374151',marginTop:'6px'}}>$</span>
                    <span className="amount" style={{fontSize:'52px',fontWeight:'800',color:'#1F2937',lineHeight:'1'}}>
                      {activePrice.whole}
                    </span>
                    <span style={{fontSize:'24px',fontWeight:'700',color:'#374151',marginTop:'14px'}}>.{activePrice.fraction}</span>
                  </div>
                  <p className="price-description" style={{fontSize:'12px',color:'#6B7280',margin:'4px 0 0'}}>One payment • Drip campaign runs automatically</p>
                </div>
                <div style={{
                  background:'linear-gradient(135deg,#FEF2F2,#FEE2E2)',
                  border:'1px solid #FECACA',borderRadius:'12px',
                  padding:'12px 20px',textAlign:'center'
                }}>
                  <div style={{fontSize:'36px',fontWeight:'900',color:'#DC2626',lineHeight:'1'}}>
                    {getLimit(activeTab).toLocaleString()}
                  </div>
                  <div style={{fontSize:'11px',color:'#991B1B',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.5px',marginTop:'2px'}}>
                    Recruiters
                  </div>
                </div>
              </div>

              {/* Drip wave badges */}
              <div style={{display:'flex',gap:'8px',marginTop:'16px',flexWrap:'wrap'}}>
                {['Day 1 — Introduction','Day 4 — Follow-up','Day 8 — Final Reminder'].map((label,i) => (
                  <div key={i} style={{
                    background:'#F0FDF4',border:'1px solid #BBF7D0',
                    borderRadius:'20px',padding:'4px 12px',
                    fontSize:'12px',color:'#166534',fontWeight:'600'
                  }}>✓ {label}</div>
                ))}
              </div>
            </div>

            <ul className="features-list" style={{listStyle:'none',padding:'16px 28px',margin:'0'}}>
              {activeConfig.features.map((f,i,arr) => (
                <li key={i} style={{
                  padding:'6px 0',
                  borderBottom:i<arr.length-1?'1px solid #F3F4F6':'none',
                  fontSize:'13px',color:'#374151',
                  display:'flex',alignItems:'center'
                }}>
                  <span style={{color:'#DC2626',marginRight:'8px',fontSize:'14px',fontWeight:'700'}}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <div style={{padding:'0 28px 28px'}}>
              {activeConfig.comingSoon ? (
                <>
                  <div style={{
                    width:'100%',padding:'14px',boxSizing:'border-box',
                    background:'#F3F4F6',border:'2px dashed #D1D5DB',
                    borderRadius:'6px',textAlign:'center',
                    color:'#6B7280',fontWeight:'700',fontSize:'15px'
                  }}>
                    &#x1F51C; Coming Soon — Available Shortly
                  </div>
                  <p style={{textAlign:'center',fontSize:'12px',color:'#9CA3AF',margin:'10px 0 0'}}>
                    Try Starter or Basic while this plan is being prepared.
                  </p>
                </>
              ) : (
                <>
                  <button className="cta-button"
                    onClick={() => handlePlanSelection(activeTab)}
                    style={{
                      background:'#DC2626',color:'white',width:'100%',
                      padding:'14px',fontSize:'15px',fontWeight:'700',
                      border:'none',borderRadius:'6px',cursor:'pointer',
                      boxShadow:'0 4px 14px rgba(220,38,38,0.35)',
                      transition:'all 0.2s'
                    }}>
                    Get {activeConfig.label} Plan
                  </button>
                  <p style={{textAlign:'center',fontSize:'12px',color:'#9CA3AF',margin:'10px 0 0'}}>
                    &#x1F512; Secure checkout via Stripe
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Quick compare table */}
          <div style={{marginTop:'36px',overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
              <thead>
                <tr style={{background:'#F9FAFB'}}>
                  {['Plan','Price','Recruiters','Drip'].map(h => (
                    <th key={h} style={{padding:'12px 16px',textAlign:h==='Plan'?'left':'center',fontWeight:'700',color:'#374151',borderBottom:'2px solid #E5E7EB'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {['free',...PAID_KEYS].map((key, i) => {
                  const c   = PLAN_CONFIG[key]
                  const p   = getPriceParts(key)
                  const isA = key === activeTab
                  return (
                    <tr key={key}
                      onClick={() => { if(key !== 'free') setActiveTab(key) }}
                      style={{
                        background: isA ? '#FEF2F2' : i%2===0?'white':'#F9FAFB',
                        cursor: (key !== 'free' && !c.comingSoon) ? 'pointer' : 'not-allowed',
                        borderLeft: isA ? '3px solid #DC2626' : '3px solid transparent',
                        transition:'all 0.15s'
                      }}>
                      <td style={{padding:'10px 16px',fontWeight:isA?'700':'500',color:isA?'#DC2626':c.comingSoon?'#9CA3AF':'#374151'}}>
                        {c.label}
                        {c.comingSoon && <span style={{fontSize:'10px',background:'#6B7280',color:'white',padding:'1px 6px',borderRadius:'8px',marginLeft:'6px'}}>Soon</span>}
                        {!c.comingSoon && c.badge && <span style={{fontSize:'10px',background:'#FBBF24',padding:'1px 6px',borderRadius:'8px',marginLeft:'6px',color:'#000'}}>{c.badge}</span>}
                      </td>
                      <td style={{padding:'10px 16px',textAlign:'center',fontWeight:'700',color:c.comingSoon?'#9CA3AF':'#1F2937'}}>{p.full === '$0.00' ? '$0' : p.full}</td>
                      <td style={{padding:'10px 16px',textAlign:'center',color:'#374151'}}>{getLimit(key).toLocaleString()}</td>
                      <td style={{padding:'10px 16px',textAlign:'center'}}>
                        {c.drip
                          ? <span style={{color:'#059669',fontWeight:'700'}}>✓ 3-wave</span>
                          : <span style={{color:'#9CA3AF'}}>1× only</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Info note */}
          <div style={{
            marginTop:'32px',textAlign:'center',padding:'20px',
            background:'#F9FAFB',borderRadius:'12px'
          }}>
            <p style={{color:'#374151',fontSize:'14px',lineHeight:'1.6',margin:0}}>
              New to ResumeBlast.ai? Start with our <strong>Free Plan</strong> to {getLimit('free')} top recruiters.{' '}
              Ready for more? Upgrade to reach up to <strong>{getLimit('premium').toLocaleString()} hiring managers</strong> with our 3-wave drip system.
            </p>
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