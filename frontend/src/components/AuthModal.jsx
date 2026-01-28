import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { signIn, signUp } from '../services/authService'
import { trackUserLogin, trackUserSignup } from '../services/activityTrackingService'
import { generateVerificationCode, sendVerificationEmail } from '../services/brevoEmailService'
import { storeVerificationCode, verifyCode, clearVerificationCode } from '../utils/verificationStorage'
import './AuthModal.css'

function AuthModal({ onClose, onSuccess }) {
  const [view, setView] = useState('login')
  
  // ✅ STATE INITIALIZATION: These are empty, ensuring no hardcoded values exist.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  
  // Forgot Password States
  const [resetStep, setResetStep] = useState('email')
  const [verificationCode, setVerificationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // Login Handler
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    
    try {
      console.log('\n🔐 === LOGIN FLOW STARTED ===')
      
      const result = await signIn(email.trim(), password)
      
      if (!result.success) throw new Error(result.error)
      if (!result.user) throw new Error('Login failed - no user data returned')
      
      console.log('✅ Authentication successful')
      
      // Track Login Activity
      try {
        await trackUserLogin(result.user.id, result.user.email, {
          login_method: 'password',
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
          platform: navigator.platform
        })
      } catch (trackError) {
        console.error('⚠️ Login tracking failed (non-critical):', trackError)
      }
      
      setMessage('✅ Login successful!')
      setTimeout(() => onSuccess(result.user), 800)
      
    } catch (error) {
      console.error('❌ Login error:', error)
      let errorMessage = error.message
      if (errorMessage === 'Invalid login credentials') {
        errorMessage = 'Invalid email or password'
      }
      setMessage('❌ ' + errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Signup Handler
  const handleSignUp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    
    try {
      console.log('\n📝 === SIGNUP FLOW STARTED ===')
      
      if (password.length < 6) throw new Error('Password must be at least 6 characters')
      if (!fullName.trim()) throw new Error('Please enter your full name')
      
      const result = await signUp(email.trim(), password, fullName.trim())
      
      if (!result.success) throw new Error(result.error)
      if (!result.user) throw new Error('Signup failed - no user data returned')
      
      console.log('✅ Account created in Supabase Auth')
      
      // Track Signup Activity
      try {
        await trackUserSignup(
          result.user.id, 
          result.user.email, 
          {
            full_name: fullName.trim(),
            signup_method: 'email',
            timestamp: new Date().toISOString(),
            user_agent: navigator.userAgent,
            platform: navigator.platform
          }
        )
      } catch (trackError) {
        console.error('❌ Signup tracking failed:', trackError)
      }
      
      if (result.session) {
        setMessage('✅ Account created successfully!')
        setTimeout(() => onSuccess(result.user), 1000)
      } else {
        setMessage('✅ Account created! Please check your email to verify.')
      }
      
    } catch (error) {
      setMessage('❌ ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // Forgot Password Handlers
  const handleSendCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const code = generateVerificationCode()
      storeVerificationCode(email, code)
      await sendVerificationEmail(email, code)
      setMessage('✅ Verification code sent to your email')
      setResetStep('verify')
    } catch (error) {
      setMessage('❌ ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = (e) => {
    e.preventDefault()
    const result = verifyCode(email, verificationCode)
    if (result.valid) {
      setMessage('✅ Code verified')
      setResetStep('new_password')
    } else {
      setMessage('❌ ' + result.error)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      const response = await fetch(`${apiUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, new_password: newPassword })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to update password')
      clearVerificationCode(email)
      setMessage('✅ Password updated! Please log in.')
      setTimeout(() => {
        setView('login')
        setResetStep('email')
        setPassword('')
      }, 2000)
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
            {view === 'forgot_password' && 'Reset Password'}
          </h1>
          
          {view !== 'forgot_password' && (
            <div className="auth-toggle">
              <button 
                className={`toggle-btn ${view === 'login' ? 'active' : ''}`} 
                onClick={() => setView('login')}
              >
                Login
              </button>
              <button 
                className={`toggle-btn ${view === 'signup' ? 'active' : ''}`} 
                onClick={() => setView('signup')}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* LOGIN FORM */}
          {/* ✅ FIX: Added autoComplete="off" to form and inputs */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="form" autoComplete="off">
              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  autoComplete="off" 
                  placeholder="name@example.com"
                  name="login_email_field_random_id" 
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  autoComplete="new-password"
                  placeholder="••••••••"
                  name="login_password_field_random_id"
                />
                <div style={{textAlign: 'right', marginTop: '5px'}}>
                   <button 
                     type="button" 
                     onClick={() => setView('forgot_password')} 
                     style={{
                       background:'none', 
                       border:'none', 
                       color:'#667eea', 
                       cursor:'pointer', 
                       fontSize:'12px'
                     }}
                   >
                     Forgot Password?
                   </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Processing...' : 'Login'}
              </button>
            </form>
          )}

          {/* SIGNUP FORM */}
          {/* ✅ FIX: Added autoComplete="off" to form and inputs */}
          {view === 'signup' && (
            <form onSubmit={handleSignUp} className="form" autoComplete="off">
              <div className="form-group">
                <label>Full Name</label>
                <input 
                  type="text" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)} 
                  placeholder="e.g. John Doe" 
                  required 
                  autoComplete="off"
                  name="signup_name_field"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  autoComplete="off"
                  placeholder="name@example.com"
                  name="signup_email_field"
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  minLength={6} 
                  autoComplete="new-password"
                  placeholder="Min 6 characters"
                  name="signup_password_field"
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Processing...' : 'Sign Up'}
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD */}
          {view === 'forgot_password' && (
            <div className="form">
              {resetStep === 'email' && (
                <form onSubmit={handleSendCode} autoComplete="off">
                  <p className="subtitle">Enter your email to receive a verification code.</p>
                  <div className="form-group">
                    <label>Email</label>
                    <input 
                      type="email" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      required 
                      autoComplete="off"
                    />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary">
                    {loading ? 'Sending Code...' : 'Send Verification Code'}
                  </button>
                </form>
              )}

              {resetStep === 'verify' && (
                <form onSubmit={handleVerifyCode} autoComplete="off">
                  <p className="subtitle">Enter the 6-digit code sent to {email}</p>
                  <div className="form-group">
                    <label>Verification Code</label>
                    <input 
                      type="text" 
                      value={verificationCode} 
                      onChange={(e) => setVerificationCode(e.target.value)} 
                      placeholder="123456" 
                      required 
                      autoComplete="off"
                    />
                  </div>
                  <button type="submit" className="btn-primary">Verify Code</button>
                </form>
              )}

              {resetStep === 'new_password' && (
                <form onSubmit={handleResetPassword} autoComplete="off">
                  <p className="subtitle">Create a new password</p>
                  <div className="form-group">
                    <label>New Password</label>
                    <input 
                      type="password" 
                      value={newPassword} 
                      onChange={(e) => setNewPassword(e.target.value)} 
                      required 
                      minLength={6} 
                      autoComplete="new-password"
                    />
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary">
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              )}
              
              <button 
                type="button" 
                onClick={() => { setView('login'); setResetStep('email'); }} 
                className="btn-text" 
                style={{width: '100%', marginTop: '10px'}}
              >
                ← Back to Login
              </button>
            </div>
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