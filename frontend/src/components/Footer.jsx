import { Link } from 'react-router-dom'
import './Footer.css'

function Footer({ onViewChange }) {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h4>ResumeBlast.ai</h4>
          <p>AI-powered resume distribution to help you land your dream job faster.</p>
        </div>
        <div className="footer-section">
          <h4>Product</h4>
          <a href="/#how-it-works" className="footer-link">How It Works</a>
          <a href="/#pricing" className="footer-link">Pricing</a>
        </div>
        <div className="footer-section">
          <h4>Legal</h4>
          <Link to="/privacy" className="footer-link">Privacy Policy</Link>
          <Link to="/terms" className="footer-link">Terms of Service</Link>
          <Link to="/refund" className="footer-link">Refund Policy</Link>
        </div>
        <div className="footer-section">
          <h4>Contact</h4>
          <a href="mailto:info@resumeblast.ai" className="footer-link">
            info@resumeblast.ai
          </a>
          <a href="tel:8009718013" className="footer-link">
            (800)971-8013
          </a>
          <div style={{marginTop:'12px',color:'#D1D5DB',fontSize:'14px',lineHeight:'1.5'}}>
            <strong>Address:</strong><br />
            5080 Spectrum Drive,<br />
            Suite 575E, Addison TX 75001
          </div>
          <p style={{marginTop:'15px',color:'#9CA3AF',fontSize:'14px'}}>
            © 2026 ResumeBlast.ai - All rights reserved
          </p>
        </div>
        <div className="footer-section">
          <h4>Find Us On</h4>
          <a href="https://www.producthunt.com/products/resumeblast-ai?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-resumeblast-ai" target="_blank" rel="noopener noreferrer">
            <img alt="ResumeBlast.ai - Send your resume to verified recruiters, automatically | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1168341&theme=light&t=1781173764490" />
          </a>
        </div>
      </div>
    </footer>
  )
}

export default Footer