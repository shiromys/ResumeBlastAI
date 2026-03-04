// components/ResumeAnalysis.jsx
// ✅ FIXES:
//   1. Guest blast now always forwards stripe_session_id from URL
//   2. Guest disclaimer modal only shows when isGuest + isPaymentSuccess + resume analyzed
//   3. Registered user blast button only shows when !isPaymentSuccess (handled by PaymentBlastTrigger)
//   4. Blast button hides correctly post-payment for registered users

import { useState, useEffect } from 'react'
import Lottie from 'lottie-react'
import botAnimation from '../assets/bot-working.json'
import BlastConfig from './BlastConfig'
import { analyzeResumeForBlast, getSkillsByCategory, formatAllSkillsForDisplay } from '../utils/aiAnalyzer'
import { trackResumeAnalysis } from '../services/activityTrackingService'
import { saveGuestAnalysis } from '../services/guestTrackingService'
import { triggerEmailBlast } from '../services/blastService'
import './ResumeAnalysis.css'

function ResumeAnalysis({ user, isGuest, resumeText, resumeUrl, resumeId, isPaymentSuccess }) {
  const [analyzing, setAnalyzing]               = useState(false)
  const [analysis, setAnalysis]                 = useState(null)
  const [showBlastConfig, setShowBlastConfig]   = useState(false)
  const [showAllSkills, setShowAllSkills]        = useState(false)
  const [isBlasting, setIsBlasting]             = useState(false)
  const [guestDisclaimerAccepted, setGuestDisclaimerAccepted] = useState(false)
  const [blastComplete, setBlastComplete]       = useState(false)
  const [progress, setProgress]                 = useState(0)

  // ── Start Analysis automatically ───────────────────────────────────────────
  useEffect(() => {
    // Don't re-analyze if we're just restoring state after payment for registered users
    // (PaymentBlastTrigger handles the blast, ResumeAnalysis just shows the analysis)
    const isRestoredPostPayment = isPaymentSuccess && localStorage.getItem('pending_blast_resume_data')

    if (resumeText && !analysis && !isRestoredPostPayment) {
      runAnalysis()
    }

    // For guest post-payment: run analysis so they can proceed to blast
    if (resumeText && !analysis && isGuest && isPaymentSuccess) {
      runAnalysis()
    }
  }, [resumeText, isPaymentSuccess, isGuest])

  // ── Progress bar animation ─────────────────────────────────────────────────
  useEffect(() => {
    let interval
    if (analyzing) {
      setProgress(0)
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return 95
          const inc = prev < 30 ? 5 : prev < 70 ? 2 : 1
          return prev + inc
        })
      }, 150)
    }
    return () => clearInterval(interval)
  }, [analyzing])

  const runAnalysis = async () => {
    setAnalyzing(true)
    try {
      const result = await analyzeResumeForBlast(resumeText)
      setAnalysis(result)

      if (user && resumeId && !isGuest) {
        try { await trackResumeAnalysis(user.id, resumeId, result) } catch (e) { console.error(e) }
      }

      if (isGuest) {
        saveGuestAnalysis(result)
      }
    } catch (error) {
      console.error('Analysis failed', error)
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Guest blast — triggered after disclaimer accepted ─────────────────────
  const handleGuestBlast = async () => {
    if (isBlasting) return
    setIsBlasting(true)
    try {
      const pendingConfigStr = localStorage.getItem('pending_blast_config')
      const pendingConfig    = pendingConfigStr
        ? JSON.parse(pendingConfigStr)
        : { plan: 'starter', location: 'Remote' }

      const guestId   = localStorage.getItem('guest_id') || localStorage.getItem('guestId') || ''
      // ✅ Get stripe_session_id from URL params
      const urlParams = new URLSearchParams(window.location.search)
      const sessionId = urlParams.get('session_id') || ''

      const blastPayload = {
        plan_name:         pendingConfig.plan,
        user_id:           guestId,
        stripe_session_id: sessionId,    // ✅ Always forward
        resume_url:        resumeUrl,
        resume_name:       'Resume.pdf',
        candidate_name:    (analysis.candidate_name && analysis.candidate_name !== 'Not Found')
                             ? analysis.candidate_name
                             : 'Candidate',
        candidate_email:   (analysis.candidate_email && analysis.candidate_email !== 'Not Found')
                             ? analysis.candidate_email
                             : '',
        candidate_phone:   analysis.candidate_phone !== 'Not Found' ? (analysis.candidate_phone || '') : '',
        job_role:          analysis.detected_role || 'Professional',
        years_experience:  String(analysis.years_of_experience || 0),
        key_skills:        analysis.top_skills?.join(', ') || 'Professional Skills',
        location:          pendingConfig.location || 'Remote',
      }

      console.log('[ResumeAnalysis] Guest blast payload:', blastPayload)

      const result = await triggerEmailBlast(blastPayload)

      localStorage.removeItem('pending_blast_config')
      setGuestDisclaimerAccepted(true)
      setBlastComplete(true)

      alert(
        '🎉 Blast Initiated Successfully!\n\n' +
        `Your resume has been sent to ${result.successful_sends || 0} recruiters.\n` +
        'Watch your email inbox for recruiter replies!'
      )

      // Guest goes to homepage after blast
      window.location.href = '/'

    } catch (error) {
      console.error('[ResumeAnalysis] Guest blast error:', error)
      alert('There was an error initiating the blast. Please contact support.')
    } finally {
      setIsBlasting(false)
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────
  if (analyzing) {
    return (
      <div className="analysis-loading">
        <div style={{ width: 150, height: 150, margin: '0 auto' }}>
          <Lottie animationData={botAnimation} loop={true} />
        </div>
        <h3>🤖 AI is performing comprehensive resume analysis...</h3>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '10px', marginBottom: '20px' }}>
          Extracting all skills, calculating Our Score, and analyzing your profile
        </p>
        <div style={{ width: '100%', maxWidth: '350px', margin: '0 auto' }}>
          <div style={{
            width: '100%', height: '8px', backgroundColor: '#e5e7eb',
            borderRadius: '10px', overflow: 'hidden', marginBottom: '8px'
          }}>
            <div style={{
              width: `${progress}%`, height: '100%', backgroundColor: '#3b82f6',
              borderRadius: '10px', transition: 'width 0.2s ease-in-out'
            }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '12px', color: '#6b7280', fontWeight: '500'
          }}>
            <span>Processing...</span>
            <span>{progress}%</span>
          </div>
        </div>
      </div>
    )
  }

  // Registered user returning from payment — PaymentBlastTrigger overlay takes over
  if (!analysis && !isGuest) return null

  // Guest returning from payment — still analyzing
  if (!analysis) return (
    <div className="analysis-loading">
      <p style={{ color: '#6b7280' }}>Preparing your analysis...</p>
    </div>
  )

  const skillCategories = getSkillsByCategory(analysis.all_skills || {})
  const allSkillsFlat   = formatAllSkillsForDisplay(analysis.all_skills || {})

  // ── Should guest disclaimer modal show? ───────────────────────────────────
  // Show when: guest + payment returned + analysis done + not yet blasted
  const showGuestDisclaimer = isGuest && isPaymentSuccess && !guestDisclaimerAccepted && !blastComplete

  // ── Should blast button show? ─────────────────────────────────────────────
  // Hide for: registered users who just paid (PaymentBlastTrigger handles it)
  //           and guests whose disclaimer/blast is pending (overlay handles it)
  const showBlastButton = !isPaymentSuccess

  return (
    <div className="resume-analysis-container">
      <div className="analysis-header">
        <h2>Comprehensive Resume Analysis</h2>
        <p>Complete AI-powered analysis of your resume with detailed skill extraction</p>
      </div>

      <div className="analysis-grid">
        {/* Score Card */}
        <div className="analysis-card score-card">
          <div className="score-ring" style={{ borderColor: getScoreColor(analysis.ats_score) }}>
            <span className="score-number">{analysis.ats_score}</span>
            <span className="score-label">Our Score</span>
          </div>
          <p className="recommendation">{analysis.blast_recommendation}</p>

          {analysis.score_breakdown && (
            <div style={{ marginTop: '15px', fontSize: '12px', color: '#6b7280' }}>
              <div style={{ fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Score Breakdown:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Contact Info: {analysis.score_breakdown.contact_info || 0}/10</div>
                <div>Skills: {analysis.score_breakdown.skills || 0}/30</div>
                <div>Experience: {analysis.score_breakdown.experience || 0}/25</div>
                <div>Education: {analysis.score_breakdown.education || 0}/20</div>
                <div>Keywords: {analysis.score_breakdown.keywords || 0}/15</div>
              </div>
            </div>
          )}

          <p style={{
            fontSize: '11px', color: '#4b5563', marginTop: '20px',
            textAlign: 'center', fontStyle: 'italic', lineHeight: '1.4',
            borderTop: '1px solid #e5e7eb', paddingTop: '10px'
          }}>
            This score is generated by our internal logic based on resume best practices.
            This score will not impact your recruitment in any manner
          </p>
        </div>

        {/* Targeting Card */}
        <div className="analysis-card targeting-card">
          <h3>Targeting Profile</h3>
          <div className="data-row">
            <span className="label">Candidate:</span>
            <span className="value" style={{ fontWeight: '700', textTransform: 'capitalize' }}>
              {analysis.candidate_name || 'Not Detected'}
            </span>
          </div>
          <div className="data-row">
            <span className="label">Role:</span>
            <span className="value">{analysis.detected_role || 'General'}</span>
          </div>
          <div className="data-row">
            <span className="label">Seniority:</span>
            <span className="value">{analysis.seniority_level || 'Mid-Level'}</span>
          </div>
          <div className="data-row">
            <span className="label">Experience:</span>
            <span className="value" style={{ fontWeight: '700' }}>
              {analysis.years_of_experience ? `${analysis.years_of_experience} Years` : 'Not Specified'}
            </span>
          </div>
          <div className="data-row">
            <span className="label">Industry:</span>
            <span className="value">{analysis.recommended_industry || 'Technology'}</span>
          </div>
          <div className="data-row">
            <span className="label">Education:</span>
            <span className="value">{analysis.education_summary || 'Not Specified'}</span>
          </div>
        </div>

        {/* Skills Card */}
        <div className="analysis-card skills-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3>Skills Analysis</h3>
            <span style={{
              background: '#dbeafe', color: '#1e40af',
              padding: '4px 12px', borderRadius: '12px',
              fontSize: '13px', fontWeight: '600'
            }}>
              {analysis.total_skills_count || allSkillsFlat.length} Skills Found
            </span>
          </div>

          <div className="skills-cloud">
            {analysis.top_skills?.length > 0
              ? analysis.top_skills.slice(0, 8).map((skill, idx) => (
                  <span key={idx} className="skill-tag">{skill}</span>
                ))
              : <span style={{ fontSize: '12px', color: '#999' }}>No skills detected</span>
            }
          </div>

          {allSkillsFlat.length > 8 && (
            <button
              onClick={() => setShowAllSkills(!showAllSkills)}
              style={{
                marginTop: '15px', padding: '8px 16px', background: '#f3f4f6',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                fontSize: '14px', fontWeight: '500', color: '#374151', width: '100%',
                transition: 'background 0.2s'
              }}
              onMouseOver={e => e.target.style.background = '#e5e7eb'}
              onMouseOut={e => e.target.style.background = '#f3f4f6'}
            >
              {showAllSkills ? '▲ Show Less' : `▼ View All ${allSkillsFlat.length} Skills`}
            </button>
          )}
        </div>
      </div>

      {/* All Skills Expanded */}
      {showAllSkills && skillCategories.length > 0 && (
        <div className="analysis-card" style={{ marginTop: '20px', padding: '30px' }}>
          <h3 style={{ marginBottom: '25px', fontSize: '20px' }}>Complete Skills Breakdown</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '25px' }}>
            {skillCategories.map((category, idx) => (
              <div key={idx} style={{
                background: '#f9fafb', padding: '20px',
                borderRadius: '12px', border: '1px solid #e5e7eb'
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  marginBottom: '15px', paddingBottom: '10px',
                  borderBottom: '2px solid #e5e7eb'
                }}>
                  <span style={{ fontSize: '24px' }}>{category.icon}</span>
                  <span style={{ fontWeight: '600', fontSize: '16px', color: '#111827' }}>
                    {category.name}
                  </span>
                  <span style={{
                    marginLeft: 'auto', background: '#dbeafe', color: '#1e40af',
                    padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '600'
                  }}>
                    {category.skills.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {category.skills.map((skill, skillIdx) => (
                    <span key={skillIdx} style={{
                      background: '#ffffff', padding: '6px 12px', borderRadius: '6px',
                      fontSize: '13px', color: '#374151', border: '1px solid #e5e7eb', fontWeight: '500'
                    }}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Achievements */}
      {analysis.key_achievements?.length > 0 && (
        <div className="analysis-card" style={{ marginTop: '20px', padding: '30px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '20px' }}>Key Achievements</h3>
          <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {analysis.key_achievements.map((ach, idx) => (
              <li key={idx} style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                {ach}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── GUEST DISCLAIMER MODAL ── */}
      {showGuestDisclaimer && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.65)', display: 'flex',
          justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            background: 'white', padding: '40px', borderRadius: '16px',
            maxWidth: '560px', width: '100%', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📢</div>
            <h3 style={{ color: '#111827', marginBottom: '15px', fontSize: '22px' }}>
              Action Required: Accept Disclaimer
            </h3>
            <p style={{ color: '#4b5563', fontSize: '15px', lineHeight: '1.7', marginBottom: '25px' }}>
              By proceeding as a guest, you acknowledge that your resume will be distributed
              to our verified recruiter network.
              <br /><br />
              <strong>Note:</strong> As a non-registered user, you will <strong>not</strong> have
              access to the tracking dashboard. If you wish to track your campaign,
              please create a free account.
            </p>
            <button
              onClick={handleGuestBlast}
              disabled={isBlasting}
              style={{
                width: '100%', padding: '16px 24px',
                background: isBlasting ? '#9ca3af' : '#DC2626',
                color: 'white', border: 'none', borderRadius: '10px',
                fontSize: '16px', fontWeight: '700', cursor: isBlasting ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s'
              }}
            >
              {isBlasting ? (
                <span>⏳ Sending to Recruiters...</span>
              ) : (
                <span>🚀 I Accept — Blast My Resume</span>
              )}
            </button>
            <p style={{ color: '#9CA3AF', fontSize: '12px', marginTop: '12px' }}>
              This action cannot be reversed
            </p>
          </div>
        </div>
      )}

      {/* ── BLAST BUTTON — only shows before payment ── */}
      {showBlastButton && (
        <div className="action-section">
          <button className="blast-button-large" onClick={() => setShowBlastConfig(true)}>
            🚀 Blast to 500+ {analysis.recommended_industry || 'Tech'} Recruiters
          </button>
        </div>
      )}

      {/* ── POST-PAYMENT STATUS for registered users ── */}
      {isPaymentSuccess && !isGuest && (
        <div style={{
          marginTop: '30px', padding: '20px 24px',
          background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
          border: '2px solid #10B981', borderRadius: '12px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '10px' }}>🚀</div>
          <h3 style={{ color: '#065F46', margin: '0 0 8px 0' }}>Your Campaign is Launching!</h3>
          <p style={{ color: '#047857', margin: 0, fontSize: '14px' }}>
            Day 1 blast is being sent. Redirecting to your dashboard...
          </p>
        </div>
      )}

      {/* ── BLAST CONFIG MODAL ── */}
      {showBlastConfig && (
        <BlastConfig
          resumeId={resumeId}
          resumeUrl={resumeUrl}
          resumeText={resumeText}
          isGuest={isGuest}
          paymentVerified={false}
          userData={{
            id:           user?.id,
            name:         analysis.candidate_name || user?.email?.split('@')[0],
            email:        (analysis.candidate_email && analysis.candidate_email.includes('@') && analysis.candidate_email !== 'Not Found')
                            ? analysis.candidate_email
                            : user?.email,
            phone:        analysis.candidate_phone !== 'Not Found' ? analysis.candidate_phone : '',
            targetRole:   analysis.detected_role,
            skills:       allSkillsFlat.join(', '),
            years_experience: analysis.total_experience || analysis.seniority_level,
          }}
          onBlastComplete={() => setShowBlastConfig(false)}
          onCancel={() => setShowBlastConfig(false)}
        />
      )}
    </div>
  )
}

const getScoreColor = (score) => {
  if (score >= 80) return '#059669'
  if (score >= 60) return '#D97706'
  return '#DC2626'
}

export default ResumeAnalysis