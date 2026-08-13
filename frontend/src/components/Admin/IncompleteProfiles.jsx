// src/components/Admin/IncompleteProfiles.jsx
// Admin: full structured profile breakdown.
//   Paid vs Non-paid  X  Complete vs Not completed.
// Calls: GET /api/admin/profiles/overview , POST /api/admin/profiles/create

import { useState, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const BUCKETS = [
  { key: 'paid_incomplete',    label: 'Paid · Not completed',     bg: '#ffebee', fg: '#991b1b', priority: true },
  { key: 'nonpaid_incomplete', label: 'Non-paid · Not completed', bg: '#fffbeb', fg: '#b45309' },
  { key: 'paid_complete',      label: 'Paid · Complete',          bg: '#ecfdf5', fg: '#059669' },
  { key: 'nonpaid_complete',   label: 'Non-paid · Complete',      bg: '#eef2ff', fg: '#3730a3' },
]

export default function IncompleteProfiles() {
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({})
  const [buckets, setBuckets] = useState({})
  const [active, setActive] = useState('paid_incomplete')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_URL}/api/admin/profiles/overview`)
      const json = await res.json()
      if (json.success) {
        setCounts(json.counts || {})
        setBuckets(json.buckets || {})
      } else {
        setError(json.error || 'Failed to load')
      }
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const rows = buckets[active] || []

  return (
    <div style={{ padding: '10px 4px' }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: '#111827' }}>User Profiles</h2>
      <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 18px' }}>
        All users grouped by payment status and profile completion.
      </p>

      {/* summary strip */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <Count n={counts.total} label="Total users" bg="#f9fafb" fg="#111827" />
        <Count n={counts.paid} label="Paid" bg="#ffebee" fg="#991b1b" />
        <Count n={counts.nonpaid} label="Non-paid" bg="#eef2ff" fg="#3730a3" />
        <Count n={counts.complete} label="Profile complete" bg="#ecfdf5" fg="#059669" />
        <Count n={counts.incomplete} label="Not completed" bg="#fffbeb" fg="#b45309" />
      </div>

      {/* 2x2 bucket tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, margin: '16px 0' }}>
        {BUCKETS.map(b => {
          const n = counts[b.key] ?? 0
          const isActive = active === b.key
          return (
            <button key={b.key} onClick={() => setActive(b.key)}
              style={{
                textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                background: isActive ? b.fg : b.bg,
                color: isActive ? '#fff' : b.fg,
                border: `1px solid ${isActive ? b.fg : 'transparent'}`,
                boxShadow: isActive ? '0 4px 12px rgba(0,0,0,.12)' : 'none',
              }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{n}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, opacity: .9 }}>{b.label}{b.priority ? ' ⚠' : ''}</div>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button onClick={load} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280' }}>↻ Refresh</button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 14, marginBottom: 12 }}>{error}</div>}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading…</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                <th style={{ padding: '10px 14px' }}>User</th>
                <th style={{ padding: '10px 14px' }}>Type</th>
                <th style={{ padding: '10px 14px' }}>Campaign</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</div>
                    <div style={{ color: '#6b7280', fontSize: 12.5 }}>{u.email}</div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#374151', textTransform: 'capitalize' }}>{(u.user_type || '').replace('-', ' ')}</td>
                  <td style={{ padding: '10px 14px', color: '#374151' }}>{u.campaign_status || '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button onClick={() => setEditing(u)} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                      {active.endsWith('complete') && !active.includes('incomplete') ? 'Edit' : 'Create manually'}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>No users in this group.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editing && <CreateModal user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function CreateModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    phone: user.phone || '',
    primary_skills: user.primary_skills || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const res = await fetch(`${API_URL}/api/admin/profiles/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, ...form }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Save failed')
      onSaved()
    } catch (e) {
      setErr(e.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const F = (k, label, ph) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{label}</label>
      <input value={form[k]} placeholder={ph} onChange={e => setForm({ ...form, [k]: e.target.value })}
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13.5 }} />
    </div>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Profile (admin)</div>
        <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#111827' }}>{user.email}</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Email · locked</label>
          <input value={user.email} disabled style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13.5, background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }} />
        </div>
        {F('first_name', 'First name', 'Jordan')}
        {F('last_name', 'Last name', 'Lee')}
        {F('phone', 'Contact number', '+1 (555) 123-4567')}
        {F('primary_skills', 'Primary skills', 'React, Node.js, AWS')}
        {err && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button onClick={save} disabled={saving} style={{ padding: '10px 20px', background: saving ? '#9ca3af' : '#dc2626', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save profile'}</button>
          <button onClick={onClose} disabled={saving} style={{ padding: '10px 20px', background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function Count({ n, label, bg, fg }) {
  return (
    <div style={{ padding: '12px 18px', background: bg, borderRadius: 12, minWidth: 120 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: fg }}>{n ?? 0}</div>
      <div style={{ fontSize: 12, color: fg, opacity: .85, fontWeight: 600 }}>{label}</div>
    </div>
  )
}