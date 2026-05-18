// frontend/src/pages/PricingPage.jsx
//
// NEW dedicated page at /pricing
// SEO BENEFIT: Google can now crawl and rank this page independently
// for keywords like "resume blast pricing", "AI recruiter outreach cost",
// "how much does resume distribution cost", "resume blast free plan"
//
// Previously pricing only existed as a scroll section on the homepage.

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { initiateCheckout } from '../services/paymentService'
import PageMeta from '../components/SEO/PageMeta'
import './PricingPage.css'

const PLAN_CONFIG = {
  free: {
    label: 'Free',
    price: '$0',
    defaultCents: 0,
    defaultLimit: 11,
    badge: null,
    description: 'Perfect to get started and test the platform.',
    features: [
      '11 verified recruiters',
      'AI resume analysis',
      'Guaranteed email delivery',
      'Professional email template',
      'Email support',
    ],
  },
  starter: {
    label: 'Starter',
    price: '$9.99',
    defaultCents: 999,
    defaultLimit: 250,
    badge: null,
    description: 'Ideal for active job seekers who want real reach.',
    features: [
      '250 verified recruiters',
      'AI resume analysis',
      '3-wave drip campaign',
      'Industry-specific recruiter list',
      'Regular support',
      'Guaranteed email delivery',
    ],
  },
  basic: {
    label: 'Basic',
    price: '$14.99',
    defaultCents: 1499,
    defaultLimit: 500,
    badge: 'MOST POPULAR',
    description: 'Maximum exposure for serious job seekers.',
    features: [
      '500 verified recruiters',
      'AI resume analysis',
      'Curated resume score',
      '3-wave drip campaign',
      'Industry-specific recruiter list',
      'Guaranteed email delivery',
      'Support response within 24 hours',
    ],
  },
}

function PricingPage({ onGetStarted, user }) {

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const handlePlanSelection = async (planKey) => {
    if (planKey === 'free' || user) { onGetStarted(); return }
    try {
      let guestId = localStorage.getItem('rb_guest_tracker_id')
      if (!guestId) {
        guestId = 'guest_' + Date.now()
        localStorage.setItem('rb_guest_tracker_id', guestId)
      }
      localStorage.setItem('is_guest_session', 'true')
      localStorage.setItem('selected_plan_type', planKey)
      const cfg = PLAN_CONFIG[planKey]
      await initiateCheckout({
        email: 'guest@resumeblast.ai',
        id: guestId,
        plan: planKey,
        disclaimer_accepted: true,
        priceCents: cfg.defaultCents,
      })
    } catch (err) {
      console.error('Payment failed:', err)
    }
  }

  return (
    <div className="pricing-page">

      {/* SEO metadata */}
      <PageMeta
        title="Pricing | AI Recruiter Outreach Plans — ResumeBlast.ai"
        description="ResumeBlast.ai plans start free. Reach 11 recruiters at $0, 250 recruiters at $9.99, or 500 recruiters at $14.99. AI-powered 3-wave drip campaign included."
        canonical="https://www.resumeblast.ai/pricing"
      />

      {/* Header */}
      <div className="pp-header">
        <p className="pp-label">Simple Pricing</p>
        <h1 className="pp-title">Start Free. Scale When You're Ready.</h1>
        <p className="pp-subtitle">
          Every plan includes AI resume analysis and direct recruiter delivery.
          Paid plans add the 3-wave drip campaign for maximum response rates.
        </p>
      </div>

      {/* Plan cards */}
      <div className="pp-cards-wrapper">
        <div className="pp-cards">

          {/* Free plan */}
          <div className="pp-card">
            <div className="pp-card-header">
              <h2 className="pp-plan-name">{PLAN_CONFIG.free.label}</h2>
              <div className="pp-price">
                <span className="pp-price-main">$0</span>
                <span className="pp-price-period">forever</span>
              </div>
              <p className="pp-plan-desc">{PLAN_CONFIG.free.description}</p>
            </div>
            <button
              className="pp-btn pp-btn-outline"
              onClick={() => handlePlanSelection('free')}
            >
              Start for Free
            </button>
            <ul className="pp-features">
              {PLAN_CONFIG.free.features.map((f, i) => (
                <li key={i}><span className="pp-check">✓</span>{f}</li>
              ))}
            </ul>
          </div>

          {/* Starter plan */}
          <div className="pp-card">
            <div className="pp-card-header">
              <h2 className="pp-plan-name">{PLAN_CONFIG.starter.label}</h2>
              <div className="pp-price">
                <span className="pp-price-main">$9.99</span>
                <span className="pp-price-period">one-time</span>
              </div>
              <p className="pp-plan-desc">{PLAN_CONFIG.starter.description}</p>
            </div>
            <button
              className="pp-btn pp-btn-primary"
              onClick={() => handlePlanSelection('starter')}
            >
              Get Starter
            </button>
            <ul className="pp-features">
              {PLAN_CONFIG.starter.features.map((f, i) => (
                <li key={i}><span className="pp-check">✓</span>{f}</li>
              ))}
            </ul>
          </div>

          {/* Basic plan */}
          <div className="pp-card pp-card-featured">
            <div className="pp-badge">MOST POPULAR</div>
            <div className="pp-card-header">
              <h2 className="pp-plan-name">{PLAN_CONFIG.basic.label}</h2>
              <div className="pp-price">
                <span className="pp-price-main">$14.99</span>
                <span className="pp-price-period">one-time</span>
              </div>
              <p className="pp-plan-desc">{PLAN_CONFIG.basic.description}</p>
            </div>
            <button
              className="pp-btn pp-btn-primary"
              onClick={() => handlePlanSelection('basic')}
            >
              Get Basic
            </button>
            <ul className="pp-features">
              {PLAN_CONFIG.basic.features.map((f, i) => (
                <li key={i}><span className="pp-check pp-check-white">✓</span>{f}</li>
              ))}
            </ul>
          </div>

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
            <dd>Yes. You can purchase Starter or Basic at any time to reach more recruiters with a full 3-wave campaign.</dd>
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
          <button className="cta-button large" onClick={onGetStarted}>
            Start Free Today
          </button>
          <Link to="/how-it-works" className="pp-secondary-btn">
            See How It Works →
          </Link>
        </div>
      </div>

    </div>
  )
}

export default PricingPage
