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

          <div className="footer-socials">
            <a href="https://www.linkedin.com/search/results/all/?keywords=ResumeBlast.ai&origin=ENTITY_SEARCH_HOME_HISTORY&heroEntityKey=urn%3Ali%3Aorganization%3A124783971&position=0" target="_blank" rel="noopener noreferrer" className="social-icon" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/></svg>
            </a>
            <a href="https://x.com/ResumeBlastAI" target="_blank" rel="noopener noreferrer" className="social-icon" aria-label="X (Twitter)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.66l7.73-8.84L1.23 2.25H8.06l4.71 6.23 5.47-6.23zm-1.16 17.52h1.83L7.01 4.13H5.05L17.08 19.77z"/></svg>
            </a>
            <a href="https://www.instagram.com/resumeblast_ai/" target="_blank" rel="noopener noreferrer" className="social-icon" aria-label="Instagram">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 1.44c-3.14 0-3.51.01-4.75.07-1.15.05-1.77.24-2.19.4-.55.22-.94.47-1.35.88-.41.41-.66.8-.88 1.35-.16.42-.35 1.04-.4 2.19-.06 1.24-.07 1.61-.07 4.75s.01 3.51.07 4.75c.05 1.15.24 1.77.4 2.19.22.55.47.94.88 1.35.41.41.8.66 1.35.88.42.16 1.04.35 2.19.4 1.24.06 1.61.07 4.75.07s3.51-.01 4.75-.07c1.15-.05 1.77-.24 2.19-.4.55-.22.94-.47 1.35-.88.41-.41.66-.8.88-1.35.16-.42.35-1.04.4-2.19.06-1.24.07-1.61.07-4.75s-.01-3.51-.07-4.75c-.05-1.15-.24-1.77-.4-2.19a3.6 3.6 0 0 0-.88-1.35 3.6 3.6 0 0 0-1.35-.88c-.42-.16-1.04-.35-2.19-.4-1.24-.06-1.61-.07-4.75-.07zm0 2.45a5.95 5.95 0 1 1 0 11.9 5.95 5.95 0 0 1 0-11.9zm0 9.81a3.86 3.86 0 1 0 0-7.72 3.86 3.86 0 0 0 0 7.72zm7.58-10.05a1.39 1.39 0 1 1-2.78 0 1.39 1.39 0 0 1 2.78 0z"/></svg>
            </a>
            <a href="https://www.pinterest.com/Resumeblast/" target="_blank" rel="noopener noreferrer" className="social-icon" aria-label="Pinterest">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.16 9.42 7.62 11.17-.1-.95-.2-2.4.04-3.44.22-.93 1.4-5.95 1.4-5.95s-.36-.72-.36-1.78c0-1.67.97-2.92 2.17-2.92 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-1 4-.28 1.2.6 2.17 1.78 2.17 2.14 0 3.78-2.26 3.78-5.51 0-2.88-2.07-4.9-5.03-4.9-3.42 0-5.43 2.57-5.43 5.22 0 1.03.4 2.14.9 2.74.1.12.11.22.08.34l-.33 1.37c-.05.22-.18.27-.4.16-1.5-.7-2.44-2.89-2.44-4.65 0-3.79 2.75-7.26 7.93-7.26 4.16 0 7.4 2.97 7.4 6.93 0 4.14-2.61 7.47-6.23 7.47-1.22 0-2.36-.63-2.75-1.38l-.75 2.85c-.27 1.04-1 2.35-1.49 3.15C9.57 23.8 10.76 24 12 24c6.63 0 12-5.37 12-12S18.63 0 12 0z"/></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer