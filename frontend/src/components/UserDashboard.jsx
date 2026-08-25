// src/components/UserDashboard.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ProfileSection from './ProfileSection'

// Plan mapping to ensure we don't show 0 if DB column is missing
const PLAN_LIMITS = {
  free: 11, starter: 250, basic: 500,
  professional: 750, growth: 1000, advanced: 1250, premium: 1500,
}

function UserDashboard({ user, onStartBlast }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ blasts: [] })

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

    </div>
  )
}

export default UserDashboard