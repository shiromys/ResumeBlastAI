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

  // Both buttons will dismiss the banner for now 
  // (You can add specific cookie tracking logic here later if needed)
  const handleDismiss = () => {
    localStorage.setItem('compliance_acknowledged', 'true')
    setIsVisible(false)
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
        <button className="compliance-btn-outline" onClick={handleDismiss}>
          Reject Optional
        </button>
        <button className="compliance-btn" onClick={handleDismiss}>
          Accept All
        </button>
      </div>
    </div>
  )
}

export default ComplianceBanner