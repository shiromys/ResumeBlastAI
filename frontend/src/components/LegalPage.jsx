// src/components/LegalPage.jsx
import './LegalPage.css'

function LegalPage({ type, onBack }) {
  const renderContent = () => {
    switch (type) {
      case 'privacy':
        return (
          <>
            <h1>Privacy Policy</h1>
            <p className="effective-date">Effective Date: October 26, 2025</p>
            
            <p>ResumeBlast.ai ("ResumeBlast", "we", "our", or "us") is operated by <strong>Shiro Technologies LLC</strong>, 5080 Spectrum Drive, Suite 575 E, Addison, TX 75001, United States.</p>
            <p>This Privacy Policy describes how we collect, use, disclose, and protect personal information when you access or use https://resumeblast.ai (the "Service"). By using the Service, you consent to this Privacy Policy.</p>

            <hr />

            <h2>1. Information We Collect</h2>
            <h3>1.1 Information You Provide</h3>
            <ul>
              <li>Full name, email address, phone number</li>
              <li>Resume/CV content and professional history</li>
              <li>Account credentials</li>
              <li>Communications with us</li>
              <li>Payment confirmation data (payment information is processed by third-party processors; we do not store card numbers)</li>
            </ul>

            <h3>1.2 Automatically Collected Information</h3>
            <ul>
              <li>IP address and approximate geolocation</li>
              <li>Browser, device, and operating system details</li>
              <li>Usage data, logs, timestamps, and interaction history</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>

            <hr />

            <h2>2. Purpose and Legal Basis for Processing</h2>
            <p>We process personal data for the following purposes:</p>
            <ul>
              <li>Providing resume distribution services</li>
              <li>Delivering resumes to recruiters and employers <strong>within the United States only</strong></li>
              <li>Account authentication and payment processing</li>
              <li>Fraud prevention, abuse detection, and chargeback defense</li>
              <li>Platform improvement, analytics, and security</li>
              <li>Legal and regulatory compliance</li>
            </ul>
            <p>Legal bases include user consent, contractual necessity, and legitimate business interests.</p>

            <hr />

            <h2>3. Resume Distribution Authorization</h2>
            <p>By using ResumeBlast.ai, you <strong>explicitly authorize</strong> ResumeBlast.ai to distribute your resume and related professional information to third-party recruiters, employers, and hiring platforms located in the United States.</p>
            <p>You acknowledge and agree:</p>
            <ul>
              <li>Resume distribution does <strong>not</strong> guarantee interviews, responses, employment, sponsorship, or immigration benefits</li>
              <li>Recruiters and employers act independently and are outside our control</li>
            </ul>

            <hr />

            <h2>4. Data Sharing</h2>
            <p>We may share information with:</p>
            <ul>
              <li>Recruiters and employers (core service functionality)</li>
              <li>Infrastructure, analytics, hosting, and payment providers</li>
              <li>Government or legal authorities when required by law</li>
            </ul>
            <p>We do <strong>not</strong> sell personal information.</p>

            <hr />

            <h2>5. CCPA Notice (California Residents)</h2>
            <p>California residents may request:</p>
            <ul>
              <li>Disclosure of personal data collected</li>
              <li>Deletion of personal data (subject to legal, contractual, and dispute-retention requirements)</li>
              <li>Confirmation that we do not sell personal data</li>
            </ul>
            <p>Requests: <strong>info@resumeblast.ai</strong></p>

            <hr />

            <h2>6. GDPR-Lite Disclosure (EEA Users)</h2>
            <p>If you are located in the EEA:</p>
            <ul>
              <li>Data may be transferred to and processed in the United States</li>
              <li>Legal bases include consent and legitimate interest</li>
              <li>You may request access, correction, or deletion of data</li>
            </ul>
            <p>Use of the Service constitutes consent to international data transfer.</p>

            <hr />

            <h2>7. Data Retention</h2>
            <p>We retain data as necessary for:</p>
            <ul>
              <li>Service delivery</li>
              <li>Fraud prevention and chargeback defense</li>
              <li>Legal and regulatory obligations</li>
            </ul>

            <hr />

            <h2>8. Security</h2>
            <p>We use commercially reasonable administrative, technical, and organizational safeguards. However, no system can guarantee absolute security.</p>

            <hr />

            <h2>9. Children’s Privacy</h2>
            <p>The Service is not intended for individuals under 18 years of age.</p>

            <hr />

            <h2>10. Policy Updates</h2>
            <p>We may update this Privacy Policy at any time. Continued use constitutes acceptance.</p>

            <hr />

            <h2>11. Contact</h2>
            <p><strong>Shiro Technologies LLC</strong><br />Email: <strong>info@resumeblast.ai</strong></p>
          </>
        )
      
      case 'terms':
        return (
          <>
            <h1>Terms of Service</h1>
            <p className="effective-date">Effective Date: October 26, 2025</p>
            <p>These Terms of Service ("Terms") govern your use of ResumeBlast.ai (the "Service"), operated by <strong>Shiro Technologies LLC</strong>.</p>
            <p>By accessing or using the Service, you agree to these Terms.</p>

            <hr />

            <h2>1. Nature of Service</h2>
            <p>ResumeBlast.ai is a paid Software-as-a-Service (SaaS) platform that distributes user-submitted resumes to recruiters and employers within the United States.</p>
            <p>The Service provides <strong>resume exposure only</strong> and is not an employment agency, recruiter, or staffing firm.</p>

            <hr />

            <h2>2. No Employment, Immigration, or Sponsorship Guarantee</h2>
            <p>ResumeBlast.ai does <strong>not</strong> guarantee:</p>
            <ul>
              <li>Interviews or job offers</li>
              <li>Employment outcomes</li>
              <li>Immigration sponsorship or work authorization (OPT, STEM OPT, H‑1B, Green Card, etc.)</li>
            </ul>
            <p>Users are solely responsible for verifying eligibility to work in the United States.</p>

            <hr />

            <h2>3. Payments, Final Sale, and No Refunds</h2>
            <p>All payments are <strong>final and non-refundable</strong>.</p>
            <p>By completing a purchase, you acknowledge:</p>
            <ul>
              <li>Services are deemed delivered once processing begins</li>
              <li>No refunds or credits will be issued under any circumstances</li>
              <li>Unused services are forfeited</li>
            </ul>

            <hr />

            <h2>4. Chargebacks and Dispute Defense</h2>
            <p>To prevent fraud and abuse:</p>
            <ul>
              <li>System logs, timestamps, IP data, and delivery records are retained</li>
              <li>Chargebacks may be disputed with payment processors using service evidence</li>
              <li>Fraudulent disputes may result in permanent account termination</li>
            </ul>

            <hr />

            <h2>5. User Representations</h2>
            <p>You represent and warrant that:</p>
            <ul>
              <li>All information provided is accurate and lawful</li>
              <li>You have the right to distribute submitted resume content</li>
              <li>You will not misuse recruiter communications</li>
              <li>You will not impersonate any individual or entity</li>
            </ul>

            <hr />

            <h2>6. Suspension and Termination</h2>
            <p>We may suspend or terminate access immediately for:</p>
            <ul>
              <li>Violation of these Terms</li>
              <li>Fraud, abuse, or misrepresentation</li>
              <li>Misuse of the Service</li>
            </ul>

            <hr />

            <h2>7. Intellectual Property</h2>
            <p>All software, branding, and platform content are owned by Shiro Technologies LLC. Unauthorized use is prohibited.</p>

            <hr />

            <h2>8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law:</p>
            <ul>
              <li>We are not liable for indirect or consequential damages</li>
              <li>We are not responsible for recruiter or employer actions</li>
              <li>Total liability shall not exceed the amount paid for the Service</li>
            </ul>

            <hr />

            <h2>9. Disclaimer of Warranties</h2>
            <p>The Service is provided "AS IS" and "AS AVAILABLE" without warranties of any kind.</p>

            <hr />

            <h2>10. Indemnification</h2>
            <p>You agree to indemnify and hold harmless Shiro Technologies LLC from claims arising from your use of the Service.</p>

            <hr />

            <h2>11. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of Texas.</p>

            <hr />

            <h2>12. Changes</h2>
            <p>We may update these Terms at any time. Continued use constitutes acceptance.</p>

            <hr />

            <h2>13. Contact</h2>
            <p><strong>Shiro Technologies LLC</strong><br />Email: <strong>info@resumeblast.ai</strong></p>
          </>
        )

      case 'refund':
        return (
          <>
            <h1>Refund Policy</h1>
            <p className="effective-date">Effective Date: October 26, 2025</p>
            <p>ResumeBlast.ai is operated by <strong>Shiro Technologies LLC</strong>.</p>

            <hr />

            <h2>No Refund Policy</h2>
            <p>All purchases made on ResumeBlast.ai are <strong>final and non-refundable</strong>.</p>
            <p>By purchasing our services, you agree:</p>
            <ul>
              <li>No refunds will be issued for any reason</li>
              <li>Unused or partially used services are not refundable</li>
              <li>Dissatisfaction with results does not constitute grounds for a refund</li>
              <li>Resume distribution begins immediately upon purchase</li>
            </ul>

            <hr />

            <h2>Chargebacks</h2>
            <p>Unauthorized chargebacks or payment disputes may result in:</p>
            <ul>
              <li>Immediate suspension or termination of access</li>
              <li>Permanent restriction from future services</li>
            </ul>

            <hr />

            <h2>Contact</h2>
            <p>For questions related to this policy:<br /><strong>info@resumeblast.ai</strong></p>
          </>
        )

      default:
        return <p>Document not found.</p>
    }
  }

  return (
    <div className="legal-page">
      <div className="legal-container">
        <button className="back-button" onClick={onBack}>← Back</button>
        <div className="legal-content">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

export default LegalPage