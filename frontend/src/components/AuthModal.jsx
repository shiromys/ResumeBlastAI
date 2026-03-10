import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { signIn, signUp } from '../services/authService'
import { trackUserLogin, trackUserSignup } from '../services/activityTrackingService'
import { generateVerificationCode, sendVerificationEmail } from '../services/brevoEmailService'
import { storeVerificationCode, verifyCode, clearVerificationCode } from '../utils/verificationStorage'
import './AuthModal.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function AuthModal({ onClose, onSuccess }) {
  const [view, setView] = useState('login')

  // ✅ Initialize all fields as empty strings to ensure they are blank on load
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')

  // ✅ State for password visibility toggle (separate for login and signup)
  const [showPassword, setShowPassword] = useState(false)
  const [showSignupPassword, setShowSignupPassword] = useState(false)

  // ─── Forgot Password state ───
  const [resetStep, setResetStep] = useState('email')       // 'email' | 'code' | 'newPassword'
  const [resetEmail, setResetEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // ─── Switch view helper — clears messages ───
  const switchView = (v) => {
    setView(v)
    setMessage('')
    if (v === 'forgot_password') {
      setResetStep('email')
      setResetEmail('')
      setVerificationCode('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const result = await signIn(email.trim(), password)
      if (!result.success) throw new Error(result.error)

      // ✅ Track user login activity
      await trackUserLogin(result.user.id)

      setTimeout(() => onSuccess(result.user), 800)
    } catch (error) {
      setMessage('❌ ' + (error.message === 'Invalid login credentials' ? 'Invalid email or password' : error.message))
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      if (password.length < 6) throw new Error('Password must be at least 6 characters')

      const result = await signUp(email.trim(), password, fullName.trim())
      if (!result.success) throw new Error(result.error)

      // ✅ Track user signup activity
      if (result.user) {
        await trackUserSignup(result.user.id, fullName.trim())
      }

      if (result.session) setTimeout(() => onSuccess(result.user), 1000)
    } catch (error) {
      setMessage('❌ ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── FORGOT PASSWORD: Step 1 — Send Code ───
  const handleSendResetCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const trimmedEmail = resetEmail.trim().toLowerCase()
      if (!trimmedEmail) throw new Error('Please enter your email address.')

      const response = await fetch(`${API_URL}/api/auth/send-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail })
      })

      const data = await response.json()

      if (!data.success) throw new Error(data.error || 'Failed to send reset code.')

      setMessage('✅ A 6-digit verification code has been sent to your email.')
      setResetStep('code')
    } catch (error) {
      setMessage('❌ ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── FORGOT PASSWORD: Step 2 — Verify Code ───
  const handleVerifyCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const trimmedCode = verificationCode.trim()
      if (trimmedCode.length !== 6 || !/^\d{6}$/.test(trimmedCode)) {
        throw new Error('Please enter the 6-digit code sent to your email.')
      }

      const response = await fetch(`${API_URL}/api/auth/verify-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim().toLowerCase(), code: trimmedCode })
      })

      const data = await response.json()

      if (!data.success) throw new Error(data.error || 'Invalid or expired code.')

      setMessage('✅ Code verified! Please set your new password.')
      setResetStep('newPassword')
    } catch (error) {
      setMessage('❌ ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── FORGOT PASSWORD: Step 3 — Set New Password ───
  const handleSetNewPassword = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      if (newPassword.length < 6) throw new Error('Password must be at least 6 characters.')
      if (newPassword !== confirmPassword) throw new Error('Passwords do not match.')

      // Sign in the user with OTP (passwordless) so Supabase lets us updateUser.
      // The cleanest approach without a magic-link flow: use the admin REST API
      // via our backend to update the password by email.
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail.trim().toLowerCase(),
          new_password: newPassword
        })
      })

      const data = await response.json()

      if (!data.success) throw new Error(data.error || 'Failed to update password.')

      setMessage('✅ Password updated successfully! Redirecting to login...')
      setTimeout(() => {
        switchView('login')
      }, 2000)
    } catch (error) {
      setMessage('❌ ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Resend code helper ───
  const handleResendCode = async () => {
    setLoading(true)
    setMessage('')
    try {
      const response = await fetch(`${API_URL}/api/auth/send-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim().toLowerCase() })
      })
      const data = await response.json()
      if (!data.success) throw new Error(data.error || 'Failed to resend code.')
      setMessage('✅ A new code has been sent to your email.')
      setVerificationCode('')
    } catch (error) {
      setMessage('❌ ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>

        <div className="auth-modal">
          <h1>
            {view === 'login' && 'Job Seeker Login'}
            {view === 'signup' && 'Create Account'}
            {view === 'forgot_password' && (
              resetStep === 'email' ? 'Reset Password' :
              resetStep === 'code'  ? 'Enter Verification Code' :
              'Set New Password'
            )}
          </h1>

          {view !== 'forgot_password' && (
            <div className="auth-toggle">
              <button className={`toggle-btn ${view === 'login' ? 'active' : ''}`} onClick={() => switchView('login')}>Login</button>
              <button className={`toggle-btn ${view === 'signup' ? 'active' : ''}`} onClick={() => switchView('signup')}>Sign Up</button>
            </div>
          )}

          {/* ─────────── LOGIN ─────────── */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="form" autoComplete="off">
              <div className="form-group">
                <label>EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@example.com"
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label>PASSWORD</label>
                <div className="password-input-container">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="password-toggle-eye"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {showPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                <div style={{ textAlign: 'right', marginTop: '5px' }}>
                  <button type="button" onClick={() => switchView('forgot_password')} className="forgot-link-btn">Forgot Password?</button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Processing...' : 'Login'}</button>
            </form>
          )}

          {/* ─────────── SIGN UP ─────────── */}
          {view === 'signup' && (
            <form onSubmit={handleSignUp} className="form" autoComplete="off">
              <div className="form-group">
                <label>FULL NAME</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label>EMAIL</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@example.com"
                  autoComplete="off"
                />
              </div>
              <div className="form-group">
                <label>PASSWORD</label>
                <div className="password-input-container">
                  <input
                    type={showSignupPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Min 6 characters"
                  />
                  <button
                    type="button"
                    className="password-toggle-eye"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    aria-label={showSignupPassword ? "Hide password" : "Show password"}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {showSignupPassword ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Processing...' : 'Sign Up'}</button>
            </form>
          )}

          {/* ─────────── FORGOT PASSWORD ─────────── */}
          {view === 'forgot_password' && (

            <>
              {/* Step 1: Enter email */}
              {resetStep === 'email' && (
                <form onSubmit={handleSendResetCode} className="form" autoComplete="off">
                  <p style={{ color: '#888', fontSize: '14px', marginBottom: '16px' }}>
                    Enter your account email address and we'll send you a 6-digit verification code.
                  </p>
                  <div className="form-group">
                    <label>EMAIL</label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                      placeholder="name@example.com"
                      autoComplete="off"
                    />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary">
                    {loading ? 'Sending...' : 'Send Verification Code'}
                  </button>
                  <div style={{ textAlign: 'center', marginTop: '12px' }}>
                    <button type="button" onClick={() => switchView('login')} className="forgot-link-btn">
                      ← Back to Login
                    </button>
                  </div>
                </form>
              )}

              {/* Step 2: Enter 6-digit code */}
              {resetStep === 'code' && (
                <form onSubmit={handleVerifyCode} className="form" autoComplete="off">
                  <p style={{ color: '#888', fontSize: '14px', marginBottom: '16px' }}>
                    A 6-digit code was sent to <strong>{resetEmail}</strong>. Enter it below. The code expires in 10 minutes.
                  </p>
                  <div className="form-group">
                    <label>VERIFICATION CODE</label>
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => {
                        // Only allow digits, max 6
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                        setVerificationCode(val)
                      }}
                      required
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      autoComplete="one-time-code"
                      style={{ letterSpacing: '4px', fontSize: '20px', textAlign: 'center' }}
                    />
                  </div>
                  <button type="submit" disabled={loading || verificationCode.length !== 6} className="btn-primary">
                    {loading ? 'Verifying...' : 'Verify Code'}
                  </button>
                  <div style={{ textAlign: 'center', marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '16px' }}>
                    <button type="button" onClick={handleResendCode} disabled={loading} className="forgot-link-btn">
                      Resend Code
                    </button>
                    <button type="button" onClick={() => { setResetStep('email'); setMessage('') }} className="forgot-link-btn">
                      ← Change Email
                    </button>
                  </div>
                </form>
              )}

              {/* Step 3: Set new password */}
              {resetStep === 'newPassword' && (
                <form onSubmit={handleSetNewPassword} className="form" autoComplete="off">
                  <p style={{ color: '#888', fontSize: '14px', marginBottom: '16px' }}>
                    Create a new password for <strong>{resetEmail}</strong>.
                  </p>
                  <div className="form-group">
                    <label>NEW PASSWORD</label>
                    <div className="password-input-container">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="Min 6 characters"
                      />
                      <button
                        type="button"
                        className="password-toggle-eye"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        aria-label={showNewPassword ? "Hide password" : "Show password"}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {showNewPassword ? (
                            <>
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </>
                          ) : (
                            <>
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </>
                          )}
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>CONFIRM PASSWORD</label>
                    <div className="password-input-container">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="Re-enter password"
                      />
                      <button
                        type="button"
                        className="password-toggle-eye"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {showConfirmPassword ? (
                            <>
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </>
                          ) : (
                            <>
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </>
                          )}
                        </svg>
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || newPassword.length < 6 || newPassword !== confirmPassword}
                    className="btn-primary"
                  >
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              )}
            </>
          )}

          {message && (
            <div className={`message ${message.includes('❌') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AuthModal