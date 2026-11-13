import { useState, useEffect } from 'react'
import { adminFetch } from '../../services/adminApi'  // ✅ NEW: attaches the admin's Supabase token to every call

// ✅ NEW: "Admin Audit Log" screen — change 3 of the super-admin panel
// restrictions. Only rendered for super admins — AdminDashboard.jsx gates
// the nav button and this component's render on adminRole === 'super_admin',
// and the backend independently 403s GET /api/admin/audit-log for anyone
// else, so there's no path to this data without actually being a super
// admin. Mirrors AdminAccessManager.jsx's structure/visual style so it fits
// the rest of the panel.
//
// Shows every state-changing action any admin has taken: delete_user,
// refund_payment, maintenance_mode_toggle, ban_user/unban_user,
// force_drip_wave, grant_admin_access/revoke_admin_access. Deliberately
// does NOT show reads/views/exports — see backend/services/audit_log_service.py.
const ACTION_LABELS = {
  delete_user: 'Deleted user',
  refund_payment: 'Refunded payment',
  maintenance_mode_toggle: 'Toggled maintenance mode',
  ban_user: 'Banned user',
  unban_user: 'Unbanned user',
  force_drip_wave: 'Forced drip wave',
  grant_admin_access: 'Granted admin access',
  revoke_admin_access: 'Revoked admin access',
}

const ACTION_COLORS = {
  delete_user: { bg: '#FEE2E2', fg: '#991B1B' },
  refund_payment: { bg: '#FEE2E2', fg: '#991B1B' },
  maintenance_mode_toggle: { bg: '#FEF3C7', fg: '#92400E' },
  ban_user: { bg: '#FEE2E2', fg: '#991B1B' },
  unban_user: { bg: '#DCFCE7', fg: '#166534' },
  force_drip_wave: { bg: '#DBEAFE', fg: '#1E40AF' },
  grant_admin_access: { bg: '#DCFCE7', fg: '#166534' },
  revoke_admin_access: { bg: '#FEE2E2', fg: '#991B1B' },
}

function describeDetails(entry) {
  const d = entry.details || {}
  const parts = []
  if (entry.target) parts.push(entry.target)
  if (d.reason) parts.push(`reason: ${d.reason}`)
  if (d.wave) parts.push(`wave ${d.wave}`)
  if (typeof d.enabled === 'boolean') parts.push(d.enabled ? 'turned ON' : 'turned OFF')
  if (d.amount != null) parts.push(`amount: ${d.amount}`)
  if (d.refund_id) parts.push(`refund: ${d.refund_id}`)
  if (d.warning) parts.push(`⚠️ ${d.warning}`)
  return parts.join(' · ') || '—'
}

function AdminAuditLog() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterEmail, setFilterEmail] = useState('')

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  useEffect(() => {
    loadLog()
  }, [])

  const loadLog = async (emailFilter) => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({ limit: '200' })
      if (emailFilter) qs.set('admin_email', emailFilter)
      const response = await adminFetch(`${API_URL}/api/admin/audit-log?${qs.toString()}`)
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`)
      setEntries(data.entries || [])
    } catch (err) {
      console.error('❌ Error loading audit log:', err)
      setError('Could not load audit log — ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFilter = (e) => {
    e.preventDefault()
    loadLog(filterEmail.trim().toLowerCase() || undefined)
  }

  const handleClearFilter = () => {
    setFilterEmail('')
    loadLog()
  }

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
          🛡️ Admin Audit Log
        </h2>
        <span style={{ fontSize: '13px', color: '#6B7280' }}>
          Only visible to super admins — every delete, refund, ban/unban, forced wave, maintenance
          toggle, and admin-access change any admin has made, newest first. Views and exports aren't logged here.
        </span>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      <div className="stat-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <form onSubmit={handleFilter} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="email"
            placeholder="Filter by admin email (optional)"
            value={filterEmail}
            onChange={(e) => setFilterEmail(e.target.value)}
            style={{
              flex: '1 1 260px',
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #D1D5DB',
              fontSize: '13px',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '9px 20px', background: '#DC2626', color: 'white', border: 'none',
              borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap',
            }}
          >
            Filter
          </button>
          {filterEmail && (
            <button
              type="button"
              onClick={handleClearFilter}
              style={{
                padding: '9px 16px', background: 'white', color: '#6B7280', border: '1px solid #E5E7EB',
                borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap',
              }}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => loadLog(filterEmail.trim().toLowerCase() || undefined)}
            style={{
              padding: '9px 16px', background: 'white', color: '#6B7280', border: '1px solid #E5E7EB',
              borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap',
            }}
          >
            ↻ Refresh
          </button>
        </form>
      </div>

      <div className="stat-card" style={{ padding: '0', overflow: 'hidden' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '170px' }}>WHEN</th>
              <th style={{ width: '220px' }}>ADMIN</th>
              <th style={{ width: '190px' }}>ACTION</th>
              <th>DETAILS</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
                  No admin actions recorded yet
                </td>
              </tr>
            ) : (
              entries.map((e, idx) => {
                const color = ACTION_COLORS[e.action] || { bg: '#F3F4F6', fg: '#374151' }
                return (
                  <tr key={e.id || idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ fontSize: '12.5px', color: '#374151', whiteSpace: 'nowrap' }}>
                      {e.created_at ? new Date(e.created_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                      }) : '—'}
                    </td>
                    <td style={{ fontWeight: '600', color: '#111827', fontSize: '13px' }}>
                      {e.admin_email || '—'}
                      {e.admin_role && (
                        <div style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '500' }}>{e.admin_role}</div>
                      )}
                    </td>
                    <td>
                      <span style={{
                        fontSize: '12px', fontWeight: '600', padding: '3px 10px', borderRadius: '999px',
                        background: color.bg, color: color.fg, whiteSpace: 'nowrap',
                      }}>
                        {ACTION_LABELS[e.action] || e.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '12.5px', color: '#374151' }}>
                      {describeDetails(e)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AdminAuditLog