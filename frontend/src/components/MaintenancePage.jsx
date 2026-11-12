// ✅ NEW: the public-facing "We'll be right back" takeover (Option 1 —
// Clean Card — picked from the design previews). Rendered by App.jsx in
// place of the normal routed app when maintenance mode is on. Kept as
// its own tiny, dependency-free component — no API calls here, no
// routing — so it can never itself be the thing that breaks while the
// rest of the app is mid-change.
function MaintenancePage({ message, estimatedBackAt }) {
  const etaText = (() => {
    if (!estimatedBackAt) return null
    try {
      const d = new Date(estimatedBackAt)
      if (isNaN(d.getTime())) return null
      return d.toLocaleString(undefined, {
        weekday: undefined,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    } catch {
      return null
    }
  })()

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F8FAFC',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      padding: '24px',
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '440px',
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: '16px',
        padding: '40px 36px',
        boxShadow: '0 12px 28px rgba(15,23,42,0.08)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '16px',
      }}>
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: '#FEE2E2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M14.7 6.3a1 1 0 0 0-1.4 0l-1.6 1.6-1.6-1.6a1 1 0 0 0-1.4 1.4l1.6 1.6-1.6 1.6a1 1 0 1 0 1.4 1.4l1.6-1.6 1.6 1.6a1 1 0 0 0 1.4-1.4l-1.6-1.6 1.6-1.6a1 1 0 0 0 0-1.4Z" fill="#DC2626"/>
            <path d="M3 13.5 9 20l1.6-1.6-5-5L3 13.5Z" fill="#DC2626"/>
            <path d="M20.7 5.3 18.7 3.3a1 1 0 0 0-1.4 0l-1.2 1.2 3.4 3.4 1.2-1.2a1 1 0 0 0 0-1.4Z" fill="#DC2626"/>
          </svg>
        </div>

        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
          We'll be right back
        </h1>

        <p style={{ margin: 0, fontSize: '14.5px', color: '#64748B', lineHeight: 1.6 }}>
          {message || "ResumeBlast.ai is currently undergoing scheduled maintenance. We'll be back online shortly — thanks for your patience."}
        </p>

        {etaText && (
          <>
            <div style={{ height: '1px', width: '100%', background: '#E2E8F0', margin: '2px 0' }} />
            <div style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>
              Estimated back online: {etaText}
            </div>
          </>
        )}

        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: etaText ? '0' : '4px' }}>
          Need something urgent?{' '}
          <a href="mailto:support@resumeblast.ai" style={{ color: '#DC2626', fontWeight: 700, textDecoration: 'none' }}>
            support@resumeblast.ai
          </a>
        </div>
      </div>
    </div>
  )
}

export default MaintenancePage