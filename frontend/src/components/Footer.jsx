import './Footer.css'

function Footer({ onViewChange }) {
  const handleScrollOrNav = (sectionId) => {
    // Navigate to home first if we are on a different page (like admin or legal)
    if (onViewChange) {
      onViewChange('jobseeker-home')
    }
    
    // Scroll to section after a brief delay to allow page load
    setTimeout(() => {
      const element = document.getElementById(sectionId)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    }, 100)
  }

  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h4>ResumeBlast.ai</h4>
          <p>AI-powered resume distribution to help you land your dream job faster.</p>
        </div>
        <div className="footer-section">
          <h4>Product</h4>
          <button onClick={() => handleScrollOrNav('how-it-works')} className="footer-link">
            How It Works
          </button>
          <button onClick={() => handleScrollOrNav('pricing')} className="footer-link">
            Pricing
          </button>
        </div>
        <div className="footer-section">
          <h4>Legal</h4>
          {/* ✅ NAVIGATION LINKS */}
          <button onClick={() => onViewChange('privacy')} className="footer-link">
            Privacy Policy
          </button>
          <button onClick={() => onViewChange('terms')} className="footer-link">
            Terms of Service
          </button>
          <button onClick={() => onViewChange('refund')} className="footer-link">
            Refund Policy
          </button>
        </div>
        <div className="footer-section">
          <h4>Contact</h4>
          <a href="mailto:support@resumeblast.ai" className="footer-link">
            support@resumeblast.ai
          </a>
          <div style={{ marginTop: '12px', color: '#D1D5DB', fontSize: '14px', lineHeight: '1.5' }}>
            <strong>Address:</strong><br />
            5080 Spectrum Drive,<br />
            Suite 575E, Addison TX 75001
          </div>
          <p style={{ marginTop: '15px', color: '#9CA3AF', fontSize: '14px' }}>
            © 2025 ResumeBlast.ai - All rights reserved
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer