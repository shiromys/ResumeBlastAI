import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageMeta from '../components/SEO/PageMeta'
import './ThankYouPage.css'

const PLAN_LABELS = {
  free:         'Free Plan',
  starter:      'Starter Plan',
  basic:        'Basic Plan',
  professional: 'Professional Plan',
  growth:       'Growth Plan',
  advanced:     'Advanced Plan',
  premium:      'Premium Plan',
}

const AUTO_REDIRECT_SECONDS = 6

function ThankYouPage() {
  const navigate = useNavigate()
  const [planLabel, setPlanLabel] = useState('Your Plan')
  const [secondsLeft, setSecondsLeft] = useState(AUTO_REDIRECT_SECONDS)

  const continueToWorkbench = () => {
    navigate(`/workbench${window.location.search}`, { replace: true })
  }

  useEffect(() => {
    window.scrollTo(0, 0)

    // Display-only — the actual campaign launch reads this same localStorage
    // data independently in PaymentBlastTrigger, which keeps running in the
    // background regardless of this page. We never touch or clear it here.
    try {
      const savedConfig = localStorage.getItem('pending_blast_config')
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig)
        if (parsed?.plan && PLAN_LABELS[parsed.plan]) {
          setPlanLabel(PLAN_LABELS[parsed.plan])
        }
      }
    } catch (e) {
      // Non-blocking — just falls back to the generic label
    }
  }, [])

  useEffect(() => {
    if (secondsLeft <= 0) {
      continueToWorkbench()
      return
    }
    const timer = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft])

  return (
    <div className="thankyou-page">
      <PageMeta
        title="Payment Successful | ResumeBlast.ai"
        description="Your payment was successful — your ResumeBlast.ai campaign is being set up."
        noindex
      />

      <div className="thankyou-card">
        <div className="thankyou-check-circle">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>

        <h1 className="thankyou-title">Payment Successful!</h1>
        <p className="thankyou-subtitle">
          Thank you for choosing ResumeBlast.AI. Your resume is about to start reaching verified recruiters.
        </p>

        <div className="thankyou-summary">
          <div className="thankyou-summary-row">
            <span>Plan</span>
            <span className="thankyou-summary-value">{planLabel}</span>
          </div>
          <div className="thankyou-summary-row">
            <span>Receipt</span>
            <span className="thankyou-summary-value">Sent to your email</span>
          </div>
        </div>

        <button className="thankyou-continue-btn" onClick={continueToWorkbench}>
          Continue to My Campaign
        </button>

        <p className="thankyou-redirect-note">
          Redirecting automatically in {secondsLeft} second{secondsLeft === 1 ? '' : 's'}…
        </p>
      </div>
    </div>
  )
}

export default ThankYouPage