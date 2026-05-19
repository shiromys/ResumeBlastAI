// frontend/src/pages/PricingPage.jsx

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { initiateCheckout } from '../services/paymentService'
import PageMeta from '../components/SEO/PageMeta'
import './PricingPage.css'

const PLAN_CONFIG = {
  free: {
    label: 'Free', price: '$0', defaultCents: 0, defaultLimit: 11,
    badge: null, comingSoon: false,
    description: 'Perfect to get started and test the platform.',
    features: ['11 verified recruiters','AI resume analysis','Guaranteed email delivery','Professional email template','Email support'],
  },
  starter: {
    label: 'Starter', price: '$9.99', defaultCents: 999, defaultLimit: 250,
    badge: null, comingSoon: false,
    description: 'Ideal for active job seekers who want real reach.',
    features: ['250 verified recruiters','AI resume analysis','3-wave drip campaign','Industry-specific recruiter list','Regular support','Guaranteed email delivery'],
  },
  basic: {
    label: 'Basic', price: '$14.99', defaultCents: 1499, defaultLimit: 500,
    badge: 'MOST POPULAR', comingSoon: false,
    description: 'Maximum exposure for serious job seekers.',
    features: ['500 verified recruiters','AI resume analysis','Curated resume score','3-wave drip campaign','Industry-specific recruiter list','Guaranteed email delivery','Support response within 24 hours'],
  },
  professional: {
    label: 'Professional', price: '$29.99', defaultCents: 2999, defaultLimit: 750,
    badge: null, comingSoon: true,
    description: 'For professionals who want deeper skill-matched outreach.',
    features: ['750 verified recruiters','AI resume analysis','Skill analysis','3-wave drip campaign','Industry-specific recruiter list','Guaranteed email delivery','Periodical email delivery status','Support response within 24 hours','Express email support'],
  },
  growth: {
    label: 'Growth', price: '$39.99', defaultCents: 3999, defaultLimit: 1000,
    badge: null, comingSoon: true,
    description: 'Scale your outreach to 1000 verified recruiters.',
    features: ['1000 verified recruiters','AI resume analysis','Skill analysis','3-wave drip campaign','Industry-specific recruiter list','Guaranteed email delivery','Periodical email delivery status','Priority email support within 12 hours','Express email support within 8 hours'],
  },
  advanced: {
    label: 'Advanced', price: '$49.99', defaultCents: 4999, defaultLimit: 1250,
    badge: null, comingSoon: true,
    description: 'High-volume outreach for competitive job markets.',
    features: ['1250 verified recruiters','AI resume analysis','Skill analysis','3-wave drip campaign','Industry-specific recruiter list','Guaranteed email delivery','Periodical email delivery status','Express email support within 8 hours'],
  },
  premium: {
    label: 'Premium', price: '$59.99', defaultCents: 5999, defaultLimit: 1500,
    badge: 'BEST RESULTS', comingSoon: true,
    description: 'Maximum reach with enterprise-level customisation.',
    features: ['1500 verified recruiters','Everything in Advanced plan','Customised plan for enterprise needs','Call us for customisation'],
  },
}

