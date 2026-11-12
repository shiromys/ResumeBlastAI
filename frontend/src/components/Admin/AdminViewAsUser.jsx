import { useState, useEffect } from 'react'
import { adminFetch } from '../../services/adminApi'

const PLAN_LIMITS = {
  free: 11, starter: 250, basic: 500,
  professional: 750, growth: 1000, advanced: 1250, premium: 1500,
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// ✅ NEW: "View as this user" — a read-only rendering of what this user's
// own dashboard currently shows, so a rep debugging "my campaign shows 0
// recruiters" can SEE it rather than guess from raw table rows.
//
// Deliberately a SEPARATE component from frontend/src/components/UserDashboard.jsx,
// not a shared/parameterized version of it:
//   1. The real UserDashboard.jsx fetches via the Supabase JS client under
//      the SIGNED-IN user's own RLS policy ("read your own rows"). Reusing
//      it here, with the admin's own session, would just come back empty
//      for anyone other than the admin's own account — it is not simply a
//      matter of passing a different `user` prop in.
//   2. This keeps the real, must-not-break customer-facing dashboard
//      completely untouched by this feature — zero risk of an admin-only
//      change leaking into it.
// Data comes from two reads, both already proven safe elsewhere:
//   - GET /api/admin/users/<id>/dashboard-view (new, admin-authed) for the
//     latest campaign row.
//   - GET /api/user/campaign/<id>/recruiters?user_id=<id> — the SAME
//     existing, already-public endpoint UserDashboard.jsx itself calls,
//     reused as-is here.
function AdminViewAsUser({ userId, userEmail, userName, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [blast, setBlast] = useState(null)
  const [recruiters, setRecruiters] = useState({ loading: false, available: false, list: [], count: 0 })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await adminFetch(`${API_URL}/api/admin/users/${userId}/dashboard-view`)
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`)
        if (cancelled) return
        setBlast(json.blast || null)

        if (json.blast && json.blast.status === 'completed' && json.blast.plan_name !== 'free') {
          setRecruiters(r => ({ ...r, loading: true }))
          try {
            const rRes = await fetch(`${API_URL}/api/user/campaign/${json.blast.id}/recruiters?user_id=${userId}`)
            const rJson = await rRes.json()
            if (cancelled) return
            setRecruiters({
              loading: false,
              available: !!rJson.available,
              list: rJson.recruiters || [],
              count: rJson.count || 0,
            })
          } catch {
            if (!cancelled) setRecruiters({ loading: false, available: false, list: [], count: 0 })
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [userId])

  const planName = blast?.plan_name?.toLowerCase() || 'starter'
  const planLimit = PLAN_LIMITS[planName] || 250
  const w1 = blast ? (parseInt(blast.drip_day1_delivered) || 0) : 0
  const w2 = blast ? (parseInt(blast.drip_day2_delivered) || 0) : 0
  const w3 = blast ? (parseInt(blast.drip_day3_delivered) || 0) : 0
  const recruitersReached = blast ? Math.max(w1, w2, w3) : 0
  const totalDelivered = w1 + w2 + w3
  const totalExpected = planLimit * 3
  const deliveryPct = totalExpected > 0 ? Math.min(Math.round((totalDelivered / totalExpected) * 100), 100) : 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 10100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)' }}>

        {/* Impersonation banner — unmissable, so no one confuses this with their own view */}
        <div style={{ background: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)', color: 'white', padding: '16px 24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.85 }}>Read-only — Viewing as</div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>{userName || userEmail || userId}</div>
          </div>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Close
          </button>
        </div>

        <div style={{ padding: '28px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px' }}><div className="spinner"></div></div>
          ) : error ? (
            <div style={{ color: '#DC2626', fontSize: '13px' }}>Couldn't load this user's dashboard view: {error}</div>
          ) : !blast ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#9CA3AF', fontSize: '14px' }}>
              This user has no campaign yet — their dashboard would show a "Get Started" screen instead.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '22px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>{recruitersReached.toLocaleString()}</div>
                  <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>Recruiters reached (Wave 1)</div>
                </div>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '22px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>{totalDelivered.toLocaleString()}</div>
                  <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>Total emails delivered</div>
                </div>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '22px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#DC2626' }}>{deliveryPct}%</div>
                  <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>Campaign progress</div>
                </div>
              </div>

              <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '22px', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 18px 0', color: '#0F172A' }}>Campaign progress</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {[
                    { n: 1, label: 'Wave 1 · Introduction', sent: w1 },
                    { n: 2, label: 'Wave 2 · Follow-up', sent: w2 },
                    { n: 3, label: 'Wave 3 · Final reminder', sent: w3 },
                  ].map(wave => {
                    const pct = planLimit > 0 ? Math.min(Math.round((wave.sent / planLimit) * 100), 100) : 0
                    const status = wave.sent >= planLimit ? 'Complete' : wave.sent > 0 ? 'In progress' : 'Pending'
                    return (
                      <div key={wave.n}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{wave.label}</span>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280' }}>{status}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '6px' }}>{wave.sent.toLocaleString()} / {planLimit.toLocaleString()} recruiters</div>
                        <div style={{ height: '8px', background: '#F3F4F6', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#DC2626' }}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {blast.status === 'completed' && blast.plan_name !== 'free' && recruiters.available && (
                <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '22px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 14px 0', color: '#0F172A' }}>Recruiters reached ({recruiters.count})</h3>
                  {recruiters.count === 0 ? (
                    <div style={{ color: '#9CA3AF', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>No recruiter details available for this campaign yet.</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', borderBottom: '1px solid #F1F5F9' }}>Company</th>
                            <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', borderBottom: '1px solid #F1F5F9' }}>Phone</th>
                            <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', borderBottom: '1px solid #F1F5F9' }}>Website</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recruiters.list.map((r, i) => (
                            <tr key={i}>
                              <td style={{ padding: '8px 10px', borderBottom: '1px solid #F8FAFC' }}>{r.company_name || '—'}</td>
                              <td style={{ padding: '8px 10px', borderBottom: '1px solid #F8FAFC' }}>{r.contact_number || '—'}</td>
                              <td style={{ padding: '8px 10px', borderBottom: '1px solid #F8FAFC' }}>{r.website_url || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminViewAsUser