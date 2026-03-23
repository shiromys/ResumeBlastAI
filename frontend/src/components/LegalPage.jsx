// src/components/LegalPage.jsx
import { useEffect } from 'react'
import './LegalPage.css'

function LegalPage({ type, onBack }) {
  
  // Scroll to top when page opens
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [type])

  // Reusable header component to match the uploaded image's design
  const DocumentHeader = ({ title, date }) => (
    <>
      <div className="document-header-block">
        <div className="document-icon-wrapper">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="document-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
        </div>
        <div className="document-title-group">
          <h1 className="document-title">{title}</h1>
          <p className="effective-date">Effective Date: {date}</p>
        </div>
      </div>
      <hr className="document-divider" />
    </>
  );

  const renderContent = () => {
    switch (type) {
      case 'privacy':
        return (
          <div className="document-body">
            <DocumentHeader title="Privacy Policy" date="March 18, 2026" />
            
            <p>ResumeBlast.ai (“we”, “our”, or “us”) is operated by <strong>Shiro Technologies LLC</strong>. This policy outlines our commitment to data protection standards including <strong>GDPR</strong>, <strong>FTC</strong>, and <strong>CCPA</strong> compliance.</p>

            <h2>1. Data Security & Encryption</h2>
            <p>We implement industry-standard technical safeguards to protect your information.</p>
            <ul>
              <li><strong>256-bit SSL Encryption:</strong> All data transmitted between your browser and our servers is secured using 256-bit SSL (Secure Sockets Layer) encryption.</li>
              <li><strong>Data at Rest:</strong> User resumes and personal identifiers are encrypted at rest using AES-256 protocols.</li>
            </ul>

            <h2>2. GDPR Compliance & "No Permanent Storage" Policy</h2>
            <p>To adhere to GDPR's Data Minimization and Storage Limitation principles:</p>
            <ul>
              <li><strong>Transient Processing:</strong> Resumes are stored only for the duration necessary to complete the distribution service.</li>
              <li><strong>Automatic Deletion:</strong> Once your "Resume Blast" is confirmed as delivered to the target recruiters/employers, your resume file is purged from our active processing servers within 30 days, unless a longer retention period is required for legal defense (e.g., chargeback evidence).</li>
              <li><strong>User Rights:</strong> EU/EEA residents have the right to access, rectify, or erase their data, and the right to data portability. Contact <strong>info@resumeblast.ai</strong> to exercise these rights.</li>
            </ul>

            <h2>3. FTC & Regulatory Compliance</h2>
            <ul>
              <li><strong>FTC Compliance:</strong> We adhere to FTC guidelines regarding unfair and deceptive practices by clearly stating that we are a distribution tool, not a guarantee of employment.</li>
              <li><strong>29 CFR § 1625.2:</strong> We comply with the Age Discrimination in Employment Act (ADEA). We do not use age-based filtering or discriminatory logic in our distribution algorithms, ensuring that no individual is discriminated against in any aspect of our service because they are 40 years of age or older.</li>
            </ul>

            <h2>4. Information We Collect</h2>
            <ul>
              <li><strong>Identifiers:</strong> Name, email, and phone number.</li>
              <li><strong>Professional Data:</strong> Resume/CV content.</li>
              <li><strong>Technical Data:</strong> IP address (for fraud prevention/FTC compliance) and 256-bit encrypted session logs.</li>
            </ul>
          </div>
        )
      
      case 'terms':
        return (
          <div className="document-body">
            <DocumentHeader title="Terms of Service" date="March 18, 2026" />

            <h2>1. Security Warranty</h2>
            <p>ResumeBlast.ai employs <strong>256-bit SSL encryption</strong> for all transactions and data uploads. While we use high-grade encryption to protect your data during transmission, you acknowledge that no transmission over the internet is 100% secure.</p>

            <h2>2. Equal Opportunity & Anti-Discrimination (29 CFR § 1625.2)</h2>
            <p>Shiro Technologies LLC operates in strict accordance with <strong>29 CFR § 1625.2</strong>.</p>
            <ul>
              <li>Our Service is a neutral conduit for resume distribution.</li>
              <li>We do not screen, sort, or prioritize resumes based on age or any other protected characteristic.</li>
              <li>Users are prohibited from using the Service to facilitate discriminatory hiring practices.</li>
            </ul>

            <h2>3. FTC Compliance & Nature of Service</h2>
            <p>In compliance with FTC consumer protection standards, we provide <strong>no guarantee</strong> of:</p>
            <ul>
              <li>Employment, interviews, or specific career outcomes.</li>
            </ul>
            <p>The Service is strictly a distribution platform. Any claims to the contrary are unauthorized.</p>

            <h2>4. GDPR Data Handling</h2>
            <p>By using the Service, you acknowledge that your data will be processed in the United States. We maintain a "GDPR-Lite" approach where data is deleted post-service fulfillment to minimize the footprint of stored personal information.</p>
          </div>
        )

      case 'refund':
        return (
          <div className="document-body">
            <DocumentHeader title="Disclaimer & Refund Policy" date="March 18, 2026" />

            <h2>1. "As-Is" Service</h2>
            <p>The Service is provided on an "as-is" basis. We utilize <strong>256-bit SSL encryption</strong> to protect your purchase, but we make no warranties regarding the specific response rate from third-party recruiters.</p>

            <h2>2. FTC-Mandated Refund Disclosure</h2>
            <ul>
              <li><strong>All Sales are Final:</strong> Because resume distribution begins immediately upon the initiation of our automated 256-bit encrypted workflow, the service is considered "consumed" at the point of purchase.</li>
              <li><strong>No Refunds:</strong> In accordance with FTC guidelines for digital SaaS products, refunds are not provided for dissatisfaction with employer response rates or general job market conditions.</li>
            </ul>

            <h2>Summary of Compliance Badges Integrated:</h2>
            <ul>
              <li><strong>GDPR Compliant:</strong> Purpose-limited processing and automated data deletion.</li>
              <li><strong>FTC Compliant:</strong> Clear disclosures of service limitations and transparent refund terms.</li>
              <li><strong>29 CFR § 1625.2:</strong> Explicit commitment to age-neutral distribution.</li>
              <li><strong>256-bit SSL:</strong> Mentioned across all policies as the standard for data in transit.</li>
            </ul>
          </div>
        )

      default:
        return <p>Document not found.</p>
    }
  }

  return (
    <div className="legal-page">
      <div className="legal-nav-header">
        <div className="legal-nav-content">
          <button className="back-link" onClick={onBack}>
            ← Back
          </button>
          <span className="nav-title">ResumeBlast.ai Legal</span>
        </div>
      </div>
      <div className="legal-container">
        {renderContent()}
      </div>
    </div>
  )
}

export default LegalPage