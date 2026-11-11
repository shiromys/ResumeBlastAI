import { useState, useEffect } from 'react'

// ✅ NEW: Admin-panel alert + conversion feature for guests who completed a
// paid blast purchase without a registered account. Mirrors ContactSubmissions.jsx's
// structure/visual style so it fits the rest of the admin panel.
function GuestUsers({ onConvert }) {
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [selectedGuest, setSelectedGuest] = useState(null)
  const [converting, setConverting] = useState(false)

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  useEffect(() => {
    loadGuests()
  }, [])

  const loadGuests = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/guest-users`)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const data = await response.json()
      setGuests(data.guests || [])
      console.log('✅ Loaded', data.guests?.length || 0, 'unconverted guest users')
      if (onConvert) onConvert()
    } catch (error) {
      console.error('❌ Error loading guest users:', error)
      setGuests([])
    } finally {
      setLoading(false)
    }
  }

  const handleConvertClick = (guest) => {
    setSelectedGuest(guest)
    setShowConfirmDialog(true)
  }

  const cancelConvert = () => {
    if (converting) return
    setShowConfirmDialog(false)
    setSelectedGuest(null)
  }

  const confirmConvert = async () => {
    if (!selectedGuest) return

    setConverting(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/guest-users/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: selectedGuest.email })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || `Failed to convert: ${response.status}`)

      setShowConfirmDialog(false)
      setSelectedGuest(null)

      await loadGuests()

      if (result.created_new_account) {
        alert(`✅ Account created for ${selectedGuest.email}. They've been emailed a link to set their password and log in.`)
      } else {
        alert(`✅ ${selectedGuest.email} already had an account — their guest purchase has been linked to it.`)
      }
    } catch (error) {
      console.error('❌ Error converting guest:', error)
      alert(`Failed to convert: ${error.message}`)
    } finally {
      setConverting(false)
    }
  }

  const formatAmount = (amount, currency) => {
    if (amount === null || amount === undefined) return '—'
    // amount is stored in cents, same convention as /api/admin/stats
    const value = (Number(amount) / 100).toFixed(2)
    return `${(currency || 'usd').toUpperCase()} $${value}`
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
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#111827' }}>
          👤 Guest Users
        </h2>
        <span style={{ fontSize: '13px', color: '#6B7280' }}>
          Paid guests with no registered account ({guests.length})
        </span>
      </div>

      <div className="stat-card" style={{ padding: '0', overflow: 'hidden' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '200px' }}>EMAIL</th>
              <th style={{ width: '140px' }}>NAME</th>
              <th style={{ width: '130px' }}>PLAN</th>
              <th style={{ width: '110px' }}>AMOUNT</th>
              <th style={{ width: '150px' }}>PAID ON</th>
              <th style={{ width: '170px' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {guests.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
                  No unconverted guest purchases right now
                </td>
              </tr>
            ) : (
              guests.map((guest) => (
                <tr key={guest.id} style={{ background: '#FFFBEB', borderBottom: '1px solid #E5E7EB' }}>
                  <td>
                    <a
                      href={`mailto:${guest.email}`}
                      style={{ color: '#2563EB', textDecoration: 'none', fontSize: '13px', fontWeight: '500' }}
                      onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                      onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                    >
                      {guest.email}
                    </a>
                  </td>
                  <td style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>
                    {guest.name || '—'}
                  </td>
                  <td style={{ fontSize: '13px', color: '#374151', textTransform: 'capitalize' }}>
                    {guest.plan_name || '—'}
                  </td>
                  <td style={{ fontSize: '13px', color: '#374151' }}>
                    {formatAmount(guest.amount, guest.currency)}
                  </td>
                  <td style={{ fontSize: '13px', color: '#374151' }}>
                    {guest.completed_at
                      ? new Date(guest.completed_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
                        })
                      : '—'}
                  </td>
                  <td>
                    <button
                      onClick={() => handleConvertClick(guest)}
                      disabled={converting}
                      style={{
                        padding: '8px 18px',
                        background: converting ? '#9CA3AF' : '#DC2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: converting ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                        boxShadow: '0 1px 3px rgba(220, 38, 38, 0.3)'
                      }}
                      onMouseOver={(e) => { if (!converting) e.target.style.background = '#B91C1C' }}
                      onMouseOut={(e) => { if (!converting) e.target.style.background = '#DC2626' }}
                    >
                      Convert to Registered User
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && selectedGuest && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 10000, padding: '20px', backdropFilter: 'blur(4px)'
          }}
          onClick={cancelConvert}
        >
          <div
            style={{
              background: 'white', borderRadius: '12px', padding: '30px', maxWidth: '460px', width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)',
              animation: 'slideIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: '28px', color: 'white', fontWeight: 'bold'
              }}>
                👤
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '700', color: '#111827' }}>
                Convert to Registered User
              </h3>
            </div>

            <p style={{ fontSize: '15px', color: '#374151', marginBottom: '20px', lineHeight: '1.6', textAlign: 'center' }}>
              If no account exists for this email, one will be created and they'll be emailed a link to set
              their password. If an account already exists, their purchase will simply be linked to it.
            </p>

            <div style={{ background: '#F9FAFB', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', border: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
                Guest: <span style={{ fontWeight: '600', color: '#111827' }}>
                  {selectedGuest.name} ({selectedGuest.email})
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                Plan: <span style={{ fontWeight: '600', color: '#111827' }}>{selectedGuest.plan_name || '—'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={confirmConvert}
                disabled={converting}
                style={{
                  padding: '12px 32px',
                  background: converting ? '#9CA3AF' : 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
                  color: 'white', border: 'none', borderRadius: '8px',
                  cursor: converting ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '700',
                  minWidth: '100px'
                }}
              >
                {converting ? 'Converting...' : 'Convert'}
              </button>
              <button
                onClick={cancelConvert}
                disabled={converting}
                style={{
                  padding: '12px 32px', background: 'white', color: '#374151', border: '2px solid #E5E7EB',
                  borderRadius: '8px', cursor: converting ? 'not-allowed' : 'pointer', fontSize: '15px',
                  fontWeight: '600', minWidth: '100px', opacity: converting ? 0.5 : 1
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

export default GuestUsers