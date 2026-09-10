// src/components/UserDashboard.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ProfileSection from './ProfileSection'

// Plan mapping to ensure we don't show 0 if DB column is missing
const PLAN_LIMITS = {
  free: 11, starter: 250, basic: 500,
  professional: 750, growth: 1000, advanced: 1250, premium: 1500,
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function UserDashboard({ user, onStartBlast }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ blasts: [] })

  // ✅ NEW: "Recruiters reached" (company/phone/website) for a completed campaign.
  // Gated entirely by the backend's `available` flag — see
  // GET /api/user/campaign/<campaign_id>/recruiters. Additive only; doesn't
  // touch any existing state above.
  const [recruitersState, setRecruitersState] = useState({
    loading: false, available: false, recruiters: [], count: 0, error: null
  })
  const [recruiterSearch, setRecruiterSearch] = useState('')

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const { data: blasts } = await supabase
        .from('blast_campaigns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
      setData({ blasts: blasts || [] })
    } catch (e) { console.error(e) }
  }, [user])

  useEffect(() => {
    if (!user) return
    loadData().finally(() => setLoading(false))
  }, [user, loadData])

  const currentBlast = data.blasts?.[0] || null

  // ✅ NEW: fetch the recruiter/company list once we have a completed campaign.
  // Freemium ('free') sends never populate campaign_recruiter_sends (no wave
  // tracking on that path), so there's nothing to show there — skip the call.
  useEffect(() => {
    if (!user?.id || !currentBlast?.id || currentBlast.status !== 'completed' || currentBlast.plan_name === 'free') {
      return
    }
    let cancelled = false
    setRecruitersState(s => ({ ...s, loading: true, error: null }))
    fetch(`${API_URL}/api/user/campaign/${currentBlast.id}/recruiters?user_id=${user.id}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.success) {
          setRecruitersState({
            loading: false, available: !!json.available,
            recruiters: json.recruiters || [], count: json.count || 0, error: null
          })
        } else {
          setRecruitersState({ loading: false, available: false, recruiters: [], count: 0, error: json.error || 'Failed to load' })
        }
      })
      .catch(err => {
        if (!cancelled) setRecruitersState({ loading: false, available: false, recruiters: [], count: 0, error: err.message })
      })
    return () => { cancelled = true }
  }, [user?.id, currentBlast?.id, currentBlast?.status, currentBlast?.plan_name])

  const filteredRecruiters = recruitersState.recruiters.filter(r =>
    !recruiterSearch.trim() || (r.company_name || '').toLowerCase().includes(recruiterSearch.trim().toLowerCase())
  )
  
  // ── FOOLPROOF LIVE CALCULATIONS ──
  const planName = currentBlast?.plan_name?.toLowerCase() || 'starter'
  const planLimit = PLAN_LIMITS[planName] || 250

  const w1 = currentBlast ? (parseInt(currentBlast.drip_day1_delivered) || 0) : 0
  const w2 = currentBlast ? (parseInt(currentBlast.drip_day2_delivered) || 0) : 0
  const w3 = currentBlast ? (parseInt(currentBlast.drip_day3_delivered) || 0) : 0
  
  const recruitersReached = currentBlast ? Math.max(w1, w2, w3) : 0
  const totalDelivered = w1 + w2 + w3
  const totalExpected = planLimit * 3
  const deliveryPct = totalExpected > 0 ? Math.min(Math.round((totalDelivered / totalExpected) * 100), 100) : 0

  if (loading) return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>

  return (
    <div className="resumeblast-new-container">
      <style>{`
        .resumeblast-new-container { 
          max-width: 1100px; 
          margin: 0 auto; 
          padding: 20px; 
          font-family: 'Inter', -apple-system, sans-serif; 
          background-color: #ffffff;
        }

        .rb-header-actions { 
          display: flex; 
          justify-content: flex-end; 
          padding: 0 0 20px; 
        }

        .rb-active-hero { 
          background: #fdfdfd; 
          border: 1px solid #eeeeee; 
          border-radius: 16px; 
          padding: 40px 20px; 
          text-align: center; 
          margin-bottom: 24px;
        }
        .rb-campaign-tag { 
          background: #ffebee; 
          color: #dc2626; 
          padding: 5px 15px; 
          border-radius: 20px; 
          font-size: 13px; 
          font-weight: 600; 
          display: inline-block; 
          margin-bottom: 15px;
        }
        .rb-active-hero h1 { font-size: 32px; font-weight: 700; color: #000000; margin: 0 0 10px 0; }
        .rb-active-hero p { color: #666666; font-size: 16px; margin: 0; }

        .rb-stats-row { 
          display: grid; 
          grid-template-columns: repeat(3, 1fr); 
          gap: 20px; 
          margin-bottom: 24px; 
        }
        .rb-card { 
          background: #ffffff; 
          border: 1px solid #e5e7eb; 
          border-radius: 12px; 
          padding: 30px 25px; 
          text-align: center; 
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .rb-card-val { font-size: 32px; font-weight: 800; color: #000000; display: block; margin-bottom: 5px; }
        .rb-card-val.red-theme { color: #dc2626; } 
        .rb-card-label { color: #6b7280; font-size: 15px; font-weight: 500; }

        .rb-next-section { 
          border: 1px solid #e5e7eb; 
          border-radius: 12px; 
          padding: 30px; 
          background: #ffffff;
          margin-bottom: 40px;
        }
        .rb-next-section h3 { font-size: 16px; font-weight: 700; margin: 0 0 25px 0; color: #000000; }

        .rb-wave-grid {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .rb-wave-item { }
        .rb-wave-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .rb-wave-title { font-size: 15px; font-weight: 600; color: #111827; }
        .rb-wave-status { font-size: 12px; font-weight: 600; color: #6b7280; }
        .rb-wave-count { font-size: 13px; color: #6b7280; margin-bottom: 8px; }
        .rb-wave-track { height: 8px; background: #f3f4f6; border-radius: 999px; overflow: hidden; }
        .rb-wave-fill { height: 100%; background: #dc2626; border-radius: 999px; transition: width 0.4s ease; }
        .rb-wave-note { font-size: 13px; color: #9ca3af; margin: 22px 0 0; line-height: 1.5; }

        .rb-btn-blast { 
          background: #dc2626; 
          color: white; 
          border: none; 
          padding: 12px 24px; 
          border-radius: 8px; 
          font-weight: 700; 
          cursor: pointer; 
          font-size: 14px;
          transition: background 0.2s;
        }
        .rb-btn-blast:hover { background: #b91c1c; }

        @media (max-width: 768px) {
          .rb-stats-row { grid-template-columns: 1fr; }
        }

        /* ✅ NEW: Recruiters reached (company/phone/website) section */
        .rb-recruiters-section {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 30px;
          background: #ffffff;
          margin-bottom: 40px;
        }
        .rb-recruiters-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 18px;
        }
        .rb-recruiters-head h3 { font-size: 16px; font-weight: 700; margin: 0; color: #000000; }
        .rb-recruiters-search {
          padding: 8px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
          min-width: 220px;
        }
        .rb-recruiters-table-wrap { overflow-x: auto; }
        .rb-recruiters-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .rb-recruiters-table th {
          text-align: left;
          color: #6b7280;
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 10px 12px;
          border-bottom: 1px solid #e5e7eb;
        }
        .rb-recruiters-table td {
          padding: 12px;
          border-bottom: 1px solid #f3f4f6;
          color: #111827;
        }
        .rb-recruiters-table a { color: #dc2626; text-decoration: none; font-weight: 600; }
        .rb-recruiters-table a:hover { text-decoration: underline; }
        .rb-recruiters-footer { margin-top: 14px; font-size: 13px; color: #6b7280; }
        .rb-recruiters-disclaimer { font-size: 12px; color: #9ca3af; margin-top: 16px; line-height: 1.5; }
        .rb-recruiters-empty { color: #6b7280; font-size: 14px; padding: 20px 0; text-align: center; }
      `}</style>

      <div className="rb-header-actions">
        <button className="rb-btn-blast" onClick={onStartBlast}>+ New Blast</button>
      </div>

      <ProfileSection user={user} isPaid={!!currentBlast} />

      <section className="rb-active-hero">
        <span className="rb-campaign-tag">Active campaign</span>
        <h1>Your resume is in recruiter inboxes now.</h1>
        <p>Recruiters typically reach out directly via phone or email</p>
      </section>

      <div className="rb-stats-row">
        <div className="rb-card">
          <span className="rb-card-val">{recruitersReached.toLocaleString()}</span>
          <span className="rb-card-label">Recruiters reached (Wave 1)</span>
        </div>
        <div className="rb-card">
          <span className="rb-card-val">{totalDelivered.toLocaleString()}</span>
          <span className="rb-card-label">Total emails delivered</span>
        </div>
        <div className="rb-card">
          <span className="rb-card-val red-theme">{deliveryPct}%</span>
          <span className="rb-card-label">Campaign progress</span>
        </div>
      </div>

      {currentBlast && (
        <div className="rb-next-section">
          <h3>Your campaign progress</h3>
          <div className="rb-wave-grid">
            {[
              { n: 1, label: 'Wave 1 · Introduction', sent: w1 },
              { n: 2, label: 'Wave 2 · Follow-up', sent: w2 },
              { n: 3, label: 'Wave 3 · Final reminder', sent: w3 },
            ].map(wave => {
              const pct = planLimit > 0 ? Math.min(Math.round((wave.sent / planLimit) * 100), 100) : 0
              const status = wave.sent >= planLimit ? 'Complete' : wave.sent > 0 ? 'In progress' : 'Pending'
              return (
                <div className="rb-wave-item" key={wave.n}>
                  <div className="rb-wave-head">
                    <span className="rb-wave-title">{wave.label}</span>
                    <span className="rb-wave-status">{status}</span>
                  </div>
                  <div className="rb-wave-count">{wave.sent.toLocaleString()} / {planLimit.toLocaleString()} recruiters</div>
                  <div className="rb-wave-track"><div className="rb-wave-fill" style={{ width: `${pct}%` }} /></div>
                </div>
              )
            })}
          </div>
          <p className="rb-wave-note">
            Each wave sends daily until your full recruiter list is reached. Wave 2 and Wave 3 begin only after the previous wave finishes, so it's normal for later waves to show 0 for a while.
          </p>
        </div>
      )}

      {/* ✅ NEW: Recruiters reached — company / phone / website, once the campaign
          is fully completed and send-tracking data exists for it. Hidden entirely
          while loading or unavailable, so it never shows a broken/empty-looking
          section for older campaigns that predate send-tracking. */}
      {currentBlast?.status === 'completed' && currentBlast?.plan_name !== 'free' && recruitersState.available && (
        <div className="rb-recruiters-section">
          <div className="rb-recruiters-head">
            <h3>Recruiters your resume reached</h3>
            {recruitersState.count > 0 && (
              <input
                type="text"
                className="rb-recruiters-search"
                placeholder="Search by company..."
                value={recruiterSearch}
                onChange={e => setRecruiterSearch(e.target.value)}
              />
            )}
          </div>

          {recruitersState.count === 0 ? (
            <div className="rb-recruiters-empty">No recruiter details available for this campaign yet.</div>
          ) : (
            <>
              <div className="rb-recruiters-table-wrap">
                <table className="rb-recruiters-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Phone Number</th>
                      <th>Website</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecruiters.map((r, i) => (
                      <tr key={i}>
                        <td>{r.company_name || '—'}</td>
                        <td>{r.contact_number || '—'}</td>
                        <td>
                          {r.website_url
                            ? <a href={r.website_url} target="_blank" rel="noopener noreferrer">{r.website_url}</a>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="rb-recruiters-footer">
                Showing {filteredRecruiters.length} of {recruitersState.count}
              </p>
            </>
          )}

          <p className="rb-recruiters-disclaimer">
            Company details are shown for recruiters your resume was fully delivered to, based on our records, and may not always be current or complete.
          </p>
        </div>
      )}

    </div>
  )
}

export default UserDashboard