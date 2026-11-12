import { useState } from 'react'
import { supabase } from '../lib/supabase'

// ✅ NEW: Shown right after a guest's blast completes (ResumeAnalysis.jsx),
// replacing the old "alert + redirect to homepage" behavior. Collects the
// name + password needed to turn their guest payment into a real account.
// The email is intentionally LOCKED (not editable) — it's the exact address
// Stripe Checkout already collected at payment time, so there is never a
// mismatch between "who paid" and "who owns the account": one email, one
// user_id, no dual identities.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function GuestAccountSetup({ email, stripeSessionId, onComplete, onClose }) {
  // ✅ Normally locked to the email Stripe already collected at checkout.
  // In the rare case that didn't come through, fall back to an editable
  // field instead of showing a blank, disabled input the guest can't fix.
  const emailIsKnown = !!email
  const [emailValue, setEmailValue] = useState(email || '')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [password, setPassword]   = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const finalEmail = emailValue.trim().toLowerCase()
    if (!finalEmail || !EMAIL_RE.test(finalEmail)) {
      setError('Please enter a valid email address.')
      return
    }
    if (!firstName.trim()) {
      setError('Please enter your first name.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`${API_URL}/api/guest/complete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: finalEmail,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          password,
          stripe_session_id: stripeSessionId || '',
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Could not complete your account. Please try again.')
      }

      // Account now exists with this exact email/password — sign in
      // immediately so the app's normal auth state takes over (clears
      // guest flags, routes to the dashboard), same as any other login.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: finalEmail, password })
      if (signInError) {
        throw new Error('Account created, but automatic sign-in failed. Please log in with your new password.')
      }

      // Clear guest-session leftovers now that this is a real account.
      localStorage.removeItem('is_guest_session')
      localStorage.removeItem('guest_id')
      localStorage.removeItem('guestId')
      localStorage.removeItem('guest_confirmed_email')
      localStorage.removeItem('rb_guest_tracker_id')
      localStorage.removeItem('selected_plan_type')

      onComplete && onComplete()
    } catch (err) {
      console.error('[GuestAccountSetup] error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.65)', display: 'flex',
      justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '20px',
      overflowY: 'auto',
    }}>
      <div style={{
        background: 'white', padding: '36px', borderRadius: '16px',
        maxWidth: '460px', width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔐</div>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '22px', color: '#111827' }}>
            Complete Your Account Setup
          </h3>
          <p style={{ color: '#4b5563', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
            Get full access to your dashboard and campaign details — recruiter replies,
            delivery status, and everything else, all in one place.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
            {emailIsKnown ? 'Email (the one you used to pay)' : 'Email address'}
          </label>
          <input
            type="email"
            value={emailValue}
            onChange={emailIsKnown ? undefined : (e) => setEmailValue(e.target.value)}
            disabled={submitting || emailIsKnown}
            readOnly={emailIsKnown}
            title={emailIsKnown ? "This is locked to the email you used at checkout, so your payment and your account always match." : ''}
            placeholder={emailIsKnown ? '' : 'you@example.com'}
            style={{
              width: '100%', padding: '12px 14px', marginBottom: '16px',
              border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '14px',
              background: emailIsKnown ? '#F9FAFB' : 'white',
              color: emailIsKnown ? '#6B7280' : '#111827', boxSizing: 'border-box',
            }}
          />

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                First name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={submitting}
                autoFocus
                style={{
                  width: '100%', padding: '12px 14px', border: '1px solid #D1D5DB',
                  borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
                Last name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={submitting}
                style={{
                  width: '100%', padding: '12px 14px', border: '1px solid #D1D5DB',
                  borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
            Set a password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            placeholder="At least 8 characters"
            style={{
              width: '100%', padding: '12px 14px', marginBottom: '16px',
              border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
            }}
          />

          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
            Confirm password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={submitting}
            style={{
              width: '100%', padding: '12px 14px', marginBottom: '8px',
              border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box',
            }}
          />

          {error && (
            <p style={{ color: '#DC2626', fontSize: '13px', margin: '8px 0 0 0' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', padding: '14px 24px', marginTop: '20px',
              background: submitting ? '#9CA3AF' : '#DC2626', color: 'white',
              border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: '700',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Setting up your account...' : 'Complete Setup & View Dashboard'}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                width: '100%', padding: '10px 24px', marginTop: '10px',
                background: 'transparent', color: '#6B7280',
                border: 'none', fontSize: '13px', cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Maybe later
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

export default GuestAccountSetup