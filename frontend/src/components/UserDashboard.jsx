// src/components/UserDashboard.jsx
// Professional redesign — matches ResumeBlast.ai red/white brand
// All data logic 100% preserved — only UI changed

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import './UserDashboard.css'

// ── SVG Icons ──────────────────────────────────────────────
const Icon = {
  Rocket:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
  Doc:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Users:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Check:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Eye:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Click:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/></svg>,
  Warn:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Send:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  ChevronDown: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>,
  ChevronRight: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Plus:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Star:    () => <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
}

// ── Main Component ─────────────────────────────────────────
function UserDashboard({ user, onStartBlast }) {
  const [loading, setLoading]       = useState(true)
  const [data, setData]             = useState({ blasts: [], payments: [], resumes: [] })
  const [expandedBlast, setExpanded] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        if (!user) return
        const [{ data: blasts }, { data: payments }, { data: resumes }] = await Promise.all([
          supabase.from('blast_campaigns').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
          supabase.from('payments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
          supabase.from('resumes').select('*').eq('user_id', user.id).order('uploaded_at', { ascending: false }).limit(5),
        ])
        setData({ blasts: blasts || [], payments: payments || [], resumes: resumes || [] })
        if (blasts?.length > 0) setExpanded(blasts[0].id)
      } catch (e) {
        console.error('Dashboard load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  // Receipt generator — untouched
  const downloadReceipt = (payment) => {
    const doc = new jsPDF()
    doc.setFillColor(220, 38, 38)
    doc.rect(0, 0, 210, 20, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.text("ResumeBlast.ai - Payment Receipt", 10, 13)
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(12)
    doc.text(`Date: ${new Date(payment.created_at).toLocaleDateString()}`, 10, 40)
    doc.text(`Receipt ID: ${payment.id.substr(0, 8).toUpperCase()}`, 10, 50)
    doc.text(`Amount: $${(payment.amount / 100).toFixed(2)}`, 10, 60)
    doc.text(`Status: Paid`, 10, 70)
    doc.save(`receipt_${payment.created_at.slice(0, 10)}.pdf`)
  }

  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  // Totals for summary bar
  const totalReached   = data.blasts.reduce((s, b) => s + (parseInt(b.recipients_count) || 0), 0)
  const totalDelivered = data.blasts.reduce((s, b) => s + (b.delivered_count || 0), 0)
  const totalOpened    = data.blasts.reduce((s, b) => s + (b.opened_count || 0), 0)
  const avgOpenRate    = totalDelivered > 0 ? Math.round((totalOpened / totalDelivered) * 100) : 0

  if (loading) return (
    <div className="db-loading">
      <div className="db-spinner" /><span>Loading your dashboard…</span>
    </div>
  )

  return (
    <div className="db-wrap">

      {/* ── PAGE HEADER ── */}
      <div className="db-page-header">
        <div className="db-page-header-inner">
          <div className="db-user-row">
            <div className="db-avatar">{initials}</div>
            <div>
              <h1 className="db-welcome">Welcome back, <span>{name}</span></h1>
              <p className="db-subtitle">Here's how your resume campaigns are performing</p>
            </div>
          </div>
          <button className="db-cta-btn" onClick={onStartBlast}>
            <span className="db-cta-icon"><Icon.Plus /></span>
            New Blast
          </button>
        </div>

        {/* ── STAT STRIP ── */}
        <div className="db-stat-strip">
          <StatPill icon={<Icon.Rocket />}  label="Campaigns"  value={data.blasts.length}              color="white" />
          <div className="db-stat-divider" />
          <StatPill icon={<Icon.Users />}   label="Reached"    value={totalReached.toLocaleString()}    color="white" />
          <div className="db-stat-divider" />
          <StatPill icon={<Icon.Check />}   label="Delivered"  value={totalDelivered.toLocaleString()}  color="white" />
          <div className="db-stat-divider" />
          <StatPill icon={<Icon.Eye />}     label="Avg Open Rate" value={`${avgOpenRate}%`}             color="white" />
          <div className="db-stat-divider" />
          <StatPill icon={<Icon.Doc />}     label="Resumes"    value={data.resumes.length}              color="white" />
        </div>
      </div>

      <div className="db-body">

        {/* ── BLAST CAMPAIGNS ── */}
        <section className="db-card">
          <div className="db-card-header">
            <div className="db-card-title">
              <span className="db-card-title-icon"><Icon.Rocket /></span>
              Blast Campaigns
            </div>
            <span className="db-card-count">{data.blasts.length} total</span>
          </div>

          {data.blasts.length === 0 ? (
            <EmptyState icon={<Icon.Rocket />} message="No blasts yet" action="Start your first blast" onClick={onStartBlast} />
          ) : (
            <div className="db-blast-list">
              {data.blasts.map((b, i) => (
                <BlastRow
                  key={b.id}
                  blast={b}
                  index={i}
                  expanded={expandedBlast === b.id}
                  onToggle={() => setExpanded(expandedBlast === b.id ? null : b.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── RECENT RESUMES ── */}
        <section className="db-card">
          <div className="db-card-header">
            <div className="db-card-title">
              <span className="db-card-title-icon"><Icon.Doc /></span>
              Recent Uploads
            </div>
            <span className="db-card-count">{data.resumes.length} files</span>
          </div>

          {data.resumes.length === 0 ? (
            <EmptyState icon={<Icon.Doc />} message="No resumes uploaded yet" />
          ) : (
            <div className="db-resume-list">
              {data.resumes.map((r, i) => (
                <div key={r.id} className="db-resume-row" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="db-resume-file-icon"><Icon.Doc /></div>
                  <div className="db-resume-info">
                    <span className="db-resume-filename">{r.file_name || 'Resume.pdf'}</span>
                    <span className="db-resume-meta">
                      {new Date(r.uploaded_at || r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <span className="db-role-tag">{r.detected_role || 'General'}</span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}


// ── BLAST ROW ─────────────────────────────────────────────
function BlastRow({ blast, index, expanded, onToggle }) {
  const recipients  = parseInt(blast.recipients_count) || 0
  const delivered   = blast.delivered_count || 0
  const opened      = blast.opened_count    || 0
  const clicked     = blast.clicked_count   || 0
  const bounced     = blast.bounced_count   || 0
  const spam        = blast.spam_count      || 0
  const deliveryPct = recipients > 0 ? Math.round((delivered / recipients) * 100) : 0
  const openPct     = delivered  > 0 ? Math.round((opened    / delivered)  * 100) : 0
  const clickPct    = opened     > 0 ? Math.round((clicked   / opened)     * 100) : 0

  const isCompleted = blast.status === 'completed'
  const hasData     = delivered > 0 || opened > 0

  const dateStr = new Date(blast.created_at || blast.initiated_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })

  // Drip
  const fmtDt = (iso) => iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    : null

  const d1At     = blast.drip_day1_sent_at
  const d2At     = blast.drip_day2_sent_at
  const d3At     = blast.drip_day3_sent_at
  const d2Status = blast.drip_day2_status || 'pending'
  const d3Status = blast.drip_day3_status || 'pending'

  return (
    <div className={`db-blast-row ${expanded ? 'db-blast-row--open' : ''}`} style={{ animationDelay: `${index * 60}ms` }}>

      {/* ── Summary line ── */}
      <button className="db-blast-summary" onClick={onToggle}>
        <div className="db-blast-summary-left">
          <span className={`db-status-dot ${isCompleted ? 'dot--green' : 'dot--amber'}`} />
          <div>
            <span className="db-blast-industry">{blast.industry || 'Campaign'}</span>
            <span className="db-blast-date">{dateStr}</span>
          </div>
        </div>

        <div className="db-blast-summary-mid">
          <span className="db-info-chip">
            <span className="db-info-chip-icon"><Icon.Users /></span>
            {recipients.toLocaleString()}
          </span>
          {hasData
            ? <span className="db-info-chip db-info-chip--green">
                <span className="db-info-chip-icon"><Icon.Check /></span>
                {deliveryPct}% delivered
              </span>
            : <span className="db-info-chip db-info-chip--muted">Awaiting stats</span>
          }
        </div>

        <div className="db-blast-summary-right">
          <span className={`db-badge ${isCompleted ? 'db-badge--green' : 'db-badge--amber'}`}>
            {isCompleted ? 'Completed' : (blast.status || 'Processing')}
          </span>
          <span className={`db-chevron ${expanded ? 'db-chevron--open' : ''}`}>
            <Icon.ChevronDown />
          </span>
        </div>
      </button>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div className="db-blast-detail">

          {/* Metric cards */}
          <div className="db-metrics-grid">
            <MetricCard color="default" icon={<Icon.Send />}  label="Sent"      value={recipients.toLocaleString()} sub="Total"              />
            <MetricCard color="green"   icon={<Icon.Check />} label="Delivered" value={delivered.toLocaleString()}  sub={`${deliveryPct}% rate`} />
            <MetricCard color="blue"    icon={<Icon.Eye />}   label="Opened"    value={opened.toLocaleString()}     sub={`${openPct}% rate`}     />
            <MetricCard color="amber"   icon={<Icon.Click />} label="Clicked"   value={clicked.toLocaleString()}    sub={`${clickPct}% rate`}    />
            <MetricCard color="red"     icon={<Icon.Warn />}  label="Bounced"   value={bounced.toLocaleString()}    sub={spam > 0 ? `${spam} spam` : 'No spam'} />
          </div>

          {/* Drip section */}
          <div className="db-drip-wrap">
            <div className="db-drip-label">
              <Icon.Star />
              3-Day Drip Campaign
            </div>
            <div className="db-drip-timeline">
              <DripDay
                n={1}
                status={d1At ? 'sent' : 'pending'}
                time={fmtDt(d1At)}
                delivered={blast.drip_day1_delivered || 0}
                opened={blast.drip_day1_opened || 0}
                note={null}
              />
              <div className="db-drip-arrow"><Icon.ChevronRight /></div>
              <DripDay
                n={2}
                status={d2At ? 'sent' : d2Status}
                time={fmtDt(d2At)}
                delivered={blast.drip_day2_delivered || 0}
                opened={blast.drip_day2_opened || 0}
                note={!d2At ? '+24 hrs after Day 1' : null}
              />
              <div className="db-drip-arrow"><Icon.ChevronRight /></div>
              <DripDay
                n={3}
                status={d3At ? 'sent' : d3Status}
                time={fmtDt(d3At)}
                delivered={blast.drip_day3_delivered || 0}
                opened={blast.drip_day3_opened || 0}
                note={!d3At ? '+48 hrs after Day 1' : null}
              />
            </div>
          </div>

          <p className="db-detail-note">
            Stats update automatically as recruiters open and click your resume. Drip emails send automatically via Brevo.
          </p>
        </div>
      )}
    </div>
  )
}


// ── DRIP DAY ──────────────────────────────────────────────
function DripDay({ n, status, time, delivered, opened, note }) {
  const map = {
    sent:      { label: 'Sent',      cls: 'drip--sent'      },
    sending:   { label: 'Sending',   cls: 'drip--sending'   },
    scheduled: { label: 'Scheduled', cls: 'drip--scheduled' },
    pending:   { label: 'Pending',   cls: 'drip--pending'   },
    failed:    { label: 'Failed',    cls: 'drip--failed'    },
  }
  const { label, cls } = map[status] || map.pending
  const openPct = delivered > 0 ? Math.round((opened / delivered) * 100) : 0

  return (
    <div className={`db-drip-day ${cls}`}>
      <div className="db-drip-day-num">Day {n}</div>
      <div className="db-drip-status-pill">{label}</div>
      {time   && <div className="db-drip-time">{time}</div>}
      {note   && !time && <div className="db-drip-note">{note}</div>}
      {status === 'sent' && (
        <div className="db-drip-chips">
          {delivered > 0
            ? <span className="db-drip-chip db-drip-chip--green">{delivered} delivered</span>
            : <span className="db-drip-chip db-drip-chip--muted">Updating…</span>
          }
          {opened > 0 && (
            <span className="db-drip-chip db-drip-chip--blue">{opened} opened ({openPct}%)</span>
          )}
        </div>
      )}
    </div>
  )
}


// ── METRIC CARD ───────────────────────────────────────────
function MetricCard({ icon, label, value, sub, color }) {
  return (
    <div className={`db-metric db-metric--${color}`}>
      <div className="db-metric-icon">{icon}</div>
      <div className="db-metric-value">{value}</div>
      <div className="db-metric-label">{label}</div>
      {sub && <div className="db-metric-sub">{sub}</div>}
    </div>
  )
}

// ── STAT PILL ─────────────────────────────────────────────
function StatPill({ icon, label, value }) {
  return (
    <div className="db-stat-pill">
      <span className="db-stat-pill-icon">{icon}</span>
      <div>
        <div className="db-stat-pill-value">{value}</div>
        <div className="db-stat-pill-label">{label}</div>
      </div>
    </div>
  )
}

// ── EMPTY STATE ───────────────────────────────────────────
function EmptyState({ icon, message, action, onClick }) {
  return (
    <div className="db-empty">
      <div className="db-empty-icon">{icon}</div>
      <p className="db-empty-msg">{message}</p>
      {action && <button className="db-empty-btn" onClick={onClick}>{action}</button>}
    </div>
  )
}

export default UserDashboard