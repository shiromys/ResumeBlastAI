// src/components/RecruiterLanding.jsx
// CHANGES FROM ORIGINAL:
//   1. Import EmployerNetworkBanner
//   2. Accept onViewChange prop (already passed from App.jsx via handleViewChange)
//   3. Render <EmployerNetworkBanner onNavigateToEmployerNetwork={...} />
//   ALL OTHER LOGIC IS COMPLETELY UNTOUCHED
import { useState } from 'react'
import './LandingPage.css'
import EmployerNetworkBanner from './EmployerNetworkBanner' // ✅ NEW

function RecruiterLanding({ onBackToJobSeeker, onLogin, onViewChange }) { // ✅ added onViewChange
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
            <button className="cta-button large" onClick={onLogin}>
              Register or Log In
            </button>
          </div>
          
          <p className="trust-badge" style={{ marginTop: '20px' }}>
             Connect with motivated candidates and streamline your hiring process.
          </p>
        </div>
      </section>

      {/* ✅ NEW: Employer Network popup banner */}
      <EmployerNetworkBanner
        onNavigateToEmployerNetwork={() => onViewChange && onViewChange('employer-network')}
      />
    </div>
  )
}

export default RecruiterLanding