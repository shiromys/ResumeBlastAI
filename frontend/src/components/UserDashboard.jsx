// src/components/UserDashboard.jsx
// All original functionality preserved.
// NEW: Day-by-day drip updates fetched live from drip_email_logs table.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import jsPDF from 'jspdf'
import './UserDashboard.css'

// ─── Icons ────────────────────────────────────────────────
const Icon = {
  Rocket:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
  Doc:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Users:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Check:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Eye:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Click:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/></svg>,
  Warn:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Send:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  ChevDown: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>,
  ChevRight:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Plus:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Star:     () => <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  Download: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Clock:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Refresh:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  Shield:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Activity: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  BarChart: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
  Mail:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  XCircle:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6m0-6 6 6"/></svg>,
  Calendar: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
}

// ─── Plan tier config ──────────────────────────────────────
const TIER_LABELS = {
  0:     { label: 'Free',         color: '#6B7280' },
  9.99:  { label: 'Starter',      color: '#2563EB' },
  14.99: { label: 'Basic',        color: '#7C3AED' },
  29.99: { label: 'Professional', color: '#0891B2' },
  39.99: { label: 'Pro',          color: '#DC2626' },
  49.99: { label: 'Premium',      color: '#D97706' },
  59.99: { label: 'Elite',        color: '#059669' },
}

function getPlanLabel(blast) {
  const price = parseFloat(blast.tier_price || blast.amount || 0)
  for (const [key, val] of Object.entries(TIER_LABELS)) {
    if (Math.abs(parseFloat(key) - price) < 0.01) return val
  }
  if ((blast.recipients_count || 0) <= 11)  return { label: 'Free',  color: '#6B7280' }
  if ((blast.recipients_count || 0) <= 500) return { label: 'Basic', color: '#7C3AED' }
  return { label: 'Pro', color: '#DC2626' }
}

function getHealthScore(openPct) {
  if (openPct >= 25) return { label: 'Excellent', cls: 'health--excellent' }
  if (openPct >= 15) return { label: 'Good',      cls: 'health--good'      }
  if (openPct >= 8)  return { label: 'Fair',      cls: 'health--fair'      }
  if (openPct > 0)   return { label: 'Low',       cls: 'health--low'       }
  return null
}

