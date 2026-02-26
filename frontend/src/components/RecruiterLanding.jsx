// src/components/RecruiterLanding.jsx
import { useState } from 'react'
import './LandingPage.css'
import EmployerNetworkBanner from './EmployerNetworkBanner'

function RecruiterLanding({ onBackToJobSeeker, onLogin, onViewChange }) { 
  return (
    <div className="landing-page">
      {/* Recruiter Hero Section */}
      <section className="hero" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="hero-content">
          <h1>Hire Smarter. Connect Directly.</h1>
          <p className="tagline">Skip crowded job boards and long application cycles.</p>
          <p className="subtitle">
            Instead of posting on job boards and waiting, ResumeBlast.ai lets you directly engage with job seekers who are ready to work.
          </p>
          
          <div className="cta-container">
            {/* ✅ CHANGED: CTA Text updated to strictly say Log In */}
            <button className="cta-button large" onClick={onLogin}>
              Recruiter Log In
            </button>
          </div>
          
          <p className="trust-badge" style={{ marginTop: '20px' }}>
             Connect with motivated candidates and streamline your hiring process.
          </p>
        </div>
      </section>

      {/* Employer Network popup banner */}
      <EmployerNetworkBanner
        onNavigateToEmployerNetwork={() => onViewChange && onViewChange('employer-network')}
      />
    </div>
  )
}

export default RecruiterLanding