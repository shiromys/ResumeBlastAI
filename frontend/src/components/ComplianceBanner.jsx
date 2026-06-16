// src/components/ComplianceBanner.jsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './ComplianceBanner.css'

function ComplianceBanner() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Check if the user has already accepted the compliance notice
    const hasAccepted = localStorage.getItem('compliance_acknowledged')
    if (!hasAccepted) {
      setIsVisible(true)
    }
  }, [])

  // ✅ ADDED: Accept — enables GTM (GT-5TPPGPSVX) and GA4 (G-6NHVZMSX04) tracking
  const handleAccept = () => {
    localStorage.setItem('compliance_acknowledged', 'true')
    localStorage.setItem('analytics_consent', 'granted')
    setIsVisible(false)

    // Update GTM + GA4 consent to granted
    if (window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage:        'granted',
      })
    }

    // Push consent event to GTM dataLayer (GT-5TPPGPSVX)
    if (window.dataLayer) {
      window.dataLayer.push({
        event:        'consent_given',
        consent_type: 'accepted',
      })
    }
  }

  // ✅ ADDED: Reject — disables GTM (GT-5TPPGPSVX) and GA4 (G-6NHVZMSX04) tracking
  const handleReject = () => {
    localStorage.setItem('compliance_acknowledged', 'true')
    localStorage.setItem('analytics_consent', 'denied')
    setIsVisible(false)

    // Update GTM + GA4 consent to denied
    if (window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage:        'denied',
      })
    }

    // Push consent event to GTM dataLayer (GT-5TPPGPSVX)
    if (window.dataLayer) {
      window.dataLayer.push({
        event:        'consent_given',
        consent_type: 'rejected',
      })
    }
  }

  if (!isVisible) return null

  return (
    <div className="compliance-banner">
      <div className="compliance-content">
        <div className="compliance-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
        </div>
        <div className="compliance-text">
          <p>
            <strong className="text-white">Compliance & Privacy Notice:</strong> ResumeBlast.ai is a distribution platform. 
            In compliance with FTC guidelines, we make <strong className="text-white">no guarantees</strong> of employment or interviews. 
            We operate strictly under equal opportunity principles (<strong className="text-white">29 CFR § 1625.2</strong>) with no age-based filtering. 
            To ensure <strong className="text-white">GDPR compliance</strong>, we practice transient processing with no 
            permanent storage of your resume. By using our service, you agree to our <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </div>
      <div className="compliance-actions">
        {/* ✅ CHANGED: onClick now calls handleReject instead of handleDismiss */}
        <button className="compliance-btn-outline" onClick={handleReject}>
          Reject Optional
        </button>
        {/* ✅ CHANGED: onClick now calls handleAccept instead of handleDismiss */}
        <button className="compliance-btn" onClick={handleAccept}>
          Accept All
        </button>
      </div>
    </div>
  )
}

export default ComplianceBanner