function msToCountdown(ms) {
  if (ms <= 0) return null
  const totalMin = Math.floor(ms / 60000)
  const days  = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins  = totalMin % 60
  if (days > 0)  return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtRelative(iso) {
  if (!iso) return ''
  const diffH = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (diffH < 1)  return 'just now'
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7)  return `${diffD}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Main Component ────────────────────────────────────────
function UserDashboard({ user, onStartBlast }) {
  const [loading, setLoading]           = useState(true)
  const [data, setData]                 = useState({ blasts: [], payments: [], resumes: [] })
  // drip logs keyed by campaign_id → array of day rows from drip_email_logs
  const [dripLogs, setDripLogs]         = useState({})
  const [expandedBlast, setExpanded]    = useState(null)
  const [lastRefresh, setLastRefresh]   = useState(Date.now())
  const [refreshLabel, setRefreshLabel] = useState('Just now')

  // ── Load blast_campaigns + resumes + payments (original) ──
  const loadData = useCallback(async () => {
    if (!user) return
    try {
      const [{ data: blasts }, { data: payments }, { data: resumes }] = await Promise.all([
        supabase.from('blast_campaigns').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('payments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('resumes').select('*').eq('user_id', user.id).order('uploaded_at', { ascending: false }).limit(5),
      ])
      setData({ blasts: blasts || [], payments: payments || [], resumes: resumes || [] })
      setLastRefresh(Date.now())
    } catch (e) {
      console.error('Dashboard load error:', e)
    }
  }, [user])

  // ── Load drip_email_logs — the source of truth for day updates ──
  const loadDripLogs = useCallback(async () => {
    if (!user) return
    try {
      const { data: logs, error } = await supabase
        .from('drip_email_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('day_number', { ascending: true })

      if (error) { console.error('Drip logs fetch error:', error); return }

      // Group rows by campaign_id so each blast can look up its own days
      const grouped = {}
      ;(logs || []).forEach(row => {
        if (!grouped[row.campaign_id]) grouped[row.campaign_id] = []
        grouped[row.campaign_id].push(row)
      })
      setDripLogs(grouped)
    } catch (e) {
      console.error('Drip logs error:', e)
    }
  }, [user])

  // ── Initial load ──
  useEffect(() => {
    if (!user) return
    Promise.all([loadData(), loadDripLogs()]).finally(() => setLoading(false))
  }, [user])

  // ── Auto-expand first blast ──
  useEffect(() => {
    if (data.blasts?.length > 0 && !expandedBlast) {
      setExpanded(data.blasts[0].id)
    }
  }, [data.blasts])

  // ── Auto-refresh every 60s when any blast is active ──
  useEffect(() => {
    const hasActive = data.blasts.some(b => b.status !== 'completed')
    if (!hasActive) return
    const interval = setInterval(() => {
      loadData()
      loadDripLogs()
    }, 60000)
    return () => clearInterval(interval)
  }, [data.blasts, loadData, loadDripLogs])

  // ── "Updated X min ago" label ──
  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - lastRefresh) / 60000)
      setRefreshLabel(diff < 1 ? 'Just now' : `${diff} min ago`)
    }, 30000)
    return () => clearInterval(timer)
  }, [lastRefresh])

  // ── Receipt download (ORIGINAL — untouched) ──
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

  const name     = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  // ── Totals for stat strip (original logic) ──
  const totalReached   = data.blasts.reduce((s, b) => s + (parseInt(b.recipients_count) || 0), 0)
  const totalDelivered = data.blasts.reduce((s, b) => s + (b.delivered_count || 0), 0)
  const totalOpened    = data.blasts.reduce((s, b) => s + (b.opened_count    || 0), 0)
  const avgOpenRate    = totalDelivered > 0 ? Math.round((totalOpened / totalDelivered) * 100) : 0

  const latestBlast = data.blasts[0]
  const planInfo    = latestBlast ? getPlanLabel(latestBlast) : null

  if (loading) return (
    <div className="db-loading">
      <div className="db-spinner" /><span>Loading your dashboard…</span>
    </div>
  )

  return (
    <div className="db-wrap">

      {/* ── HEADER ── */}
      <div className="db-page-header">
        <div className="db-page-header-inner">
          <div className="db-user-row">
            <div className="db-avatar">{initials}</div>
            <div>
              <h1 className="db-welcome">Welcome back, <span>{name}</span></h1>
              <p className="db-subtitle">Here's how your resume campaigns are performing</p>
            </div>
          </div>
          <div className="db-header-right">
            {planInfo && (
              <div className="db-plan-badge" style={{ '--plan-color': planInfo.color }}>
                <span className="db-plan-badge-dot" />
                {planInfo.label} Plan
              </div>
            )}
            <div className="db-refresh-label">
              <span className="db-refresh-icon"><Icon.Refresh /></span>
              {refreshLabel}
            </div>
            <button className="db-cta-btn" onClick={onStartBlast}>
              <span className="db-cta-icon"><Icon.Plus /></span>
              New Blast
            </button>
          </div>
        </div>

        {/* STAT STRIP (original) */}
        <div className="db-stat-strip">
          <StatPill icon={<Icon.Rocket />}  label="Campaigns"     value={data.blasts.length}             />
          <div className="db-stat-divider" />
          <StatPill icon={<Icon.Users />}   label="Reached"       value={totalReached.toLocaleString()}   />
          <div className="db-stat-divider" />
          <StatPill icon={<Icon.Check />}   label="Delivered"     value={totalDelivered.toLocaleString()} />
          <div className="db-stat-divider" />
          <StatPill icon={<Icon.Eye />}     label="Avg Open Rate" value={`${avgOpenRate}%`}               />
          <div className="db-stat-divider" />
          <StatPill icon={<Icon.Doc />}     label="Resumes"       value={data.resumes.length}             />
        </div>
      </div>

      <div className="db-body">

        {/* ── LEFT: campaigns + resumes ── */}
        <div className="db-main-col">

          {/* BLAST CAMPAIGNS */}
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

          {/* RECENT RESUMES (original) */}
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

        {/* ── RIGHT SIDEBAR ── */}
        {data.blasts.length > 0 && (
          <aside className="db-sidebar">
            <PlanCard blasts={data.blasts} />
            <RecruiterReachCard blasts={data.blasts} />
            <ActivityFeedCard blasts={data.blasts} dripLogs={dripLogs} />
          </aside>
        )}
      </div>
    </div>
  )
}


// ─── Blast Row ─────────────────────────────────────────────
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
  const planInfo    = getPlanLabel(blast)
  const health      = getHealthScore(openPct)

  // Wave progress computed from blast_campaigns columns directly
  const planNm     = getPlanName(blast)
  const planLmt    = getPlanLimit(planNm)
  const isFreeBlast = planNm === 'free' || planLmt <= 11
  const w1Done     = !!blast.drip_day1_sent_at
  const w2Done     = !!blast.drip_day2_sent_at
  const w3Done     = !!blast.drip_day3_sent_at
  const wavesDone  = [w1Done, w2Done, w3Done].filter(Boolean).length
  const totalWavesNum = isFreeBlast ? 1 : 3
  const w1Sent     = parseInt(blast.drip_day1_delivered) || 0
  const w2Sent     = parseInt(blast.drip_day2_delivered) || 0
  const w3Sent     = parseInt(blast.drip_day3_delivered) || 0
  const totalDripSent = w1Sent + w2Sent + w3Sent

  const dateStr = new Date(blast.created_at || blast.initiated_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  // Campaign report PDF
  const downloadReport = (e) => {
    e.stopPropagation()
    const doc = new jsPDF()
    doc.setFillColor(220, 38, 38)
    doc.rect(0, 0, 210, 22, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.text('ResumeBlast.ai — Campaign Report', 10, 14)
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(11)
    let y = 32
    const line = (lbl, val) => { doc.text(`${lbl}: ${val}`, 10, y); y += 7 }
    doc.setFont(undefined, 'bold'); doc.text('Campaign Summary', 10, y); y += 8; doc.setFont(undefined, 'normal')
    line('Industry / Role', blast.industry || 'N/A')
    line('Plan',            planInfo.label)
    line('Date',            dateStr)
    line('Recipients',      recipients.toLocaleString())
    y += 4
    doc.setFont(undefined, 'bold'); doc.text('Delivery Stats', 10, y); y += 8; doc.setFont(undefined, 'normal')
    line('Delivered', `${delivered.toLocaleString()} (${deliveryPct}%)`)
    line('Opened',    `${opened.toLocaleString()} (${openPct}%)`)
    line('Clicked',   `${clicked.toLocaleString()} (${clickPct}%)`)
    line('Bounced',   bounced.toLocaleString())
    line('Spam',      spam.toString())
    y += 4
    doc.setFont(undefined, 'bold'); doc.text('Drip Email Schedule', 10, y); y += 8; doc.setFont(undefined, 'normal')
    if (!isFreeBlast) {
      line('Wave 1 (Initial)', `${w1Sent.toLocaleString()} sent${w1Done ? ' — Complete' : ' — In progress'}`)
      line('Wave 2 (Follow-up)', w1Done ? `${w2Sent.toLocaleString()} sent${w2Done ? ' — Complete' : ' — In progress'}` : 'Pending')
      line('Wave 3 (Reminder)', w2Done ? `${w3Sent.toLocaleString()} sent${w3Done ? ' — Complete' : ' — In progress'}` : 'Pending')
      line('Total emails sent', totalDripSent.toLocaleString())
    }
    if (health) { y += 4; doc.setFont(undefined, 'bold'); doc.text(`Campaign Health: ${health.label} (${openPct}% open rate)`, 10, y) }
    doc.save(`campaign_report_${(blast.created_at || '').slice(0, 10)}.pdf`)
  }

  return (
    <div className={`db-blast-row ${expanded ? 'db-blast-row--open' : ''}`} style={{ animationDelay: `${index * 60}ms` }}>

      {/* Summary row */}
      <button className="db-blast-summary" onClick={onToggle}>
        <div className="db-blast-summary-left">
          <span className={`db-status-dot ${isCompleted ? 'dot--green' : 'dot--amber'}`} />
          <div>
            <span className="db-blast-industry">{blast.industry || 'Campaign'}</span>
            <span className="db-blast-date">{dateStr}</span>
          </div>
        </div>

        <div className="db-blast-summary-mid">
          <span className="db-info-chip db-info-chip--plan" style={{ '--plan-color': planInfo.color }}>
            {planInfo.label}
          </span>
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
          {!isFreeBlast && (
            <span className="db-info-chip db-info-chip--drip">
              <span className="db-info-chip-icon"><Icon.Star /></span>
              {wavesDone}/{totalWavesNum} waves · {totalDripSent.toLocaleString()} sent
            </span>
          )}
        </div>

        <div className="db-blast-summary-right">
          <span className={`db-badge ${isCompleted ? 'db-badge--green' : 'db-badge--amber'}`}>
            {isCompleted ? 'Completed' : (blast.status || 'Processing')}
          </span>
          <span className={`db-chevron ${expanded ? 'db-chevron--open' : ''}`}>
            <Icon.ChevDown />
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="db-blast-detail">

          {/* Metric cards (original) */}
          <div className="db-metrics-grid">
            <MetricCard color="default" icon={<Icon.Send />}  label="Sent"      value={recipients.toLocaleString()} sub="Total"               />
            <MetricCard color="green"   icon={<Icon.Check />} label="Delivered" value={delivered.toLocaleString()}  sub={`${deliveryPct}% rate`} />
            <MetricCard color="blue"    icon={<Icon.Eye />}   label="Opened"    value={opened.toLocaleString()}     sub={`${openPct}% rate`}     />
            <MetricCard color="amber"   icon={<Icon.Click />} label="Clicked"   value={clicked.toLocaleString()}    sub={`${clickPct}% rate`}    />
            <MetricCard color="red"     icon={<Icon.Warn />}  label="Bounced"   value={bounced.toLocaleString()}    sub={spam > 0 ? `${spam} spam` : 'No spam'} />
          </div>

          {/* ── DAY-BY-DAY DRIP UPDATES ── */}
          <DripDayUpdates blast={blast} />

          {/* Health score */}
          {health && hasData && (
            <div className="db-health-row">
              <span className="db-health-label"><Icon.Shield /> Campaign Health</span>
              <span className={`db-health-badge ${health.cls}`}>{health.label} · {openPct}% open rate</span>
            </div>
          )}

          {/* Download report */}
          <button className="db-report-btn" onClick={downloadReport}>
            <Icon.Download />
            Download Campaign Report
          </button>

          <p className="db-detail-note">
            Stats refresh every 60 seconds. Drip emails send automatically via Brevo on schedule.
          </p>
        </div>
      )}
    </div>
  )
}



// ═══════════════════════════════════════════════════════════
// DRIP CAMPAIGN — FULL DAY-BY-DAY UPDATES
//
// Real structure from drip_scheduler.py + drip_campaign.py:
//
// 3 WAVES (not 3 days):
//   Wave 1 (initial intro):  drip_day1_* columns — starts on payment day
//   Wave 2 (follow-up):      drip_day2_* columns — starts at day4_scheduled_for
//   Wave 3 (final reminder): drip_day3_* columns — starts at day8_scheduled_for
//
// Each wave sends 50 emails/day until plan limit is reached.
// PLAN TIMELINES (50 emails/day):
//   Free         11 recruiters →  1 day   (single blast, no drip)
//   Starter     250 recruiters →  5 days/wave × 3 =  15 days total,  750 total emails
//   Basic       500 recruiters → 10 days/wave × 3 =  30 days total, 1500 total emails
//   Professional 750 recruiters → 15 days/wave × 3 =  45 days total, 2250 total emails
//   Growth     1000 recruiters → 20 days/wave × 3 =  60 days total, 3000 total emails
//   Advanced   1250 recruiters → 25 days/wave × 3 =  75 days total, 3750 total emails
//   Premium    1500 recruiters → 30 days/wave × 3 =  90 days total, 4500 total emails
//
// KEY FIELDS READ FROM blast_campaigns:
//   plan_name                → "starter" | "basic" | "professional" | etc
//   drip_day1_delivered      → cumulative emails sent in Wave 1 (0→plan_limit)
//   drip_day1_last_date      → date of last Wave 1 batch (YYYY-MM-DD)
//   drip_day1_status         → "sending" | "sent"
//   drip_day1_sent_at        → set ONLY when entire Wave 1 is done
//   day4_scheduled_for       → ISO datetime when Wave 2 becomes eligible
//   drip_day2_delivered      → cumulative emails sent in Wave 2
//   drip_day2_last_date      → date of last Wave 2 batch
//   drip_day2_status         → "sending" | "sent"
//   drip_day2_sent_at        → set ONLY when entire Wave 2 is done
//   day8_scheduled_for       → ISO datetime when Wave 3 becomes eligible
//   drip_day3_delivered      → cumulative emails sent in Wave 3
//   drip_day3_last_date      → date of last Wave 3 batch
//   drip_day3_status         → "sending" | "sent"
//   drip_day3_sent_at        → set ONLY when entire Wave 3 is done
// ═══════════════════════════════════════════════════════════

// Plan config — must match drip_scheduler.py PLAN_LIMIT_MAP
const PLAN_LIMIT_MAP = {
  free:         11,
  starter:      250,
  basic:        500,
  professional: 750,
  growth:       1000,
  advanced:     1250,
  premium:      1500,
}
const DAILY_LIMIT = 50

function getPlanName(blast) {
  // Try plan_name column first (set by drip_campaign.py)
  if (blast.plan_name) return blast.plan_name.toLowerCase()
  // Fallback: derive from recipients_count
  const r = parseInt(blast.recipients_count) || 0
  if (r <= 11)   return 'free'
  if (r <= 250)  return 'starter'
  if (r <= 500)  return 'basic'
  if (r <= 750)  return 'professional'
  if (r <= 1000) return 'growth'
  if (r <= 1250) return 'advanced'
  return 'premium'
}

function getPlanLimit(planName) {
  return PLAN_LIMIT_MAP[planName] || 250
}

function getDaysPerWave(planName) {
  const limit = getPlanLimit(planName)
  return Math.ceil(limit / DAILY_LIMIT)
}

// Build the array of individual calendar-day rows for one wave
// Each row = one day's batch of up to 50 emails
function buildWaveDays(waveNum, blast, planName) {
  const planLimit   = getPlanLimit(planName)
  const daysPerWave = getDaysPerWave(planName)
  const DAILY       = Math.min(DAILY_LIMIT, planLimit)

  // Column name mapping — matches WAVE_FIELDS in drip_scheduler.py
  // Wave 1 → drip_day1_*, Wave 2 → drip_day2_*, Wave 3 → drip_day3_*
  const col = waveNum // 1, 2, or 3

  const cumulativeSent = parseInt(blast[`drip_day${col}_delivered`]) || 0
  const lastDate       = blast[`drip_day${col}_last_date`]  || null
  const waveStatus     = blast[`drip_day${col}_status`]     || null  // "sending"|"sent"|null
  const waveSentAt     = blast[`drip_day${col}_sent_at`]    || null  // set when wave done
  const waveStartISO   = waveNum === 1
    ? blast.created_at
    : waveNum === 2
      ? blast.day4_scheduled_for
      : blast.day8_scheduled_for

  // Determine if this wave has started at all
  const waveStarted = cumulativeSent > 0 || waveStatus === 'sending' || !!waveSentAt

  // Check if wave is even eligible yet (for Wave 2 & 3)
  let waveEligible = true
  if (waveNum === 2) {
    waveEligible = !!blast.drip_day1_sent_at  // Wave 1 must be complete
  } else if (waveNum === 3) {
    waveEligible = !!blast.drip_day2_sent_at  // Wave 2 must be complete
  }

  const waveComplete = !!waveSentAt  // sent_at only stamped when fully done

  // Build individual day rows
  const days = []
  for (let i = 0; i < daysPerWave; i++) {
    const dayNum      = i + 1
    const batchStart  = i * DAILY + 1           // e.g. 1, 51, 101 ...
    const batchEnd    = Math.min((i + 1) * DAILY, planLimit)
    const batchSize   = batchEnd - batchStart + 1

    // How many emails were sent on this specific calendar day?
    // We know cumulativeSent = total sent so far.
    // Days 1..floor(cumulative/50) are fully sent.
    // The current day (floor+1) is partially sent or in progress.
    const fullBatchesDone = Math.floor(cumulativeSent / DAILY)
    const partialSent     = cumulativeSent % DAILY

    let daySent   = 0
    let dayStatus = 'pending'

    if (!waveEligible) {
      dayStatus = 'locked'
      daySent   = 0
    } else if (!waveStarted) {
      dayStatus = 'pending'
      daySent   = 0
    } else if (i < fullBatchesDone) {
      // This day's batch is fully complete
      dayStatus = 'sent'
      daySent   = batchSize
    } else if (i === fullBatchesDone && !waveComplete) {
      // This is the current active day
      if (partialSent > 0) {
        dayStatus = 'sending'
        daySent   = partialSent
      } else if (lastDate) {
        // Today's batch just finished but wave not done
        dayStatus = 'sending'
        daySent   = DAILY
      } else {
        dayStatus = 'pending'
        daySent   = 0
      }
    } else {
      dayStatus = 'pending'
      daySent   = 0
    }

    // If the whole wave is marked complete and this is the last day
    if (waveComplete && i === daysPerWave - 1) {
      dayStatus = 'sent'
      daySent   = batchSize
    }
    // If wave complete and day before last
    if (waveComplete && i < daysPerWave - 1) {
      dayStatus = 'sent'
      daySent   = batchSize
    }

    days.push({
      waveNum,
      dayNum,
      batchStart,
      batchEnd,
      batchSize,
      status:     dayStatus,
      sent:       daySent,
      lastDate,   // only meaningful for the current active day
      scheduledFor: waveStartISO,
    })
  }
  return days
}


// ── Main component that renders all waves ──────────────────
function DripDayUpdates({ blast }) {
  const planName    = getPlanName(blast)
  const planLimit   = getPlanLimit(planName)
  const isFree      = planName === 'free' || planLimit <= 11
  const daysPerWave = getDaysPerWave(planName)

  // For free plan: no drip, just show single blast status
  if (isFree) {
    return <FreePlanStatus blast={blast} />
  }

  // Build wave data
  const wave1Days = buildWaveDays(1, blast, planName)
  const wave2Days = buildWaveDays(2, blast, planName)
  const wave3Days = buildWaveDays(3, blast, planName)

  // Overall progress
  const w1Sent  = parseInt(blast.drip_day1_delivered) || 0
  const w2Sent  = parseInt(blast.drip_day2_delivered) || 0
  const w3Sent  = parseInt(blast.drip_day3_delivered) || 0
  const totalSent  = w1Sent + w2Sent + w3Sent
  const totalEmails = planLimit * 3

  const w1Done  = !!blast.drip_day1_sent_at
  const w2Done  = !!blast.drip_day2_sent_at
  const w3Done  = !!blast.drip_day3_sent_at
  const wavesComplete = [w1Done, w2Done, w3Done].filter(Boolean).length

  const w2EligibleAt = blast.day4_scheduled_for || null
  const w3EligibleAt = blast.day8_scheduled_for || null

  return (
    <div className="db-drip-section">

      {/* ── Section header ── */}
      <div className="db-drip-section-header">
        <div className="db-drip-section-title">
          <Icon.Star />
          3-Wave Drip Campaign
        </div>
        <div className="db-drip-meta">
          <span className="db-drip-meta-chip">
            {daysPerWave} days/wave × 3 waves = {daysPerWave * 3} days
          </span>
          <span className="db-drip-meta-chip db-drip-meta-chip--highlight">
            {totalSent.toLocaleString()} / {totalEmails.toLocaleString()} emails sent
          </span>
        </div>
      </div>

      {/* ── Wave 1 ── */}
      <WaveSection
        waveNum={1}
        label="Wave 1 — Initial Introduction"
        color="#DC2626"
        days={wave1Days}
        delivered={w1Sent}
        planLimit={planLimit}
        isComplete={w1Done}
        isActive={!w1Done}
        completedAt={blast.drip_day1_sent_at}
        startsAt={blast.created_at}
      />

      {/* ── Wave 2 ── */}
      <WaveSection
        waveNum={2}
        label="Wave 2 — Follow-Up"
        color="#2563EB"
        days={wave2Days}
        delivered={w2Sent}
        planLimit={planLimit}
        isComplete={w2Done}
        isActive={w1Done && !w2Done}
        isLocked={!w1Done}
        completedAt={blast.drip_day2_sent_at}
        startsAt={w2EligibleAt}
        unlocksWhen="Wave 1 completes"
      />

      {/* ── Wave 3 ── */}
      <WaveSection
        waveNum={3}
        label="Wave 3 — Final Reminder"
        color="#059669"
        days={wave3Days}
        delivered={w3Sent}
        planLimit={planLimit}
        isComplete={w3Done}
        isActive={w2Done && !w3Done}
        isLocked={!w2Done}
        completedAt={blast.drip_day3_sent_at}
        startsAt={w3EligibleAt}
        unlocksWhen="Wave 2 completes"
      />
    </div>
  )
}


// ── Wave Section (collapsible, shows all daily rows) ───────
function WaveSection({ waveNum, label, color, days, delivered, planLimit,
                       isComplete, isActive, isLocked, completedAt, startsAt, unlocksWhen }) {
  const [open, setOpen] = useState(isActive || isComplete)

  const sentDays    = days.filter(d => d.status === 'sent').length
  const activeDays  = days.filter(d => d.status === 'sending').length
  const progressPct = planLimit > 0 ? Math.min(Math.round((delivered / planLimit) * 100), 100) : 0

  const waveStatusLabel = isLocked   ? 'Locked'
    : isComplete ? '✓ Complete'
    : isActive   ? '⚡ Active'
    : 'Pending'

  const waveStatusColor = isLocked   ? '#9CA3AF'
    : isComplete ? '#10B981'
    : isActive   ? '#F59E0B'
    : '#9CA3AF'

  return (
    <div className={`db-wave ${isLocked ? 'db-wave--locked' : ''} ${isComplete ? 'db-wave--done' : ''} ${isActive ? 'db-wave--active' : ''}`}>

      {/* Wave header — click to expand/collapse */}
      <button className="db-wave-header" onClick={() => !isLocked && setOpen(o => !o)}>
        <div className="db-wave-header-left">
          <span className="db-wave-dot" style={{ background: isLocked ? '#E5E7EB' : color }} />
          <span className="db-wave-label" style={{ color: isLocked ? '#9CA3AF' : '#111827' }}>
            {label}
          </span>
        </div>

        <div className="db-wave-header-right">
          {!isLocked && (
            <>
              {/* Mini progress bar */}
              <div className="db-wave-mini-bar">
                <div className="db-wave-mini-fill" style={{ width: `${progressPct}%`, background: color }} />
              </div>
              <span className="db-wave-count">
                {delivered.toLocaleString()} / {planLimit.toLocaleString()}
              </span>
            </>
          )}
          {isLocked && unlocksWhen && (
            <span className="db-wave-locked-msg">🔒 Unlocks after {unlocksWhen}</span>
          )}
          <span className="db-wave-status-pill" style={{ color: waveStatusColor }}>
            {waveStatusLabel}
          </span>
          {!isLocked && (
            <span className={`db-chevron ${open ? 'db-chevron--open' : ''}`}><Icon.ChevDown /></span>
          )}
        </div>
      </button>

      {/* Completion badge */}
      {isComplete && completedAt && (
        <div className="db-wave-completed-bar">
          <Icon.Check />
          Wave complete — {delivered.toLocaleString()} recruiters contacted · Finished {fmtDate(completedAt)}
        </div>
      )}

      {/* Schedule info for upcoming waves */}
      {!isLocked && !isComplete && startsAt && (
        <div className="db-wave-schedule-bar">
          <Icon.Calendar />
          {isActive ? `Started` : `Scheduled`}: {fmtDate(startsAt)}
        </div>
      )}

      {/* Daily rows */}
      {open && !isLocked && (
        <div className="db-wave-days">
          {days.map((day, i) => (
            <DailyBatchRow key={i} day={day} waveColor={color} isLast={i === days.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}


// ── Single daily batch row ──────────────────────────────────
function DailyBatchRow({ day, waveColor, isLast }) {
  const batchPct = day.batchSize > 0 ? Math.min(Math.round((day.sent / day.batchSize) * 100), 100) : 0

  const statusConfig = {
    sent:    { dot: waveColor,   label: '✓ Sent',    textColor: '#065F46' },
    sending: { dot: '#F59E0B',   label: '⚡ Sending', textColor: '#92400E' },
    pending: { dot: '#D1D5DB',   label: 'Pending',    textColor: '#9CA3AF' },
    locked:  { dot: '#E5E7EB',   label: '—',          textColor: '#D1D5DB' },
  }
  const sc = statusConfig[day.status] || statusConfig.pending

  return (
    <div className={`db-batch-row ${day.status === 'sent' ? 'db-batch-row--sent' : ''} ${day.status === 'sending' ? 'db-batch-row--sending' : ''}`}>

      {/* Day label */}
      <div className="db-batch-day-label">
        <span className="db-batch-dot" style={{ background: sc.dot }} />
        <span className="db-batch-day-num">Day {day.dayNum}</span>
      </div>

      {/* Recruiter range */}
      <div className="db-batch-range">
        Recruiters {day.batchStart}–{day.batchEnd}
      </div>

      {/* Progress bar (only for sent/sending) */}
      {(day.status === 'sent' || day.status === 'sending') && (
        <div className="db-batch-bar-wrap">
          <div className="db-batch-bar-track">
            <div className="db-batch-bar-fill"
              style={{ width: `${batchPct}%`, background: day.status === 'sent' ? waveColor : '#F59E0B' }}
            />
          </div>
          <span className="db-batch-count">
            {day.sent}/{day.batchSize}
          </span>
        </div>
      )}

      {/* Status label */}
      <div className="db-batch-status" style={{ color: sc.textColor }}>
        {sc.label}
      </div>

      {/* Last send date */}
      {day.status === 'sent' && day.lastDate && isLast && (
        <div className="db-batch-date">Last batch: {day.lastDate}</div>
      )}
    </div>
  )
}


// ── Free plan: just show single blast status ───────────────
function FreePlanStatus({ blast }) {
  const sent = parseInt(blast.recipients_count) || 0
  const done = !!blast.drip_day1_sent_at || blast.status === 'completed'
  return (
    <div className="db-drip-section">
      <div className="db-drip-section-header">
        <div className="db-drip-section-title">
          <Icon.Send />
          Blast Status
        </div>
      </div>
      <div className={`db-free-blast-status ${done ? 'fbs--done' : 'fbs--sending'}`}>
        <span className="db-free-blast-dot" />
        <div>
          <div className="db-free-blast-label">{done ? '✓ Blast Sent' : '⚡ Sending'}</div>
          <div className="db-free-blast-sub">{sent} recruiters · Single blast (no drip)</div>
        </div>
        {blast.drip_day1_sent_at && (
          <div className="db-free-blast-date">{fmtDate(blast.drip_day1_sent_at)}</div>
        )}
      </div>
    </div>
  )
}



// ─── Plan Card (sidebar) ───────────────────────────────────
function PlanCard({ blasts }) {
  const latest = blasts[0]
  if (!latest) return null
  const planInfo       = getPlanLabel(latest)
  const recipients     = parseInt(latest.recipients_count) || 0
  const activeCount    = blasts.filter(b => b.status !== 'completed').length
  const completedCount = blasts.filter(b => b.status === 'completed').length
  return (
    <div className="db-sidebar-card db-plan-card">
      <div className="db-plan-card-top">
        <div>
          <div className="db-plan-card-label">Current Plan</div>
          <div className="db-plan-card-tier" style={{ color: planInfo.color }}>{planInfo.label}</div>
          <div className="db-plan-card-sub">{recipients.toLocaleString()} recruiters</div>
        </div>
        <div className="db-plan-card-icon" style={{ background: planInfo.color }}>
          <Icon.Rocket />
        </div>
      </div>
      <div className="db-plan-quota">
        <div className="db-plan-quota-label">Campaign Activity</div>
        <div className="db-plan-quota-row">
          <span className="db-quota-chip db-quota-chip--active">{activeCount} active</span>
          <span className="db-quota-chip db-quota-chip--done">{completedCount} completed</span>
          <span className="db-quota-chip">{blasts.length} total</span>
        </div>
      </div>
    </div>
  )
}


// ─── Recruiter Reach Pie (sidebar) ────────────────────────
function RecruiterReachCard({ blasts }) {
  const total     = blasts.reduce((s, b) => s + (parseInt(b.recipients_count) || 0), 0)
  const delivered = blasts.reduce((s, b) => s + (b.delivered_count || 0), 0)
  const opened    = blasts.reduce((s, b) => s + (b.opened_count    || 0), 0)
  const bounced   = blasts.reduce((s, b) => s + (b.bounced_count   || 0), 0)
  if (total === 0) return null
  const delivPct  = Math.round((delivered / total) * 100)
  const openPct   = Math.round((opened    / total) * 100)
  const bouncePct = Math.round((bounced   / total) * 100)
  const pendPct   = Math.max(0, 100 - delivPct - bouncePct)
  const d  = (delivPct  / 100) * 360
  const o  = (openPct   / 100) * 360
  const b2 = (bouncePct / 100) * 360
  const pieStyle = { background: `conic-gradient(#10B981 0deg ${d}deg,#3B82F6 ${d}deg ${d+o}deg,#EF4444 ${d+o}deg ${d+o+b2}deg,#E5E7EB ${d+o+b2}deg 360deg)` }
  return (
    <div className="db-sidebar-card">
      <div className="db-sidebar-card-header">
        <span className="db-card-title-icon"><Icon.Users /></span>
        <span className="db-sidebar-card-title">Recruiter Reach</span>
        <span className="db-card-count">{total.toLocaleString()}</span>
      </div>
      <div className="db-pie-wrap">
        <div className="db-pie-chart" style={pieStyle}>
          <div className="db-pie-hole">
            <div className="db-pie-hole-val">{delivPct}%</div>
            <div className="db-pie-hole-lbl">reached</div>
          </div>
        </div>
        <div className="db-pie-legend">
          <LegendRow color="#10B981" label="Delivered" pct={delivPct}  />
          <LegendRow color="#3B82F6" label="Opened"    pct={openPct}   />
          <LegendRow color="#EF4444" label="Bounced"   pct={bouncePct} />
          <LegendRow color="#E5E7EB" label="Pending"   pct={pendPct}   />
        </div>
      </div>
    </div>
  )
}

function LegendRow({ color, label, pct }) {
  return (
    <div className="db-legend-row">
      <span className="db-legend-dot" style={{ background: color }} />
      <span className="db-legend-label">{label}</span>
      <span className="db-legend-pct">{pct}%</span>
    </div>
  )
}


// ─── Activity Feed (sidebar) ───────────────────────────────
// Now reads from drip_email_logs for real timestamps per day
function ActivityFeedCard({ blasts, dripLogs }) {
  const events = []

  Object.entries(dripLogs).forEach(([campaignId, days]) => {
    const blast = blasts.find(b => b.id === campaignId)
    const name  = blast?.industry || 'Campaign'
    days.forEach(d => {
      if (d.sent_at) events.push({
        time:     d.sent_at,
        color:    ['#DC2626', '#2563EB', '#10B981'][d.day_number - 1] || '#9CA3AF',
        text:     `Day ${d.day_number} — ${d.emails_sent || 0} sent, ${d.emails_failed || 0} failed`,
        campaign: name,
      })
    })
  })

  blasts.forEach(b => {
    events.push({
      time:     b.created_at,
      color:    '#9CA3AF',
      text:     'Campaign launched',
      campaign: b.industry || 'Campaign',
    })
  })

  events.sort((a, b) => new Date(b.time) - new Date(a.time))
  const visible = events.slice(0, 7)
  if (visible.length === 0) return null

  return (
    <div className="db-sidebar-card">
      <div className="db-sidebar-card-header">
        <span className="db-card-title-icon"><Icon.Activity /></span>
        <span className="db-sidebar-card-title">Activity</span>
        <span className="db-card-count db-card-count--live">● Live</span>
      </div>
      <div className="db-activity-list">
        {visible.map((ev, i) => (
          <div key={i} className="db-activity-item">
            <div className="db-activity-dot" style={{ background: ev.color }} />
            <div className="db-activity-body">
              <div className="db-activity-campaign">{ev.campaign}</div>
              <div className="db-activity-text">{ev.text}</div>
            </div>
            <div className="db-activity-time">{fmtRelative(ev.time)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}


// ─── Original small components ─────────────────────────────
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