import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { signIn, signUp } from '../services/authService'
import { trackUserLogin, trackUserSignup } from '../services/activityTrackingService'
import { generateVerificationCode, sendVerificationEmail } from '../services/brevoEmailService'
import { storeVerificationCode, verifyCode, clearVerificationCode } from '../utils/verificationStorage'
import './AuthModal.css'

function AuthModal({ onClose, onSuccess }) {
  const [view, setView] = useState('login')
  
  // ✅ Initialize all fields as empty strings to ensure they are blank on load
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  
  // ✅ State for password visibility toggle (separate for login and signup)
  const [showPassword, setShowPassword] = useState(false)
  const [showSignupPassword, setShowSignupPassword] = useState(false)
  
  const [resetStep, setResetStep] = useState('email')
  const [verificationCode, setVerificationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

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
              <button className={`toggle-btn ${view === 'login' ? 'active' : ''}`} onClick={() => setView('login')}>Login</button>
              <button className={`toggle-btn ${view === 'signup' ? 'active' : ''}`} onClick={() => setView('signup')}>Sign Up</button>
            </div>
          )}

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
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    >
                      {showPassword ? (
                        // Eye with slash (hidden)
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        // Eye open (visible)
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                <div style={{textAlign: 'right', marginTop: '5px'}}>
                   <button type="button" onClick={() => setView('forgot_password')} className="forgot-link-btn">Forgot Password?</button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Processing...' : 'Login'}</button>
            </form>
          )}

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
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    >
                      {showSignupPassword ? (
                        // Eye with slash (hidden)
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        // Eye open (visible)
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
          
          {message && <div className={`message ${message.includes('❌') ? 'error' : 'success'}`}>{message}</div>}
        </div>
      </div>
    </div>
  )
}

export default AuthModal