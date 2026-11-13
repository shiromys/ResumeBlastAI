import { useState, useEffect, useCallback } from 'react'
import { adminFetch } from '../../services/adminApi'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const DEFAULT_MESSAGE = "We'll be back online shortly. Thanks for your patience."

// ✅ NEW: the admin-facing side of Maintenance Mode. Loads the current
// settings on mount, lets an admin edit the message / ETA and flip the
// toggle, and saves them all together via POST /api/admin/maintenance.
// The toggle itself is wired to flip the live site immediately on save —
// there is no separate "publish" step — so the confirmation copy below
// the switch is there to make that unmistakable before anyone clicks it.
function MaintenanceControl() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedNote, setSavedNote] = useState('')

  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const [etaLocal, setEtaLocal] = useState('') // datetime-local string, e.g. 2026-11-12T15:00
  const [meta, setMeta] = useState({ updated_at: null, updated_by: null })

  // ✅ NEW: confirmation popup before the toggle actually takes effect.
  // The toggle button no longer calls save() directly — it opens this
  // modal with the value it WOULD switch to, and only "Accept" calls
  // save(pendingValue). The separate "Save changes" button below (for
  // editing message/ETA text without flipping state) is unaffected.
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingValue, setPendingValue] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminFetch(`${API_URL}/api/admin/maintenance`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`)
      setEnabled(!!json.enabled)
      setMessage(json.message || DEFAULT_MESSAGE)
      setEtaLocal(isoToLocalInput(json.estimated_back_at))
      setMeta({ updated_at: json.updated_at, updated_by: json.updated_by })
    } catch (e) {
      setError(e.message || 'Could not load maintenance status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (nextEnabled) => {
    setSaving(true)
    setError('')
    setSavedNote('')
    try {
      const res = await adminFetch(`${API_URL}/api/admin/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: nextEnabled,
          message: message || DEFAULT_MESSAGE,
          estimated_back_at: etaLocal ? new Date(etaLocal).toISOString() : '',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`)
      setEnabled(!!json.enabled)
      setMeta({ updated_at: json.updated_at, updated_by: json.updated_by })
      setSavedNote(nextEnabled ? 'Maintenance mode is now ON — visitors see the takeover page.' : 'Maintenance mode is now OFF — the site is live again.')
    } catch (e) {
      setError(e.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  // ✅ NEW: opens the confirmation popup instead of saving immediately.
  const requestToggle = () => {
    if (saving) return
    setPendingValue(!enabled)
    setConfirmOpen(true)
  }

  const confirmToggle = async () => {
    const next = pendingValue
    setConfirmOpen(false)
    setPendingValue(null)
    await save(next)
  }

  const cancelToggle = () => {
    setConfirmOpen(false)
    setPendingValue(null)
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading…</div>
  }

  return (
    <div style={{ padding: '10px 4px', maxWidth: 560 }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', color: '#111827' }}>Maintenance Mode</h2>
      <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 20px' }}>
        Show a "We'll be right back" page to every visitor while you make changes. Admins stay signed in
        and keep seeing the real app the whole time, so you can always come back here to turn it off.
      </p>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>
              {enabled ? 'Maintenance Mode is ON' : 'Site is live'}
            </div>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3 }}>
              {enabled ? 'Visitors are currently seeing the maintenance page.' : 'Visitors see the normal application.'}
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={requestToggle}
            aria-pressed={enabled}
            aria-label="Toggle maintenance mode"
            style={{
              width: 56, height: 32, borderRadius: 16, border: 'none',
              cursor: saving ? 'default' : 'pointer', padding: 3,
              display: 'flex', alignItems: 'center',
              background: enabled ? '#DC2626' : '#CBD5E1',
              justifyContent: enabled ? 'flex-end' : 'flex-start',
              opacity: saving ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
          </button>
        </div>

        <div style={{ height: 1, background: '#e5e7eb' }} />

        <label style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', display: 'flex', flexDirection: 'column', gap: 6 }}>
          Message shown to visitors
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#374151', fontFamily: 'inherit', resize: 'vertical' }}
          />
        </label>

        <label style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', display: 'flex', flexDirection: 'column', gap: 6 }}>
          Estimated back online (optional)
          <input
            type="datetime-local"
            value={etaLocal}
            onChange={(e) => setEtaLocal(e.target.value)}
            style={{ width: '100%', maxWidth: 260, boxSizing: 'border-box', padding: '9px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#374151' }}
          />
        </label>

        {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}
        {savedNote && !error && <div style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>{savedNote}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            disabled={saving}
            onClick={() => save(enabled)}
            style={{ padding: '10px 18px', background: saving ? '#9ca3af' : '#DC2626', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 13.5, cursor: saving ? 'default' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={load}
            disabled={saving}
            style={{ padding: '10px 18px', background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 9, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}
          >
            ↻ Refresh
          </button>
        </div>

        {meta.updated_at && (
          <div style={{ fontSize: 11.5, color: '#9ca3af' }}>
            Last changed {new Date(meta.updated_at).toLocaleString()}{meta.updated_by ? ` by ${meta.updated_by}` : ''}
          </div>
        )}
      </div>

      {/* ✅ NEW: confirmation popup before the toggle takes effect */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
          onClick={cancelToggle}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, padding: 26, maxWidth: 420,
              width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,.25)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
              {pendingValue ? 'Turn ON maintenance mode?' : 'Turn OFF maintenance mode?'}
            </div>
            <div style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.5, marginBottom: 20 }}>
              {pendingValue
                ? 'Every visitor to the site will immediately see the maintenance page instead of the real application. Admins will stay signed in and keep seeing the real app. You can turn this off again at any time from this same screen.'
                : 'The site will immediately go live for all visitors again — the maintenance page will stop showing right away.'}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={cancelToggle}
                style={{ padding: '9px 16px', background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmToggle}
                style={{ padding: '9px 16px', background: pendingValue ? '#DC2626' : '#059669', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// '2026-11-12T15:00:00+00:00' (or Z) -> '2026-11-12T15:00' in the browser's
// local time, the shape <input type="datetime-local"> expects.
function isoToLocalInput(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

export default MaintenanceControl