function PricingPage({ onGetStarted, user }) {

  useEffect(() => { window.scrollTo(0, 0) }, [])

  const handlePlanSelection = async (planKey) => {
    const cfg = PLAN_CONFIG[planKey]
    if (cfg.comingSoon) return
    if (planKey === 'free' || user) { onGetStarted(); return }
    try {
      let guestId = localStorage.getItem('rb_guest_tracker_id')
      if (!guestId) { guestId = 'guest_' + Date.now(); localStorage.setItem('rb_guest_tracker_id', guestId) }
      localStorage.setItem('is_guest_session', 'true')
      localStorage.setItem('selected_plan_type', planKey)
      await initiateCheckout({ email: 'guest@resumeblast.ai', id: guestId, plan: planKey, disclaimer_accepted: true, priceCents: cfg.defaultCents })
    } catch (err) { console.error('Payment failed:', err) }
  }

  const renderCard = (planKey, featured = false) => {
    const cfg = PLAN_CONFIG[planKey]
    const isDisabled = cfg.comingSoon
    return (
      <div key={planKey} className={`pp-card${featured ? ' pp-card-featured' : ''}${isDisabled ? ' pp-card-disabled' : ''}`}>
        {cfg.badge && <div className={`pp-badge${featured ? ' pp-badge-featured' : ' pp-badge-alt'}`}>{cfg.badge}</div>}
        <div className="pp-card-header">
          <h2 className="pp-plan-name">{cfg.label}</h2>
          <div className="pp-price">
            <span className="pp-price-main">{cfg.price}</span>
            <span className="pp-price-period">{cfg.defaultCents === 0 ? 'forever' : 'one-time'}</span>
          </div>
          <p className="pp-plan-desc">{cfg.description}</p>
        </div>
        <button
          className={`pp-btn${featured ? ' pp-btn-featured' : isDisabled ? ' pp-btn-disabled' : planKey === 'free' ? ' pp-btn-outline' : ' pp-btn-primary'}`}
          onClick={() => handlePlanSelection(planKey)}
          disabled={isDisabled}
        >
          {isDisabled ? 'Coming Soon' : planKey === 'free' ? 'Start for Free' : `Get ${cfg.label}`}
        </button>
        <ul className="pp-features">
          {cfg.features.map((f, i) => (
            <li key={i}><span className={`pp-check${featured ? ' pp-check-white' : ''}`}>✓</span>{f}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="pricing-page">

      <PageMeta
        title="Pricing | AI Recruiter Outreach Plans — ResumeBlast.ai"
        description="ResumeBlast.ai plans start free. Reach 11 recruiters at $0, 250 at $9.99, 500 at $14.99, up to 1500 recruiters at $59.99. AI-powered 3-wave drip campaign included."
        canonical="https://www.resumeblast.ai/pricing"
      />

      <div className="pp-header">
        <p className="pp-label">Simple Pricing</p>
        <h1 className="pp-title">Start Free. Scale When You're Ready.</h1>
        <p className="pp-subtitle">
          Every plan includes AI resume analysis and direct recruiter delivery.
          Paid plans add the 3-wave drip campaign for maximum response rates.
        </p>
      </div>

      {/* Essential Plans */}
      <div className="pp-section">
        <div className="pp-section-label">Essential Plans</div>
        <div className="pp-cards-wrapper">
          <div className="pp-cards pp-cards-3">
            {renderCard('free')}
            {renderCard('starter')}
            {renderCard('basic', true)}
          </div>
        </div>
      </div>

      {/* Power Plans */}
      <div className="pp-section pp-section-power">
        <div className="pp-section-label">Power Plans</div>
        <p className="pp-section-sub">More recruiters, deeper skill matching, priority support. Launching soon.</p>
        <div className="pp-cards-wrapper">
          <div className="pp-cards pp-cards-4">
            {renderCard('professional')}
            {renderCard('growth')}
            {renderCard('advanced')}
            {renderCard('premium')}
          </div>
        </div>
      </div>

      {/* Recruiter count comparison */}
      <div className="pp-compare">
        <h2 className="pp-compare-title">Recruiter Reach by Plan</h2>
        <div className="pp-compare-bars">
          {Object.entries(PLAN_CONFIG).map(([key, cfg]) => (
            <div key={key} className="pp-bar-row">
              <span className="pp-bar-label">{cfg.label}</span>
              <div className="pp-bar-track">
                <div className={`pp-bar-fill${cfg.comingSoon ? ' pp-bar-soon' : ' pp-bar-active'}`}
                  style={{ width: `${(cfg.defaultLimit / 1500) * 100}%` }} />
              </div>
              <span className="pp-bar-count">
                {cfg.defaultLimit.toLocaleString()}
                {cfg.comingSoon && <span className="pp-bar-tag">Soon</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="pp-faq">
        <h2>Pricing Questions</h2>
        <div className="pp-faq-list">
          <div className="pp-faq-item">
            <dt>Is this a subscription or one-time payment?</dt>
            <dd>One-time payment. You pay once and your campaign runs across all 3 waves. No recurring charges, no hidden fees.</dd>
          </div>
          <div className="pp-faq-item">
            <dt>What is the 3-wave drip campaign?</dt>
            <dd>Your resume is sent to recruiters on Day 1, with a follow-up on Day 4 and a final reminder on Day 8. This multi-touch approach significantly increases response rates vs a single email.</dd>
          </div>
          <div className="pp-faq-item">
            <dt>Can I upgrade after purchasing the free plan?</dt>
            <dd>Yes. You can purchase any paid plan at any time to reach more recruiters with a full 3-wave campaign.</dd>
          </div>
          <div className="pp-faq-item">
            <dt>When will the Power Plans be available?</dt>
            <dd>Professional, Growth, Advanced and Premium plans are launching soon. Start with the free plan now and you will be notified as soon as they go live.</dd>
          </div>
          <div className="pp-faq-item">
            <dt>Are the recruiters verified?</dt>
            <dd>Yes. Every recruiter in our network is manually verified. We do not send to generic company inboxes or unverified contacts.</dd>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="pp-cta">
        <h2>Not Sure Which Plan?</h2>
        <p>Start free with 11 recruiters. Upgrade anytime if you want more reach.</p>
        <div className="pp-cta-buttons">
          <button className="cta-button large" onClick={onGetStarted}>Start Free Today</button>
          <Link to="/how-it-works" className="pp-secondary-btn">See How It Works →</Link>
        </div>
      </div>

    </div>
  )
}

export default PricingPage