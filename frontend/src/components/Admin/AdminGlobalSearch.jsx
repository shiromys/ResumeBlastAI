import { useState, useRef, useEffect } from 'react'
import { adminFetch } from '../../services/adminApi'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// ✅ NEW: one search box across users, payments, campaigns, and support
// tickets — type an email, name, ticket ID, or Stripe session ID and jump
// straight to the right record, instead of guessing which tab to check.
// Lives in the sidebar header so it's reachable no matter which tab is
// active. A result either opens the user detail drawer (the common case)
// or, for a hit that couldn't be resolved to a registered account, shows
// a plain, non-clickable line — that gap is the known, separately-scoped
// ticket/payment-to-user linking fix, not something this box can fix on
// its own.
function AdminGlobalSearch({ onOpenUser }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const debounceRef = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setError('')
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const res = await adminFetch(`${API_URL}/api/admin/global-search?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`)
        setResults(json.results || [])
      } catch (e) {
        setError(e.message)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const handleResultClick = (r) => {
    if (r.type === 'user' && onOpenUser) {
      onOpenUser(r.user_id)
      setOpen(false)
      setQuery('')
      setResults([])
    }
    // 'unlinked' results have nothing to open — intentionally not clickable
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', marginTop: '14px' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search anything…"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '9px 12px',
          fontSize: '13px',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          outline: 'none',
        }}
      />

      {open && (query.trim().length >= 2) && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          width: '320px',
          maxHeight: '420px',
          overflowY: 'auto',
          background: 'white',
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          boxShadow: '0 12px 28px rgba(15,23,42,0.18)',
          zIndex: 500,
        }}>
          {loading ? (
            <div style={{ padding: '16px', fontSize: '13px', color: '#64748B', textAlign: 'center' }}>Searching…</div>
          ) : error ? (
            <div style={{ padding: '16px', fontSize: '13px', color: '#DC2626' }}>{error}</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '16px', fontSize: '13px', color: '#9CA3AF', textAlign: 'center' }}>No matches</div>
          ) : (
            results.map((r, i) => (
              <div
                key={i}
                onClick={() => handleResultClick(r)}
                style={{
                  padding: '10px 14px',
                  borderBottom: i < results.length - 1 ? '1px solid #F1F5F9' : 'none',
                  cursor: r.type === 'user' ? 'pointer' : 'default',
                  opacity: r.type === 'unlinked' ? 0.65 : 1,
                }}
                onMouseOver={(e) => { if (r.type === 'user') e.currentTarget.style.background = '#F8FAFC' }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.title}
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', flexShrink: 0 }}>{r.source}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{r.subtitle}</div>
                {r.type === 'unlinked' && (
                  <div style={{ fontSize: '10px', color: '#B45309', marginTop: '3px' }}>No registered account to open</div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default AdminGlobalSearch