// frontend/src/pages/HowItWorksPage.jsx
//
// NEW dedicated page at /how-it-works
// SEO BENEFIT: Google can now crawl, index and rank this page
// independently for keywords like "how does resume blast work",
// "how to send resume to recruiters automatically", "3-wave drip campaign"
//
// Previously this content only existed as a scroll section on the homepage —
// Google could not give it its own ranking or link to it directly.

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PageMeta from '../components/SEO/PageMeta'
import './HowItWorksPage.css'

function HowItWorksPage({ onGetStarted }) {

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="hiw-page">

      {/* SEO metadata — unique title and description for this page */}
      <PageMeta
        title="How It Works | AI-Powered 3-Wave Recruiter Outreach — ResumeBlast.ai"
        description="See how ResumeBlast.ai sends your resume directly to verified recruiters in 4 simple steps. Upload, AI analysis, 3-wave drip campaign, and real-time tracking."
        canonical="https://www.resumeblast.ai/how-it-works"
      />

      {/* Page header */}
      <div className="hiw-header">
        <p className="hiw-label">Simple Process</p>
        <h1 className="hiw-title">How ResumeBlast.ai Works</h1>
        <p className="hiw-subtitle">
          From resume upload to recruiter inbox — automatically, in 4 steps
        </p>
      </div>

      {/* Steps */}
      <div className="hiw-steps-wrapper">
        <div className="hiw-steps">

          <div className="hiw-step">
            <div className="hiw-step-number">1</div>
            <div className="hiw-step-icon">📄</div>
            <h2 className="hiw-step-title">Upload Your Resume</h2>
            <p className="hiw-step-desc">
              Upload your resume in PDF, DOCX or TXT format. No rewriting or
              reformatting required. Our system accepts your resume exactly as it is.
            </p>
          </div>

          <div className="hiw-connector">→</div>

          <div className="hiw-step">
            <div className="hiw-step-number">2</div>
            <div className="hiw-step-icon">🤖</div>
            <h2 className="hiw-step-title">AI Analysis</h2>
            <p className="hiw-step-desc">
              Claude AI (by Anthropic) scans your resume to detect your target role,
              seniority level, and best-fit industry. It then matches you to the most
              relevant verified recruiters in our network.
            </p>
          </div>

          <div className="hiw-connector">→</div>

          <div className="hiw-step">
            <div className="hiw-step-number">3</div>
            <div className="hiw-step-icon">📧</div>
            <h2 className="hiw-step-title">3-Wave Drip Campaign</h2>
            <p className="hiw-step-desc">
              Your resume is sent in three strategic waves — Day 1 introduction,
              Day 4 follow-up, Day 8 final reminder. This multi-touch approach
              dramatically increases recruiter response rates vs a single email.
            </p>
          </div>

          <div className="hiw-connector">→</div>

          <div className="hiw-step">
            <div className="hiw-step-number">4</div>
            <div className="hiw-step-icon">📊</div>
            <h2 className="hiw-step-title">Track Results</h2>
            <p className="hiw-step-desc">
              Your real-time dashboard shows delivered, opened, clicked, and bounced
              emails across all 3 waves — so you always know exactly how your campaign
              is performing.
            </p>
          </div>

        </div>
      </div>

      {/* Wave timeline detail */}
      <div className="hiw-timeline">
        <h2 className="hiw-timeline-title">The 3-Wave Recruiter Drip Campaign</h2>
        <p className="hiw-timeline-sub">
          Your unique competitive advantage — no other resume service does this
        </p>
        <div className="hiw-waves">
          <div className="hiw-wave">
            <div className="hiw-wave-badge">Wave 1</div>
            <div className="hiw-wave-day">Day 1</div>
            <h3>First Impression</h3>
            <p>
              Professional introductory email sent to all matched recruiters.
              Your resume is attached and your key skills are highlighted.
            </p>
          </div>
          <div className="hiw-wave">
            <div className="hiw-wave-badge">Wave 2</div>
            <div className="hiw-wave-day">Day 4</div>
            <h3>Strategic Follow-Up</h3>
            <p>
              A personalised follow-up goes to recruiters who have not yet responded,
              keeping you top-of-mind without any manual effort from you.
            </p>
          </div>
          <div className="hiw-wave">
            <div className="hiw-wave-badge">Wave 3</div>
            <div className="hiw-wave-day">Day 8</div>
            <h3>Final Touchpoint</h3>
            <p>
              A concise final reminder closes the campaign loop, giving recruiters
              one last opportunity to engage before the wave ends.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="hiw-cta">
        <h2>Ready to Start Your Recruiter Outreach?</h2>
        <p>Join thousands of job seekers who skipped the job board queue.</p>
        <div className="hiw-cta-buttons">
          <button className="cta-button large" onClick={onGetStarted}>
            Start Free — 11 Recruiters
          </button>
          <Link to="/pricing" className="hiw-secondary-btn">
            View Pricing Plans →
          </Link>
        </div>
      </div>

    </div>
  )
}

export default HowItWorksPage