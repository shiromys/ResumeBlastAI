// src/components/ProfileSection.jsx
// Drop-in profile UI for the user dashboard.
// - Persistent "My Profile" card (view ⇄ edit), email locked.
// - Completion meter; profile_completed = all 4 fields filled.
// - Popup + ringing bell that nudge ONLY paid users (isPaid prop).
// Calls the new backend routes: GET/PATCH /api/user/profile.

import { useState, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const REQUIRED = ['first_name', 'last_name', 'phone', 'primary_skills']
const EMPTY = { email: '', first_name: '', last_name: '', phone: '', primary_skills: '', profile_completed: false }

export default function ProfileSection({ user, isPaid = false }) {
  const [profile, setProfile] = useState(EMPTY)
  const [draft, setDraft] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const [error, setError] = useState('')

  const email = user?.email || ''

  const load = useCallback(async () => {
    if (!email) return
    try {
      const res = await fetch(`${API_URL}/api/user/profile?email=${encodeURIComponent(email)}`)
      const json = await res.json()
      if (json.success && json.profile) {
        const p = { ...EMPTY, ...json.profile }
        setProfile(p)
        // Nudge only paid users who haven't completed their profile.
        if (isPaid && !p.profile_completed) setShowPopup(true)
      }
    } catch (e) {
      console.error('profile load failed', e)
    } finally {
      setLoading(false)
    }
  }, [email, isPaid])

  useEffect(() => { load() }, [load])

  // If arrived via the navbar "My Profile" link (?profile=1), open the card in edit mode.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('profile=1')) {
      setTimeout(() => {
        document.getElementById('rb-profile-card')?.scrollIntoView({ behavior: 'smooth' })
      }, 300)
    }
  }, [])

  const complete = profile.profile_completed
  const filled = REQUIRED.filter(k => (profile[k] || '').trim()).length + 1 // +1 email
  const pct = Math.round((filled / (REQUIRED.length + 1)) * 100)

  const startEdit = () => { setDraft(profile); setEditing(true); setError('') }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API_URL}/api/user/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          first_name: draft.first_name,
          last_name: draft.last_name,
          phone: draft.phone,
          primary_skills: draft.primary_skills,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Save failed')
      setProfile({ ...draft, email, profile_completed: json.profile_completed })
      setEditing(false)
      if (json.profile_completed) setShowPopup(false)
    } catch (e) {
      setError(e.message || 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Your name'
  const initials = ((profile.first_name?.[0] || email[0] || '?') + (profile.last_name?.[0] || '')).toUpperCase()

  if (loading) return null

  return (
    <div className="rb-profile-wrap">
      <style>{`
        .rb-profile-wrap { margin-bottom: 24px; }
        .rb-pf-topbar { display:flex; justify-content:flex-end; align-items:center; gap:14px; margin-bottom:12px; }
        .rb-pf-btn { padding:8px 14px; border-radius:9px; border:1px solid #e5e7eb; background:#fff; color:#111827; font-weight:700; font-size:13.5px; cursor:pointer; display:flex; align-items:center; gap:6px; }
        .rb-bell { position:relative; background:none; border:none; cursor:pointer; font-size:22px; }
        .rb-bell.ring { animation: rbring 1.2s ease-in-out infinite; }
        @keyframes rbring { 0%,100%{transform:rotate(0)} 20%{transform:rotate(15deg)} 40%{transform:rotate(-12deg)} 60%{transform:rotate(8deg)} 80%{transform:rotate(-4deg)} }
        .rb-bell-dot { position:absolute; top:0; right:0; width:9px; height:9px; background:#dc2626; border-radius:50%; border:2px solid #fff; }
        .rb-bell-pop { position:absolute; right:0; top:34px; width:250px; background:#fff; border:1px solid #e5e7eb; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.15); padding:12px; z-index:20; text-align:left; }
        .rb-pf-card { border:1px solid #e5e7eb; border-radius:16px; background:#fdfdfd; overflow:hidden; }
        .rb-pf-head { display:flex; align-items:center; gap:16px; padding:20px 22px; background:#fff; border-bottom:1px solid #e5e7eb; }
        .rb-pf-avatar { width:54px; height:54px; border-radius:50%; background:#ffebee; color:#dc2626; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:19px; flex-shrink:0; }
        .rb-pf-name { font-size:19px; font-weight:800; color:#111827; }
        .rb-pf-email { font-size:14px; color:#6b7280; }
        .rb-pf-cta { padding:9px 18px; background:#dc2626; color:#fff; border:none; border-radius:9px; font-weight:700; font-size:14px; cursor:pointer; }
        .rb-pf-meter-wrap { padding:12px 22px; background:#fff; border-bottom:1px solid #e5e7eb; }
        .rb-pf-meter-row { display:flex; justify-content:space-between; font-size:12.5px; color:#6b7280; margin-bottom:6px; }
        .rb-pf-track { height:7px; background:#f3f4f6; border-radius:999px; overflow:hidden; }
        .rb-pf-fill { height:100%; transition:width .4s; }
        .rb-pf-body { padding:22px; }
        .rb-pf-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px 24px; }
        .rb-ro-label { font-size:11.5px; color:#9ca3af; font-weight:600; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px; }
        .rb-ro-val { font-size:15px; color:#111827; }
        .rb-ro-empty { font-size:14px; color:#d1d5db; font-style:italic; }
        .rb-chip { font-size:12px; background:#ffebee; color:#991b1b; border:1px solid #fecaca; padding:3px 10px; border-radius:999px; }
        .rb-inp { width:100%; box-sizing:border-box; padding:9px 11px; border:1px solid #d1d5db; border-radius:8px; font-size:13.5px; outline:none; color:#111827; }
        .rb-inp:disabled { background:#f3f4f6; color:#6b7280; cursor:not-allowed; }
        .rb-lbl { display:block; font-size:12.5px; font-weight:600; color:#374151; margin-bottom:5px; }
        .rb-hint { font-size:11.5px; color:#6b7280; margin-top:4px; }
        .rb-pf-popup { position:fixed; left:50%; bottom:22px; transform:translateX(-50%); width:min(440px,92%); background:#fff; border:1px solid #fca5a5; border-radius:14px; box-shadow:0 12px 40px rgba(0,0,0,.18); padding:18px; z-index:60; }
        @media (max-width:640px){ .rb-pf-grid{ grid-template-columns:1fr; } }
      `}</style>

      {/* Top bar: notification bell (always visible; click opens profile edit) */}
      <div className="rb-pf-topbar">
        <div style={{ position: 'relative' }}>
          <button
            className={`rb-bell${!complete ? ' ring' : ''}`}
            onClick={() => { startEdit(); document.getElementById('rb-profile-card')?.scrollIntoView({ behavior: 'smooth' }) }}
            aria-label="Complete your profile"
            title={complete ? 'Profile complete' : 'Complete your profile'}
          >
            🔔{!complete && <span className="rb-bell-dot" />}
          </button>
        </div>
      </div>

      {/* Profile card */}
      <div className="rb-pf-card" id="rb-profile-card">
        <div className="rb-pf-head">
          <div className="rb-pf-avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="rb-pf-name">{name}</div>
            <div className="rb-pf-email">{profile.email || email}</div>
          </div>
          {!editing && <button className="rb-pf-cta" onClick={startEdit}>{complete ? 'Edit profile' : 'Complete profile'}</button>}
        </div>

        <div className="rb-pf-meter-wrap">
          <div className="rb-pf-meter-row">
            <span>Profile completion</span>
            <span style={{ fontWeight: 700, color: complete ? '#059669' : '#dc2626' }}>{pct}%</span>
          </div>
          <div className="rb-pf-track"><div className="rb-pf-fill" style={{ width: `${pct}%`, background: complete ? '#059669' : '#dc2626' }} /></div>
        </div>

        <div className="rb-pf-body">
          {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          {!editing ? (
            <div className="rb-pf-grid">
              <RO label="Email" locked value={profile.email || email} />
              <RO label="First name" value={profile.first_name} />
              <RO label="Last name" value={profile.last_name} />
              <RO label="Contact number" value={profile.phone} />
              <div style={{ gridColumn: '1 / -1' }}><RO label="Primary skills" value={profile.primary_skills} chips /></div>
            </div>
          ) : (
            <div className="rb-pf-grid">
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="rb-lbl">Email · locked</label>
                <input className="rb-inp" value={profile.email || email} disabled />
                <div className="rb-hint">Your email is tied to your account and can't be changed here.</div>
              </div>
              <div><label className="rb-lbl">First name</label><input className="rb-inp" value={draft.first_name} placeholder="Jordan" onChange={e => setDraft({ ...draft, first_name: e.target.value })} /></div>
              <div><label className="rb-lbl">Last name</label><input className="rb-inp" value={draft.last_name} placeholder="Lee" onChange={e => setDraft({ ...draft, last_name: e.target.value })} /></div>
              <div><label className="rb-lbl">Contact number</label><input className="rb-inp" value={draft.phone} placeholder="+1 (555) 123-4567" onChange={e => setDraft({ ...draft, phone: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="rb-lbl">Primary skills</label>
                <input className="rb-inp" value={draft.primary_skills} placeholder="React, Node.js, AWS, SQL" onChange={e => setDraft({ ...draft, primary_skills: e.target.value })} />
                <div className="rb-hint">Separate skills with commas.</div>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, marginTop: 4 }}>
                <button className="rb-pf-cta" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
                <button className="rb-pf-btn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nudge popup — paid + incomplete only */}
      {showPopup && isPaid && !complete && (
        <div className="rb-pf-popup">
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: '#ffebee', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👤</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>Complete your profile</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>Add your name, contact and skills so recruiters can reach you. Takes 30 seconds.</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="rb-pf-cta" style={{ padding: '8px 16px', fontSize: 13 }} onClick={() => { setShowPopup(false); startEdit(); document.getElementById('rb-profile-card')?.scrollIntoView({ behavior: 'smooth' }) }}>Complete now</button>
                <button style={{ padding: '8px 16px', background: 'none', color: '#6b7280', border: 'none', fontSize: 13, cursor: 'pointer' }} onClick={() => setShowPopup(false)}>Later</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RO({ label, value, locked, chips }) {
  const v = (value || '').trim()
  return (
    <div>
      <div className="rb-ro-label">{label} {locked && '🔒'}</div>
      {v
        ? (chips
            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{v.split(',').map((s, i) => s.trim() && <span key={i} className="rb-chip">{s.trim()}</span>)}</div>
            : <div className="rb-ro-val">{v}</div>)
        : <div className="rb-ro-empty">Not set</div>}
    </div>
  )
}