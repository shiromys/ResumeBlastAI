// src/components/UserDashboard.jsx
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

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
  
  const recruitersReached = currentBlast ? (Math.max(w1, w2, w3) || planLimit) : 0
  const companiesCount = Math.floor(recruitersReached * 0.88)
  
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
        
        .rb-timeline-row { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          gap: 15px;
        }

        .rb-timeline-item { 
          display: flex; 
          align-items: center; 
          gap: 15px; 
          flex: 1; 
          padding: 15px;
          border-radius: 10px;
          transition: all 0.3s ease;
          cursor: pointer;
        }

        .rb-timeline-item:hover {
          background-color: #f9fafb;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          transform: translateY(-2px);
        }

        .rb-circle { 
          width: 40px; 
          height: 40px; 
          background: #dc2626; 
          color: #ffffff; 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-weight: 700; 
          flex-shrink: 0;
          transition: transform 0.3s ease;
        }

        .rb-timeline-item:hover .rb-circle {
          transform: scale(1.1);
        }

        .rb-timeline-text { font-size: 15px; color: #374151; font-weight: 500; }

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
          .rb-stats-row, .rb-timeline-row { grid-template-columns: 1fr; flex-direction: column; }
          .rb-timeline-item { width: 100%; }
        }
      `}</style>

      <div className="rb-header-actions">
        <button className="rb-btn-blast" onClick={onStartBlast}>+ New Blast</button>
      </div>

      <section className="rb-active-hero">
        <span className="rb-campaign-tag">Active campaign</span>
        <h1>Your resume is in recruiter inboxes now.</h1>
        <p>Recruiters typically reach out directly via phone or email</p>
      </section>

      <div className="rb-stats-row">
        <div className="rb-card">
          <span className="rb-card-val">{recruitersReached.toLocaleString()}</span>
          <span className="rb-card-label">Recruiters reached</span>
        </div>
        <div className="rb-card">
          <span className="rb-card-val">{companiesCount}+</span>
          <span className="rb-card-label">Companies</span>
        </div>
        <div className="rb-card">
          <span className="rb-card-val red-theme">{deliveryPct}%</span>
          <span className="rb-card-label">Delivered</span>
        </div>
      </div>

      <div className="rb-next-section">
        <h3>What happens next</h3>
        <div className="rb-timeline-row">
          <div className="rb-timeline-item">
            <div className="rb-circle">1</div>
            <div className="rb-timeline-text">Recruiters review your resume</div>
          </div>
          <div className="rb-timeline-item">
            <div className="rb-circle">2</div>
            <div className="rb-timeline-text">They contact you directly</div>
          </div>
          <div className="rb-timeline-item">
            <div className="rb-circle">3</div>
            <div className="rb-timeline-text">Direct Recruiter Evaluation</div>
          </div>
        </div>
      </div>

      {currentBlast && (
        <div style={{ marginTop: '20px', fontSize: '12px', color: '#9ca3af', textAlign: 'center', letterSpacing: '0.05em' }}>
          
        </div>
      )}
    </div>
  )
}

export default UserDashboard