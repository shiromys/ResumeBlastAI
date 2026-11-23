// frontend/src/pages/CampaignExplainedPage.jsx
//
// NEW dedicated page at /campaign-explained
//
// Purpose: unlike /how-it-works (top-of-funnel marketing page, still in
// place and unchanged), this page is written for people who have ALREADY
// paid — it explains the wave timeline in detail, how to read dashboard
// progress, why recruiter contact details are withheld until the campaign
// finishes, and what to do about receipts/account setup. It's meant to be
// linked from the homepage nav/footer and from support + purchase emails,
// so customers with a question mid-campaign have one place to send them.
//
// Wave-length numbers below are calculated from the actual sending logic
// in backend/services/drip_scheduler.py (DAILY_EMAIL_LIMIT=50/day/wave):
// Wave 1 sends every day; Waves 2 and 3 send the same full recruiter list
// again but skip weekends, so each of those waves takes noticeably longer
// in calendar time than Wave 1 does. See PLAN_TIMELINE below for the math.

import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PageMeta from '../components/SEO/PageMeta'
import './CampaignExplainedPage.css'

// days_per_wave = ceil(recruiters / 50) — matches drip_scheduler.py exactly.
// Wave 1 runs every day, so its calendar length equals days_per_wave.
// Waves 2 & 3 run on business days only (weekends skipped), so reaching
// the same number of sending-days takes longer in calendar time:
// calendar_days = floor(days_per_wave / 5) * 7 + (days_per_wave % 5)
function businessDayCalendarLength(sendingDays) {
  const weeks = Math.floor(sendingDays / 5)
  const rem = sendingDays % 5
  return weeks * 7 + rem
}

const PLAN_TIMELINE = [
  { label: 'Starter', recruiters: 250 },
  { label: 'Basic', recruiters: 500 },
  { label: 'Professional', recruiters: 750 },
  { label: 'Growth', recruiters: 1000 },
  { label: 'Advance', recruiters: 1250 },
  { label: 'Premium', recruiters: 1500 },
].map(p => {
  const wave1 = Math.ceil(p.recruiters / 50)
  const wave2 = businessDayCalendarLength(wave1)
  const wave3 = businessDayCalendarLength(wave1)
  const total = wave1 + wave2 + wave3
  return { ...p, wave1, wave2, wave3, total }
})

function CampaignExplainedPage({ onGetStarted }) {

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="ce-page">

      <PageMeta
        title="How Your Campaign Works | ResumeBlast.ai"
        description="Understand the 3-wave recruiter drip campaign, how long each plan takes, how to read your dashboard, and when recruiter details appear."
        canonical="https://www.resumeblast.ai/campaign-explained"
      />

      <div className="ce-header">
        <p className="ce-label">Campaign Guide</p>
        <h1 className="ce-title">How Your ResumeBlast.ai Campaign Works</h1>
        <p className="ce-subtitle">
          Your resume is not sent all at once. We send it in three waves, spread over time,
          so your emails reach recruiters' inboxes instead of being flagged as bulk mail.
          This page explains what to expect.
        </p>
      </div>

      <div className="ce-section">
        <h2>The three waves</h2>
        <ul className="ce-wave-list">
          <li>
            <strong>Wave 1: Introduction.</strong> Your resume goes to the recruiters on your
            plan, 50 per day, every day, until your full list has received it.
          </li>
          <li>
            <strong>Wave 2: Follow-up.</strong> A follow-up email goes to the same recruiters
            who received your Wave 1 email. It's sent on business days and starts after Wave 1
            is complete.
          </li>
          <li>
            <strong>Wave 3: Final reminder.</strong> One last reminder goes to those same
            recruiters. It's sent on business days and starts after Wave 2 is complete.
          </li>
        </ul>
        <p>
          There are three waves in total. You may see them called "phases" elsewhere, but the
          dashboard and this page always say "waves."
        </p>
      </div>

      <div className="ce-section">
        <h2>How long it takes</h2>
        <p>
          Wave 1 sends every day. Waves 2 and 3 send to your same full recruiter list again, but
          only on business days (weekends are skipped), so each of those waves takes longer in
          calendar time than Wave 1 does. Here's the full breakdown by plan:
        </p>
        <div className="ce-table-wrapper">
          <table className="ce-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Recruiters</th>
                <th>Wave 1</th>
                <th>Wave 2</th>
                <th>Wave 3</th>
                <th>Total campaign</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_TIMELINE.map(p => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td>{p.recruiters.toLocaleString()}</td>
                  <td>~{p.wave1} days</td>
                  <td>~{p.wave2} days</td>
                  <td>~{p.wave3} days</td>
                  <td><strong>~{p.total} days</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ce-table-note">
          On the largest plan, the full three-wave campaign takes about 16 weeks (roughly
          3.5–4 months) from your start date. Smaller plans finish sooner — see the table above
          for your plan.
        </p>
      </div>

      <div className="ce-section">
        <h2>Checking your progress</h2>
        <p>
          Log in to your dashboard to see how many emails have been sent in each wave. Wave 2 and
          Wave 3 show 0 at first — this is normal. They start only after the wave before them
          finishes.
        </p>
        <p>
          If your dashboard shows Wave 1 progress, your campaign is running as expected.
        </p>
      </div>

      <div className="ce-section">
        <h2>Recruiter details</h2>
        <p>
          To protect our recruiter and employer partners, we never share individual recruiter
          names or personal email addresses.
        </p>
        <p>
          When your whole campaign is complete, your dashboard shows the company name, general
          phone number and website for each recruiter whose email was delivered to. These details
          aren't available while the campaign is still running.
        </p>
        <p>
          You may see fewer companies than your plan total if some emails couldn't be delivered.
        </p>
      </div>

      <div className="ce-section">
        <h2>Receipts and account setup</h2>
        <p>
          <strong>Receipt:</strong> A receipt is emailed to you at purchase. If you don't see it,
          check your spam folder, then contact support.
        </p>
        <p>
          <strong>Account setup:</strong> After you pay, check your email for the link to set
          your password and finish your profile. If you paid but never received it, contact
          support and we'll help you.
        </p>
      </div>

      <div className="ce-section">
        <h2>Need help?</h2>
        <p>
          Email <a href="mailto:info@resumeblast.ai">info@resumeblast.ai</a> or call{' '}
          <a href="tel:8009718013">(800) 971-8013</a>, Monday to Friday, 9am to 6pm CST.
        </p>
      </div>

      <div className="ce-cta">
        <h2>Ready to start your campaign?</h2>
        <div className="ce-cta-buttons">
          <button className="cta-button large" onClick={onGetStarted}>
            Start Free — 11 Recruiters
          </button>
          <Link to="/pricing" className="ce-secondary-btn">
            View Pricing Plans →
          </Link>
        </div>
      </div>

    </div>
  )
}

export default CampaignExplainedPage
