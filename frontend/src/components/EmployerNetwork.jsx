// src/components/EmployerNetwork.jsx
import { useState, useEffect, useRef } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// Inline design tokens matching app theme
const t = {
  red: '#DC2626', redDark: '#B91C1C', redLight: '#FEE2E2', redFaint: '#FFF5F5',
  black: '#111111', gray900: '#1F2937', gray700: '#374151', gray500: '#6B7280',
  gray300: '#D1D5DB', gray200: '#E5E7EB', gray100: '#F3F4F6', gray50: '#F9FAFB', white: '#FFFFFF',
}

function EmployerNetwork({ onLogin, onViewChange }) {
  const [formData, setFormData] = useState({ recruiter_name: '', company_name: '', email: '' })
  const [formState, setFormState] = useState('idle') // idle | submitting | success | error
  const [formError, setFormError] = useState('')
  const observerRef = useRef(null)

  // Primary skills — slug chips, max 4
  const [primarySkills, setPrimarySkills] = useState([])
  const [primaryInput, setPrimaryInput] = useState('')
  const [primaryFocused, setPrimaryFocused] = useState(false)

  // Additional skills — slug chips, no max
  const [additionalSkills, setAdditionalSkills] = useState([])
  const [additionalInput, setAdditionalInput] = useState('')
  const [additionalFocused, setAdditionalFocused] = useState(false)

  const addSkill = (value, list, setList, setInput, max) => {
    const trimmed = value.trim().replace(/,+$/, '').trim()
    if (!trimmed) return
    if (max && list.length >= max) return
    if (list.some(s => s.toLowerCase() === trimmed.toLowerCase())) return
    setList([...list, trimmed])
    setInput('')
  }
  const handleSkillKey = (e, list, setList, setInput, max) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addSkill(e.target.value, list, setList, setInput, max)
    } else if (e.key === 'Backspace' && e.target.value === '' && list.length > 0) {
      setList(list.slice(0, -1))
    }
  }

  // Scroll-in animations
  useEffect(() => {
    window.scrollTo(0, 0)
    observerRef.current = new IntersectionObserver(
      (entries) => entries.forEach((el) => {
        if (el.isIntersecting) { el.target.style.opacity = '1'; el.target.style.transform = 'translateY(0)' }
      }),
      { threshold: 0.08 }
    )
    setTimeout(() => {
      document.querySelectorAll('.en-animate').forEach((el, i) => {
        el.style.opacity = '0'
        el.style.transform = 'translateY(16px)'
        el.style.transition = `opacity 0.4s ${i * 0.04}s ease, transform 0.4s ${i * 0.04}s ease`
        observerRef.current?.observe(el)
      })
    }, 100)
    return () => observerRef.current?.disconnect()
  }, [])

  const handleChange = (e) => setFormData((p) => ({ ...p, [e.target.name]: e.target.value }))

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    setFormState('submitting')
    setFormError('')
    try {
      const payload = {
        ...formData,
        primary_skills: primarySkills,
        additional_skills: additionalSkills,
      }
      const res = await fetch(`${API_URL}/api/employer-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) { setFormState('success') }
      else {
        const data = await res.json().catch(() => ({}))
        setFormError(data.error || 'Something went wrong. Please try again.')
        setFormState('error')
      }
    } catch {
      setFormState('success') 
    }
  }

  // Shared styles
  const card = {
    background: t.white, border: `1px solid ${t.gray200}`, borderRadius: '12px',
    padding: '1.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', transition: 'box-shadow 0.2s, transform 0.15s',
  }
  const sectionTag = { fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: t.red, marginBottom: '0.5rem' }
  const h2Style = { fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)', fontWeight: '800', letterSpacing: '-0.03em', lineHeight: 1.1, color: t.black, marginBottom: '0.875rem' }
  const sectionDesc = { fontSize: '1rem', color: t.gray500, maxWidth: '56ch', lineHeight: 1.7, marginBottom: '3rem' }
  const inputStyle = {
    width: '100%', background: t.white, border: `1px solid ${t.gray300}`,
    color: t.gray900, padding: '0.625rem 0.875rem', borderRadius: '8px',
    fontFamily: 'Inter, sans-serif', fontSize: '0.9rem', outline: 'none',
  }
  const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: '600', color: t.gray700, marginBottom: '0.4rem' }

  const features = [
    { icon: '🤖', title: 'AI-Screened Candidates', desc: 'Every resume is analyzed using advanced AI to extract structured data you can actually filter on.', tags: ['Skills', 'Experience', 'Seniority', 'Certifications'] },
    { icon: '✅', title: 'Verified & Motivated Talent', desc: "Candidates are actively distributing resumes. These aren't passive profiles — they're ready for interviews." },
    { icon: '🔍', title: 'Direct Resume Access', desc: 'Search and filter by technical skills, experience level, industry, job title, and keywords.', tags: ['Boolean Search', 'Filter by Role', 'Download Direct'] },
    { icon: '⚡', title: 'Faster Hiring Cycles', desc: 'No waiting for applications. Resumes come pre-scored, pre-structured, and ready to review immediately.' },
    { icon: '📊', title: 'Real-Time Engagement Tracking', desc: 'We track when candidates are most active and how recruiters engage with profiles.' },
    { icon: '🛡️', title: 'Ethical & Compliant', desc: 'No scraping. No spam lists. Verified candidate submissions with proper consent and secure data handling.' },
  ]

  const steps = [
    { n: '01', title: 'Join the Employer Network', desc: 'Submit your employer access request. We review applications within 24–48 hours.' },
    { n: '02', title: 'Tell Us What You Hire', desc: 'Share target roles and volume needs. We surface the most relevant candidates first.' },
    { n: '03', title: 'Get Matched With Talent', desc: 'Our AI matching engine surfaces pre-screened candidates aligned with your open roles.' },
    { n: '04', title: 'Download & Connect', desc: 'Access full resumes, contact candidates directly, and move fast. No intermediaries.' },
  ]

  const trustItems = [
    { icon: '🔒', title: 'Secure Data Handling', desc: 'Encrypted storage, strict access controls, and GDPR-aligned data practices.' },
    { icon: '✓', title: 'Verified Candidate Submissions', desc: 'Every candidate has actively submitted and consented to distribution.' },
    { icon: '🚫', title: 'No Resume Scraping', desc: 'We never scrape, harvest, or use unauthorized data sources.' },
    { icon: '✉️', title: 'No Spam Lists', desc: 'Employer contacts are vetted. Candidate contacts are consensual.' },
  ]

  const industries = [
    'Software Engineering', 'Data Analytics', 'Product Management', 'Business Analysis',
    'Quality Assurance', 'DevOps Engineering', 'Cloud Architecture', 'IT Support',
    'Cybersecurity', 'UX / UI Design', 'Machine Learning', 'Technical Writing',
  ]

  return (
    <div style={{ background: t.white, color: t.gray900, fontFamily: 'Inter, -apple-system, sans-serif', fontSize: '16px', lineHeight: '1.6', overflowX: 'hidden' }}>

      {/* ✅ MOVED TO TOP: FORM SECTION */}
      <div id="employer-access" style={{ background: t.gray50, borderBottom: `1px solid ${t.gray200}`, padding: '2rem 2rem 4rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          
          {/* Back link moved into the Form section header so it remains at the top */}
          <button
            onClick={() => onViewChange && onViewChange('recruiter')}
            style={{ background: 'none', border: 'none', color: t.gray500, fontSize: '0.875rem', cursor: 'pointer', marginBottom: '2rem', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            ← Back to Recruiters
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '4rem', alignItems: 'start' }}>

            {/* Left */}
            <div>
              <p style={sectionTag}>Early Access</p>
              <h2 style={{ ...h2Style, maxWidth: '14ch' }}>Start Hiring Smarter Today</h2>
              <p style={{ ...sectionDesc, marginBottom: '2rem' }}>
                ResumeBlast.ai connects recruiters directly to AI-screened, motivated candidates — without the clutter of traditional job boards.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                {['Access to continuously updated resume database', 'AI-scored and structured candidate profiles', 'Direct download — no gatekeeping', 'Priority matching for your target roles', 'Early access pricing for founding employers'].map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.9rem', color: t.gray700, fontWeight: '500' }}>
                    <div style={{ width: '20px', height: '20px', background: t.red, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: '0.65rem', fontWeight: '700' }}>✓</div>
                    {b}
                  </div>
                ))}
              </div>

              {/* Already have account */}
              <div style={{ padding: '1.25rem', background: t.redLight, borderRadius: '10px', border: '1px solid #FCA5A5' }}>
                <p style={{ fontSize: '0.875rem', color: '#991B1B', fontWeight: '600', marginBottom: '0.5rem' }}>Already have a recruiter account?</p>
                <button
                  onClick={() => onLogin && onLogin()}
                  style={{ background: t.red, color: '#fff', padding: '0.6rem 1.25rem', borderRadius: '6px', border: 'none', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                  onMouseOver={(e) => e.currentTarget.style.background = t.redDark}
                  onMouseOut={(e) => e.currentTarget.style.background = t.red}
                >
                  Login / Register →
                </button>
              </div>
            </div>

            {/* Form card */}
            <div style={{ background: t.white, border: `1px solid ${t.gray200}`, borderRadius: '12px', padding: '2.25rem', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}>
              <div style={{ marginBottom: '1.75rem', paddingBottom: '1.25rem', borderBottom: `1px solid ${t.gray200}` }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: t.black, letterSpacing: '-0.02em', margin: '0 0 4px' }}>Request Employer Access</h3>
                <p style={{ fontSize: '0.82rem', color: t.gray500, margin: 0 }}>We'll review your application within 24–48 hours.</p>
              </div>

              {formState === 'success' ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                  <div style={{ width: '56px', height: '56px', background: t.redLight, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', margin: '0 auto 1.25rem' }}>✅</div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: t.black, marginBottom: '0.5rem' }}>Application Received!</h3>
                  <p style={{ fontSize: '0.9rem', color: t.gray500, lineHeight: 1.6 }}>We'll follow up within 24–48 hours with next steps.</p>
                </div>
              ) : (
                <form onSubmit={handleFormSubmit}>

                  {/* Recruiter Name — optional */}
                  <div style={{ marginBottom: '1.1rem' }}>
                    <label style={labelStyle}>
                      Recruiter Name
                      <span style={{ fontWeight: '400', color: t.gray500, marginLeft: '4px', fontSize: '0.75rem' }}>(optional)</span>
                    </label>
                    <input name="recruiter_name" type="text" placeholder="Your full name"
                      value={formData.recruiter_name} onChange={handleChange} style={inputStyle}
                      onFocus={(e) => { e.target.style.borderColor = t.red; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.1)' }}
                      onBlur={(e) => { e.target.style.borderColor = t.gray300; e.target.style.boxShadow = 'none' }}
                    />
                  </div>

                  {/* Company Name + Work Email — mandatory */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.1rem' }}>
                    <div>
                      <label style={labelStyle}>Company Name <span style={{ color: t.red }}>*</span></label>
                      <input name="company_name" type="text" placeholder="Acme Recruiting" required
                        value={formData.company_name} onChange={handleChange} style={inputStyle}
                        onFocus={(e) => { e.target.style.borderColor = t.red; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.1)' }}
                        onBlur={(e) => { e.target.style.borderColor = t.gray300; e.target.style.boxShadow = 'none' }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Work Email <span style={{ color: t.red }}>*</span></label>
                      <input name="email" type="email" placeholder="you@company.com" required
                        value={formData.email} onChange={handleChange} style={inputStyle}
                        onFocus={(e) => { e.target.style.borderColor = t.red; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.1)' }}
                        onBlur={(e) => { e.target.style.borderColor = t.gray300; e.target.style.boxShadow = 'none' }}
                      />
                    </div>
                  </div>

                  {/* Primary Skills — slug chips, max 4, optional */}
                  <div style={{ marginBottom: '1.1rem' }}>
                    <label style={labelStyle}>
                      Primary Skills You Hire For
                      <span style={{ fontWeight: '400', color: t.gray500, marginLeft: '4px', fontSize: '0.75rem' }}>(optional · max 4)</span>
                    </label>
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
                      border: `1px solid ${primaryFocused ? t.red : t.gray300}`,
                      borderRadius: '8px', padding: '6px 10px', background: t.white, cursor: 'text',
                      boxShadow: primaryFocused ? '0 0 0 3px rgba(220,38,38,0.1)' : 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s', minHeight: '42px',
                    }}
                      onClick={() => document.getElementById('primarySkillInput').focus()}
                    >
                      {primarySkills.map((skill, i) => (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          background: t.redLight, color: t.red,
                          fontSize: '0.78rem', fontWeight: '600',
                          padding: '3px 10px 3px 10px', borderRadius: '100px',
                          border: `1px solid #FCA5A5`,
                        }}>
                          {skill}
                          <span
                            onClick={(e) => { e.stopPropagation(); setPrimarySkills(primarySkills.filter((_, j) => j !== i)) }}
                            style={{ cursor: 'pointer', fontSize: '12px', lineHeight: 1, color: '#991B1B', marginLeft: '2px' }}
                          >×</span>
                        </span>
                      ))}
                      {primarySkills.length < 4 && (
                        <input
                          id="primarySkillInput"
                          type="text"
                          value={primaryInput}
                          onChange={(e) => setPrimaryInput(e.target.value)}
                          onKeyDown={(e) => handleSkillKey(e, primarySkills, setPrimarySkills, setPrimaryInput, 4)}
                          onBlur={() => { setPrimaryFocused(false); if (primaryInput.trim()) addSkill(primaryInput, primarySkills, setPrimarySkills, setPrimaryInput, 4) }}
                          onFocus={() => setPrimaryFocused(true)}
                          placeholder={primarySkills.length === 0 ? 'e.g. React, Python, SQL — press Enter or comma' : ''}
                          style={{
                            border: 'none', outline: 'none', fontSize: '0.875rem',
                            color: t.gray900, background: 'transparent',
                            flexGrow: 1, minWidth: '140px', padding: '2px 0',
                            fontFamily: 'Inter, sans-serif',
                          }}
                        />
                      )}
                    </div>
                    {primarySkills.length >= 4 && (
                      <p style={{ fontSize: '0.72rem', color: t.gray500, marginTop: '4px' }}>Maximum 4 primary skills reached.</p>
                    )}
                  </div>

                  {/* Additional Skills — slug chips, no max, optional */}
                  <div style={{ marginBottom: '1.4rem' }}>
                    <label style={labelStyle}>
                      Additional Skills
                      <span style={{ fontWeight: '400', color: t.gray500, marginLeft: '4px', fontSize: '0.75rem' }}>(optional)</span>
                    </label>
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
                      border: `1px solid ${additionalFocused ? t.red : t.gray300}`,
                      borderRadius: '8px', padding: '6px 10px', background: t.white, cursor: 'text',
                      boxShadow: additionalFocused ? '0 0 0 3px rgba(220,38,38,0.1)' : 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s', minHeight: '42px',
                    }}
                      onClick={() => document.getElementById('additionalSkillInput').focus()}
                    >
                      {additionalSkills.map((skill, i) => (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          background: t.gray100, color: t.gray700,
                          fontSize: '0.78rem', fontWeight: '600',
                          padding: '3px 10px', borderRadius: '100px',
                          border: `1px solid ${t.gray200}`,
                        }}>
                          {skill}
                          <span
                            onClick={(e) => { e.stopPropagation(); setAdditionalSkills(additionalSkills.filter((_, j) => j !== i)) }}
                            style={{ cursor: 'pointer', fontSize: '12px', lineHeight: 1, color: t.gray500, marginLeft: '2px' }}
                          >×</span>
                        </span>
                      ))}
                      <input
                        id="additionalSkillInput"
                        type="text"
                        value={additionalInput}
                        onChange={(e) => setAdditionalInput(e.target.value)}
                        onKeyDown={(e) => handleSkillKey(e, additionalSkills, setAdditionalSkills, setAdditionalInput, null)}
                        onBlur={() => { setAdditionalFocused(false); if (additionalInput.trim()) addSkill(additionalInput, additionalSkills, setAdditionalSkills, setAdditionalInput, null) }}
                        onFocus={() => setAdditionalFocused(true)}
                        placeholder={additionalSkills.length === 0 ? 'e.g. AWS, Docker, Agile — press Enter or comma' : ''}
                        style={{
                          border: 'none', outline: 'none', fontSize: '0.875rem',
                          color: t.gray900, background: 'transparent',
                          flexGrow: 1, minWidth: '140px', padding: '2px 0',
                          fontFamily: 'Inter, sans-serif',
                        }}
                      />
                    </div>
                  </div>

                  {formState === 'error' && (
                    <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>{formError}</div>
                  )}

                  <button type="submit" disabled={formState === 'submitting'}
                    style={{
                      width: '100%', background: t.red, color: '#fff', border: 'none',
                      padding: '0.8rem', borderRadius: '8px', fontFamily: 'Inter, sans-serif',
                      fontWeight: '700', fontSize: '0.95rem',
                      cursor: formState === 'submitting' ? 'not-allowed' : 'pointer',
                      opacity: formState === 'submitting' ? 0.6 : 1,
                      marginTop: '0.5rem', boxShadow: '0 1px 2px rgba(220,38,38,0.25)',
                    }}
                    onMouseOver={(e) => { if (formState !== 'submitting') e.currentTarget.style.background = t.redDark }}
                    onMouseOut={(e) => e.currentTarget.style.background = t.red}
                  >
                    {formState === 'submitting' ? 'Submitting...' : 'Submit Application →'}
                  </button>
                  <p style={{ textAlign: 'center', fontSize: '0.75rem', color: t.gray500, marginTop: '0.85rem' }}>
                    We review every application to ensure quality. No spam, ever.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── HERO SECTION MOVED BELOW FORM ── */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '5rem 2rem 4rem' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          background: t.redLight, color: t.red, fontSize: '0.73rem', fontWeight: '600',
          letterSpacing: '0.07em', textTransform: 'uppercase',
          padding: '0.35rem 0.85rem', borderRadius: '100px', marginBottom: '1.75rem',
          animation: 'enFadeUp 0.5s ease both',
        }}>
          <span style={{ width: '6px', height: '6px', background: t.red, borderRadius: '50%', animation: 'enPulse 2s infinite', display: 'inline-block' }} />
          Employer Network — Now Accepting Applications
        </div>

        <h1 style={{
          fontSize: 'clamp(2.4rem, 5.5vw, 4.5rem)', fontWeight: '800',
          letterSpacing: '-0.04em', lineHeight: 1.06, color: t.black,
          maxWidth: '16ch', marginBottom: '1.5rem',
          animation: 'enFadeUp 0.5s 0.08s ease both',
        }}>
          Hire <span style={{ color: t.red }}>Pre-Screened</span> Candidates. No Job Board Noise.
        </h1>

        <p style={{ fontSize: '1.05rem', color: t.gray500, maxWidth: '54ch', lineHeight: 1.75, marginBottom: '2.5rem', animation: 'enFadeUp 0.5s 0.15s ease both' }}>
          Access AI-analyzed resumes from motivated job seekers actively distributing their profiles.
          Skip crowded job boards and connect directly with verified tech talent — ready to interview.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', animation: 'enFadeUp 0.5s 0.22s ease both' }}>
          <a href="#employer-access" style={{
            background: t.red, color: '#fff', padding: '0.75rem 1.75rem', borderRadius: '8px',
            fontWeight: '600', fontSize: '0.95rem', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            boxShadow: '0 1px 2px rgba(220,38,38,0.3)', transition: 'background 0.15s',
          }}
            onMouseOver={(e) => e.currentTarget.style.background = t.redDark}
            onMouseOut={(e) => e.currentTarget.style.background = t.red}
          >
            Request Employer Access →
          </a>
          <button
            onClick={() => onLogin && onLogin()}
            style={{
              background: t.white, color: t.gray700, padding: '0.75rem 1.75rem',
              borderRadius: '8px', border: `1px solid ${t.gray300}`,
              fontWeight: '600', fontSize: '0.95rem', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = t.gray50; e.currentTarget.style.borderColor = t.gray500 }}
            onMouseOut={(e) => { e.currentTarget.style.background = t.white; e.currentTarget.style.borderColor = t.gray300 }}
          >
            Recruiter Login / Register
          </button>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'flex', gap: '2.5rem', flexWrap: 'wrap',
          marginTop: '4rem', paddingTop: '2.5rem', borderTop: `1px solid ${t.gray200}`,
          animation: 'enFadeUp 0.5s 0.3s ease both',
        }}>
          {[
            { num: 'AI', suffix: '-Scored', label: 'Every resume analyzed & structured' },
            { num: '0', suffix: 'x', label: 'Job board friction' },
            { num: '10', suffix: '+', label: 'Industries covered' },
            { num: '24', suffix: 'h', label: 'Access review turnaround' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: t.black, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {s.num}<span style={{ color: t.red }}>{s.suffix}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: t.gray500, marginTop: '0.2rem' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <div style={{ background: t.gray50, borderTop: `1px solid ${t.gray200}`, borderBottom: `1px solid ${t.gray200}`, padding: '6rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={sectionTag}>Why Employers Use ResumeBlast.ai</p>
          <h2 style={h2Style}>Built for Recruiters Who Hate Noise</h2>
          <p style={sectionDesc}>Every candidate is actively job-seeking, AI-analyzed, and ready to connect. No sifting through passive profiles.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {features.map((f, i) => (
              <div key={i} className="en-animate" style={{ ...card }}
                onMouseOver={(e) => { e.currentTarget.style.boxShadow = '0 10px 25px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseOut={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <div style={{ width: '44px', height: '44px', background: t.redLight, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', marginBottom: '1rem' }}>{f.icon}</div>
                <h3 style={{ fontSize: '0.975rem', fontWeight: '700', color: t.black, marginBottom: '0.4rem' }}>{f.title}</h3>
                <p style={{ fontSize: '0.875rem', color: t.gray500, lineHeight: 1.6 }}>{f.desc}</p>
                {f.tags && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.875rem' }}>
                    {f.tags.map((tag, j) => <span key={j} style={{ background: t.redLight, color: t.red, fontSize: '0.7rem', fontWeight: '600', padding: '0.2rem 0.55rem', borderRadius: '100px' }}>{tag}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div style={{ background: t.white, padding: '6rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={sectionTag}>Process</p>
          <h2 style={h2Style}>Simple, Direct, Fast</h2>
          <p style={sectionDesc}>From request to active hiring in four steps. No long onboarding. No wasted time.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            {steps.map((s, i) => (
              <div key={i} className="en-animate" style={{ ...card }}>
                <div style={{ width: '36px', height: '36px', background: t.red, color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: '700', marginBottom: '1rem' }}>{s.n}</div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: t.black, marginBottom: '0.4rem' }}>{s.title}</h3>
                <p style={{ fontSize: '0.85rem', color: t.gray500, lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── INDUSTRIES ── */}
      <div style={{ background: t.gray50, borderTop: `1px solid ${t.gray200}`, borderBottom: `1px solid ${t.gray200}`, padding: '6rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={sectionTag}>Growing Resume Database</p>
          <h2 style={h2Style}>Candidates Across Every Tech Discipline</h2>
          <p style={sectionDesc}>Unlike traditional job boards, our platform distributes resumes directly to recruiter networks and tracks engagement in real time.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            {industries.map((ind, i) => (
              <span key={i} className="en-animate" style={{ background: t.white, border: `1px solid ${t.gray200}`, color: t.gray700, padding: '0.5rem 1.1rem', borderRadius: '100px', fontSize: '0.875rem', fontWeight: '500', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'all 0.15s', display: 'inline-block' }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = t.red; e.currentTarget.style.color = t.red; e.currentTarget.style.background = t.redFaint }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = t.gray200; e.currentTarget.style.color = t.gray700; e.currentTarget.style.background = t.white }}
              >{ind}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── TRUST ── */}
      <div style={{ background: t.white, padding: '6rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <p style={sectionTag}>Trust & Compliance</p>
          <h2 style={h2Style}>Built on Ethical Sourcing</h2>
          <p style={sectionDesc}>Our model is differentiated not just by technology — but by ethics. Every candidate has opted in.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.25rem' }}>
            {trustItems.map((item, i) => (
              <div key={i} className="en-animate" style={{ background: t.gray50, border: `1px solid ${t.gray200}`, borderRadius: '12px', padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ width: '38px', height: '38px', background: t.redLight, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>{item.icon}</div>
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: t.black, marginBottom: '0.25rem' }}>{item.title}</h4>
                  <p style={{ fontSize: '0.82rem', color: t.gray500, lineHeight: 1.5, margin: 0 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes enFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes enPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.5); } }
      `}</style>
    </div>
  )
}

export default EmployerNetwork