// src/components/Admin/CampaignsOverview.jsx
// ✅ NEW: "show complete details of all active campaigns" — a list view so
// an admin can see which campaigns still need the scheduler to finish (or
// look stuck) WITHOUT already knowing a specific email/user ID to search
// for, which is all the existing Drip Campaign Monitoring tab supports.
// Calls: GET /api/admin/campaigns/overview
//
// "Manage" on a row doesn't duplicate the force-wave logic here — it jumps
// to the existing Drip Monitoring tab with that campaign pre-loaded, so the
// already-built (and already-tested) search + Force Start Wave 2/3 buttons
// there are reused as-is.
import { useState, useEffect, useCallback } from 'react'
import { adminFetch } from '../../services/adminApi'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const STATUS_STYLE = {
  initiated:   { bg: '#fffbeb', fg: '#b45309', label: 'Initiated' },
  active:      { bg: '#eef2ff', fg: '#3730a3', label: 'Active' },
  in_progress: { bg: '#ecfdf5', fg: '#059669', label: 'In Progress' },
}

function statusBadge(status) {
  const key = String(status || '').toLowerCase()
  const s = STATUS_STYLE[key] || { bg: '#f3f4f6', fg: '#6b7280', label: status || 'Unknown' }
  return (
    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

function WaveChip({ label, sent, total, started }) {
  const done = total > 0 && sent >= total
  const bg = done ? '#ecfdf5' : started ? '#eef2ff' : '#f3f4f6'
  const fg = done ? '#059669' : started ? '#3730a3' : '#9ca3af'
  return (
    <div style={{ padding: '4px 8px', borderRadius: 8, background: bg, color: fg, fontSize: 11, fontWeight: 700, textAlign: 'center', minWidth: 64 }}>
      <div>{label}</div>
      <div style={{ fontSize: 11.5, marginTop: 1 }}>{sent}/{total || '—'}</div>
    </div>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return '—'
  }
}

export default function CampaignsOverview({ onManage }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [campaigns, setCampaigns] = useState([])
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminFetch(`${API_URL}/api/admin/campaigns/overview`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`)
      setCampaigns(json.campaigns || [])
    } catch (e) {
      setError(e.message || 'Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? campaigns.filter(c => {
        const haystack = [c.candidate_name, c.candidate_email, c.job_role, c.plan_name, c.id, c.user_id]
          .filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(q)
      })
    : campaigns

  return (
    <div style={{ padding: '10px 4px' }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: '#111827' }}>Campaigns Overview</h2>
      <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 18px' }}>
        Every campaign that isn't completed or cancelled yet — initiated, actively sending, or waves forced manually.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ padding: '12px 18px', background: '#f9fafb', borderRadius: 12, minWidth: 140 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#111827' }}>{campaigns.length}</div>
          <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Active campaigns</div>
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, role, plan, or ID…"
          style={{ padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, width: 320, maxWidth: '100%' }}
        />
        <span style={{ fontSize: 13, color: '#6b7280' }}>
          {q ? `${filtered.length} of ${campaigns.length} matching "${search.trim()}"` : ''}
        </span>

        <button onClick={load} style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280' }}>
          ↻ Refresh
        </button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 14, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px' }}>Candidate</th>
                <th style={{ padding: '10px 14px' }}>Plan</th>
                <th style={{ padding: '10px 14px' }}>Wave 1 (Day 1)</th>
                <th style={{ padding: '10px 14px' }}>Wave 2 (Day 4)</th>
                <th style={{ padding: '10px 14px' }}>Wave 3 (Day 8)</th>
                <th style={{ padding: '10px 14px' }}>Last Activity</th>
                <th style={{ padding: '10px 14px' }}>Initiated</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 14px' }}>{statusBadge(c.status)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{c.candidate_name || <span style={{ color: '#9ca3af', fontWeight: 600 }}>No candidate data</span>}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{c.candidate_email || '—'}</div>
                    {c.job_role && <div style={{ color: '#9ca3af', fontSize: 11.5 }}>{c.job_role}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#374151', textTransform: 'capitalize' }}>{c.plan_name || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <WaveChip label="Day 1" sent={c.wave1_sent} total={c.total_recipients} started={!!c.drip_day1_sent_at} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <WaveChip label="Day 4" sent={c.wave2_sent} total={c.total_recipients} started={!!c.drip_day2_sent_at} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <WaveChip label="Day 8" sent={c.wave3_sent} total={c.total_recipients} started={!!c.drip_day3_sent_at} />
                  </td>
                  <td style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>{fmtDate(c.last_activity)}</td>
                  <td style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>{fmtDate(c.initiated_at)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button
                      onClick={() => onManage && onManage(c)}
                      style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Manage →
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                    {q ? `No active campaigns match "${search.trim()}"` : 'No active campaigns right now.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}