import { useState, useEffect } from 'react'

// ✅ NEW: Admin-panel "click a user, see everything" detail panel. Fetches
// the aggregated /api/admin/users/<id>/details payload (profile, campaigns,
// payments, support tickets + replies, best-effort guest pre-signup history,
// admin notes) and renders it as a right-side slide-over, matching the
// preview mockup approved for this feature. Activity timeline is a phase-2
// tab — not included yet (see implementation-plan-admin-user-detail-view.md).
function UserDetailDrawer({ userId, adminEmail, onClose, onChanged }) {
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [details, setDetails] = useState(null)
  const [busy, setBusy] = useState(false)
  const [noteText, setNoteText] = useState('')

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  useEffect(() => {
    if (userId) loadDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const loadDetails = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/details`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setDetails(json)
    } catch (e) {
      console.error('❌ Error loading user details:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBanToggle = async () => {
    if (!details?.user) return
    const isBanned = details.user.account_status === 'banned'
    if (!isBanned) {
      const reason = window.prompt('Reason for banning this user (shown only to admins):', 'Admin action')
      if (reason === null) return
      setBusy(true)
      try {
        await fetch(`${API_URL}/api/admin/users/${userId}/ban`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        })
        await loadDetails()
        if (onChanged) onChanged()
      } catch (e) {
        alert(`Failed to ban user: ${e.message}`)
      } finally {
        setBusy(false)
      }
    } else {
      if (!window.confirm('Unban this user and restore their account to active?')) return
      setBusy(true)
      try {
        await fetch(`${API_URL}/api/admin/users/${userId}/unban`, { method: 'POST' })
        await loadDetails()
        if (onChanged) onChanged()
      } catch (e) {
        alert(`Failed to unban user: ${e.message}`)
      } finally {
        setBusy(false)
      }
    }
  }

  const handleSendResetCode = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/send-reset-code`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to send code')
      alert(`✅ Password reset code sent to ${details.user.email}`)
    } catch (e) {
      alert(`Failed to send reset code: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleAddNote = async () => {
    const message = noteText.trim()
    if (!message) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, admin_name: adminEmail || 'Admin' }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save note')
      setNoteText('')
      await loadDetails()
    } catch (e) {
      alert(`Failed to add note: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!details?.user) return
    const email = details.user.email
    const confirmed = window.confirm(
      `⚠️ WARNING: Are you absolutely sure you want to delete user "${email}"?\n\n` +
      `This action will:\n` +
      `• Delete all user data (resumes, blasts, payments, activity)\n` +
      `• Remove from authentication system\n` +
      `• Prevent future signup/login\n\n` +
      `This action CANNOT be undone!`
    )
    if (!confirmed) return
    const finalConfirm = window.confirm(`FINAL CONFIRMATION: Delete ${email}?\n\nType YES in your mind and click OK to proceed.`)
    if (!finalConfirm) return

    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/users/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          user_id: userId,
          admin_email: adminEmail || 'admin',
          reason: 'Admin deletion via user detail panel',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Delete failed')
      alert(`✅ ${email} deleted.`)
      if (onChanged) onChanged()
      onClose()
    } catch (e) {
      alert(`Failed to delete user: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const formatMoney = (amount, currency) => {
    if (amount === null || amount === undefined) return '—'
    return `${(currency || 'usd').toUpperCase()} $${(Number(amount) / 100).toFixed(2)}`
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const badge = (text, bg, color) => (
    <span style={{ background: bg, color, fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px' }}>{text}</span>
  )

  const tabBtnStyle = (name) => ({
    padding: '12px 14px',
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    background: 'none',
    border: 'none',
    borderBottom: tab === name ? '2px solid #DC2626' : '2px solid transparent',
    color: tab === name ? '#DC2626' : '#64748B',
    cursor: 'pointer',
  })

  const user = details?.user

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 10000, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '560px', maxWidth: '100%', background: 'white', boxShadow: '-8px 0 32px rgba(15,23,42,0.18)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px' }}>
            <div className="spinner"></div>
          </div>
        ) : error ? (
          <div style={{ padding: '32px' }}>
            <div style={{ color: '#DC2626', fontWeight: 600, marginBottom: '12px' }}>Couldn't load this user's details.</div>
            <div style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>{error}</div>
            <button onClick={onClose} style={{ padding: '8px 16px', background: '#F1F5F9', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
          </div>
        ) : user ? (
          <>
            {/* Header */}
            <div style={{ padding: '28px 28px 20px 28px', borderBottom: '1px solid #F1F5F9', position: 'relative', flexShrink: 0 }}>
              <button
                onClick={onClose}
                aria-label="Close panel"
                style={{ position: 'absolute', top: '20px', right: '20px', width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {(user.full_name || user.email || '?').trim().charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '19px', fontWeight: 700, color: '#0F172A' }}>{user.full_name || 'Unnamed user'}</div>
                  <div style={{ fontSize: '13px', color: '#64748B' }}>{user.email}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {badge(user.role || 'job_seeker', '#F1F5F9', '#475569')}
                {user.account_status === 'banned'
                  ? badge('Banned', '#FEE2E2', '#991B1B')
                  : badge('Active', '#D1FAE5', '#065F46')}
                {details.guest_history && badge('Originally guest', '#FEF3C7', '#92400E')}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', padding: '0 20px', borderBottom: '1px solid #F1F5F9', flexShrink: 0, overflowX: 'auto' }}>
              <button style={tabBtnStyle('overview')} onClick={() => setTab('overview')}>Overview</button>
              <button style={tabBtnStyle('campaigns')} onClick={() => setTab('campaigns')}>Campaigns ({details.campaigns.length})</button>
              <button style={tabBtnStyle('payments')} onClick={() => setTab('payments')}>Payments ({details.payments.length})</button>
              <button style={tabBtnStyle('support')} onClick={() => setTab('support')}>Support ({details.support_tickets.length})</button>
              <button style={tabBtnStyle('actions')} onClick={() => setTab('actions')}>Admin Actions</button>
            </div>

            {/* Content */}
            <div style={{ padding: '24px 28px 40px 28px', flex: 1 }}>

              {tab === 'overview' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Campaigns</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{details.campaigns.length}</div>
                    </div>
                    <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Lifetime spend</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                        {formatMoney(details.payments.reduce((sum, p) => sum + (p.status === 'completed' ? Number(p.amount || 0) : 0), 0), details.payments[0]?.currency)}
                      </div>
                    </div>
                    <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>Open tickets</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>
                        {details.support_tickets.filter(t => t.status !== 'resolved').length}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F8FAFC', paddingBottom: '10px' }}>
                      <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>User ID</span>
                      <span style={{ fontSize: '12px', color: '#0F172A', fontFamily: 'monospace' }}>{user.id}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F8FAFC', paddingBottom: '10px' }}>
                      <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Phone</span>
                      <span style={{ fontSize: '13px', color: '#0F172A' }}>{user.phone || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F8FAFC', paddingBottom: '10px' }}>
                      <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Joined</span>
                      <span style={{ fontSize: '13px', color: '#0F172A' }}>{formatDate(user.created_at)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F8FAFC', paddingBottom: '10px' }}>
                      <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Profile completed</span>
                      {user.profile_completed ? badge('Yes', '#D1FAE5', '#065F46') : badge('No', '#F1F5F9', '#64748B')}
                    </div>
                    {user.primary_skills && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px' }}>
                        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, flexShrink: 0, paddingTop: '2px' }}>Primary skills</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {(Array.isArray(user.primary_skills) ? user.primary_skills : String(user.primary_skills).split(',')).map((s, i) => (
                            <span key={i} style={{ background: '#F1F5F9', color: '#475569', fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px' }}>{String(s).trim()}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {details.guest_history && (
                      <div style={{ marginTop: '8px', background: '#FFFBEB', border: '1px solid #FEF3C7', borderRadius: '10px', padding: '12px 14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400E', marginBottom: '6px' }}>Pre-signup guest activity</div>
                        <div style={{ fontSize: '12px', color: '#78350F' }}>Visits: {details.guest_history.visit_count ?? '—'}</div>
                        <div style={{ fontSize: '12px', color: '#78350F' }}>First seen: {formatDate(details.guest_history.created_at)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'campaigns' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {details.campaigns.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF', fontSize: '13px' }}>No campaigns yet</div>
                  ) : details.campaigns.map((c) => (
                    <div key={c.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                        <div>
                          {badge(c.plan_name || 'Plan', '#FEE2E2', '#991B1B')}
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginTop: '8px' }}>{c.job_role || c.candidate_name || '—'}</div>
                        </div>
                        {String(c.status).toLowerCase() === 'completed'
                          ? badge('Completed', '#D1FAE5', '#065F46')
                          : String(c.status).toLowerCase() === 'active'
                            ? badge('Active', '#DBEAFE', '#1E40AF')
                            : badge(c.status || 'Unknown', '#F1F5F9', '#475569')}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px' }}>
                        {c.total_sent} / {c.total_recipients || '—'} recruiters reached
                      </div>
                      <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden', marginBottom: '12px' }}>
                        <div style={{ width: `${c.total_recipients ? Math.min(100, (c.total_sent / c.total_recipients) * 100) : 0}%`, height: '100%', background: '#10B981' }}></div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        {['drip_day1_delivered', 'drip_day2_delivered', 'drip_day3_delivered'].map((k, i) => (
                          <span key={k} style={{ background: c[k] ? '#D1FAE5' : '#F1F5F9', color: c[k] ? '#065F46' : '#94A3B8', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px' }}>
                            Day {[1, 4, 8][i]} {c[k] ? '✓' : 'pending'}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                        Initiated {formatDate(c.initiated_at)}{c.completed_at ? ` · Completed ${formatDate(c.completed_at)}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'payments' && (
                details.payments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF', fontSize: '13px' }}>No payments yet</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px 0', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', borderBottom: '1px solid #F1F5F9' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '8px 0', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', borderBottom: '1px solid #F1F5F9' }}>Plan</th>
                        <th style={{ textAlign: 'left', padding: '8px 0', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', borderBottom: '1px solid #F1F5F9' }}>Amount</th>
                        <th style={{ textAlign: 'left', padding: '8px 0', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', borderBottom: '1px solid #F1F5F9' }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '8px 0', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', borderBottom: '1px solid #F1F5F9' }}>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.payments.map((p) => (
                        <tr key={p.id}>
                          <td style={{ padding: '10px 0', borderBottom: '1px solid #F8FAFC', color: '#374151' }}>{formatDate(p.completed_at)}</td>
                          <td style={{ padding: '10px 0', borderBottom: '1px solid #F8FAFC', color: '#374151' }}>{p.plan_name || '—'}</td>
                          <td style={{ padding: '10px 0', borderBottom: '1px solid #F8FAFC', color: '#0F172A', fontWeight: 600 }}>{formatMoney(p.amount, p.currency)}</td>
                          <td style={{ padding: '10px 0', borderBottom: '1px solid #F8FAFC' }}>
                            {p.status === 'completed' ? badge('Completed', '#D1FAE5', '#065F46') : badge(p.status || 'Unknown', '#F1F5F9', '#475569')}
                          </td>
                          <td style={{ padding: '10px 0', borderBottom: '1px solid #F8FAFC' }}>
                            {p.receipt_url ? <a href={p.receipt_url} target="_blank" rel="noreferrer">View</a> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {tab === 'support' && (
                details.support_tickets.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF', fontSize: '13px' }}>No support tickets</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {details.support_tickets.map((t) => (
                      <div key={t.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ padding: '14px 16px', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{t.subject}</div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{t.ticket_id} · {formatDate(t.created_at)}</div>
                          </div>
                          {t.status === 'resolved' ? badge('Resolved', '#D1FAE5', '#065F46') : t.status === 'unread' ? badge('Unread', '#FEE2E2', '#991B1B') : badge('Open', '#FEF3C7', '#92400E')}
                        </div>
                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px 14px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>{user.full_name || 'Customer'}</div>
                            <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>{t.message}</div>
                          </div>
                          {t.replies.map((r, i) => (
                            <div key={i} style={{ background: '#FFF1F1', borderRadius: '10px', padding: '12px 14px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B', marginBottom: '4px' }}>{r.admin_name} · {formatDate(r.created_at)}</div>
                              <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>{r.message}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {tab === 'actions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button disabled={busy} onClick={handleSendResetCode} style={{ padding: '10px 18px', background: 'white', color: '#0F172A', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                      Send password reset code
                    </button>
                    <button disabled={busy} onClick={handleBanToggle} style={{ padding: '10px 18px', background: 'white', color: '#92400E', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                      {user.account_status === 'banned' ? 'Unban user' : 'Ban user'}
                    </button>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '10px' }}>Internal notes</div>
                    {details.admin_notes.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '10px' }}>No notes yet</div>
                    ) : details.admin_notes.map((n, i) => (
                      <div key={i} style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
                        <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>{n.message}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>— {n.admin_name}, {formatDate(n.created_at)}</div>
                      </div>
                    ))}
                    <label htmlFor="admin-note-input" style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Add a note</label>
                    <textarea
                      id="admin-note-input"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Write an internal note about this user…"
                      style={{ width: '100%', boxSizing: 'border-box', minHeight: '64px', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', fontFamily: 'inherit', fontSize: '13px', resize: 'vertical' }}
                    />
                    <button disabled={busy || !noteText.trim()} onClick={handleAddNote} style={{ marginTop: '10px', padding: '9px 16px', background: '#DC2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: (busy || !noteText.trim()) ? 'not-allowed' : 'pointer' }}>
                      Add note
                    </button>
                  </div>

                  <div style={{ border: '1px solid #FECACA', borderRadius: '10px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', marginBottom: '8px' }}>Danger zone</div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '10px' }}>Permanently deletes this user and all associated records. This cannot be undone.</div>
                    <button disabled={busy} onClick={handleDeleteUser} style={{ padding: '9px 16px', background: 'white', color: '#DC2626', border: '1px solid #FECACA', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                      Delete user
                    </button>
                  </div>
                </div>
              )}

            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default UserDetailDrawer