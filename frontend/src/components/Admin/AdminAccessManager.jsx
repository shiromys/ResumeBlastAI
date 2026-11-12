import { useState, useEffect } from 'react'
import { adminFetch } from '../../services/adminApi'  // ✅ NEW: attaches the admin's Supabase token to every call

// ✅ NEW: "Manage Admin Access" screen. Only rendered for the two permanent
// super admins (shuchitha@shiroapps.com, srikanth@shirotechnologies.com) —
// AdminDashboard.jsx gates the nav button and this component's render on
// adminRole === 'super_admin', and the backend independently 403s every
// /api/admin/admin-users* call for anyone else, so there's no path to this
// data or these actions without actually being one of the two. Mirrors
// GuestUsers.jsx's structure/visual style so it fits the rest of the panel.
function AdminAccessManager() {
  const [superAdmins, setSuperAdmins] = useState([])
  const [grantedAdmins, setGrantedAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [granting, setGranting] = useState(false)
  const [revokingEmail, setRevokingEmail] = useState('')

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  useEffect(() => {
    loadAdmins()
  }, [])

  const loadAdmins = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await adminFetch(`${API_URL}/api/admin/admin-users`)
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`)
      setSuperAdmins(data.super_admins || [])
      setGrantedAdmins(data.granted_admins || [])
    } catch (err) {
      console.error('❌ Error loading admin users:', err)
      setError('Could not load admin access list — ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGrant = async (e) => {
    e.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      alert('Enter a valid email address.')
      return
    }

    setGranting(true)
    try {
      const response = await adminFetch(`${API_URL}/api/admin/admin-users/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || `HTTP ${response.status}`)

      setNewEmail('')
      await loadAdmins()
    } catch (err) {
      console.error('❌ Error granting admin access:', err)
      alert(`Failed to grant access: ${err.message}`)
    } finally {
      setGranting(false)
    }
  }

  const handleRevoke = async (email) => {
    if (!window.confirm(`Revoke admin access for ${email}? They'll immediately lose access to this panel.`)) return

    setRevokingEmail(email)
    try {
      const response = await adminFetch(`${API_URL}/api/admin/admin-users/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || `HTTP ${response.status}`)

      await loadAdmins()
    } catch (err) {
      console.error('❌ Error revoking admin access:', err)
      alert(`Failed to revoke access: ${err.message}`)
    } finally {
      setRevokingEmail('')
    }
  }

  const activeGranted = grantedAdmins.filter(a => !a.revoked)
  const revokedGranted = grantedAdmins.filter(a => a.revoked)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px' }}>
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '24px', fontWeight: '700', color: '#111827' }}>
          🔑 Manage Admin Access
        </h2>
        <span style={{ fontSize: '13px', color: '#6B7280' }}>
          Only visible to super admins — control who else can use this panel.
        </span>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Grant form */}
      <div className="stat-card" style={{ padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: '700', color: '#111827' }}>
          Grant admin access
        </h3>
        <form onSubmit={handleGrant} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="person@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={granting}
            style={{
              flex: '1 1 260px',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #D1D5DB',
              fontSize: '14px',
            }}
          />
          <button
            type="submit"
            disabled={granting}
            style={{
              padding: '10px 24px',
              background: granting ? '#9CA3AF' : '#DC2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: granting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '700',
              whiteSpace: 'nowrap',
            }}
          >
            {granting ? 'Granting...' : 'Grant Access'}
          </button>
        </form>
        <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: '#9CA3AF' }}>
          They'll be able to use every tab in this panel except this one — only the two permanent
          super admins can grant or revoke access.
        </p>
      </div>

      {/* Permanent super admins */}
      <div className="stat-card" style={{ padding: '0', overflow: 'hidden', marginBottom: '24px' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '280px' }}>SUPER ADMIN (PERMANENT)</th>
              <th>NOTE</th>
            </tr>
          </thead>
          <tbody>
            {superAdmins.map((a) => (
              <tr key={a.email} style={{ background: '#FEF2F2', borderBottom: '1px solid #E5E7EB' }}>
                <td style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>{a.email}</td>
                <td style={{ fontSize: '12px', color: '#9CA3AF' }}>
                  Hardcoded — cannot be granted, revoked, or removed from the app
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Granted admins */}
      <div className="stat-card" style={{ padding: '0', overflow: 'hidden' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '220px' }}>EMAIL</th>
              <th style={{ width: '150px' }}>STATUS</th>
              <th style={{ width: '170px' }}>GRANTED BY</th>
              <th style={{ width: '160px' }}>GRANTED ON</th>
              <th style={{ width: '120px' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {activeGranted.length === 0 && revokedGranted.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
                  No one else has been granted admin access yet
                </td>
              </tr>
            ) : (
              <>
                {activeGranted.map((a) => (
                  <tr key={a.email} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>{a.email}</td>
                    <td>
                      <span style={{
                        fontSize: '12px', fontWeight: '600', padding: '3px 10px', borderRadius: '999px',
                        background: '#DCFCE7', color: '#166534',
                      }}>
                        Active
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: '#374151' }}>{a.granted_by || '—'}</td>
                    <td style={{ fontSize: '13px', color: '#374151' }}>
                      {a.granted_at ? new Date(a.granted_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      }) : '—'}
                    </td>
                    <td>
                      <button
                        onClick={() => handleRevoke(a.email)}
                        disabled={revokingEmail === a.email}
                        style={{
                          padding: '6px 14px',
                          background: revokingEmail === a.email ? '#9CA3AF' : 'white',
                          color: '#DC2626',
                          border: '1px solid #DC2626',
                          borderRadius: '6px',
                          cursor: revokingEmail === a.email ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        {revokingEmail === a.email ? 'Revoking...' : 'Revoke'}
                      </button>
                    </td>
                  </tr>
                ))}
                {revokedGranted.map((a) => (
                  <tr key={a.email} style={{ borderBottom: '1px solid #E5E7EB', opacity: 0.6 }}>
                    <td style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>{a.email}</td>
                    <td>
                      <span style={{
                        fontSize: '12px', fontWeight: '600', padding: '3px 10px', borderRadius: '999px',
                        background: '#F3F4F6', color: '#6B7280',
                      }}>
                        Revoked
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: '#9CA3AF' }}>{a.granted_by || '—'}</td>
                    <td style={{ fontSize: '13px', color: '#9CA3AF' }}>
                      {a.granted_at ? new Date(a.granted_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      }) : '—'}
                    </td>
                    <td style={{ fontSize: '12px', color: '#9CA3AF' }}>—</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AdminAccessManager