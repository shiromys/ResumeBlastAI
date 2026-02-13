import { useState, useEffect } from 'react'
import { checkRecruiterExists, registerRecruiter, loginRecruiter, getCurrentSession } from '../services/recruiterAuthService'
import { logRecruiterActivity, ACTIVITY_TYPES } from '../services/recruiterActivityService'
import './AuthModal.css'

function RecruiterAuth({ onClose, onSuccess }) {
  const [step, setStep] = useState('email') 
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const checkActiveSession = async () => {
      const activeUser = await getCurrentSession();
      if (activeUser && activeUser.user_metadata?.role === 'recruiter') {
        onSuccess(activeUser);
      }
    };
    checkActiveSession();
  }, [onSuccess]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (!email.includes('@')) throw new Error('Invalid email')
      const result = await checkRecruiterExists(email)

      // If they exist in your DB tables, go to login
      if (result.exists) {
        setStep('login') 
      } else {
        // If not in DB tables, try registration
        setStep('register') 
      }
    } catch (error) {
      setMessage('❌ ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    
    const result = await loginRecruiter(email, password)
    
    if (result.success) {
      await logRecruiterActivity(result.recruiter.id, ACTIVITY_TYPES.LOGIN, {
        email: result.recruiter.email,
        success: true
      })
      setTimeout(() => onSuccess(result.recruiter), 500)
    } else {
      setMessage('❌ ' + (result.error || 'Invalid email or password'))
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    
    if (password.length < 6) {
      setMessage('❌ Password must be at least 6 characters')
      setLoading(false)
      return
    }

    const result = await registerRecruiter(email, password)

    if (result.success) {
      await logRecruiterActivity(result.recruiter.id, 'registration', {
        email: result.recruiter.email
      })
      setTimeout(() => onSuccess(result.recruiter), 1000)
    } else {
      // FIXED: If registration fails because the user already exists in Auth, switch to Login
      if (result.isExisting) {
        setStep('login')
        setMessage('ℹ️ You already have an account. Please log in.')
      } else {
        setMessage('❌ ' + (result.error || 'Registration failed'))
      }
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="auth-modal">
          <h1>{step === 'email' ? 'Recruiter Access' : step === 'login' ? 'Welcome Back' : 'Create Account'}</h1>
          <p className="subtitle" style={{marginBottom: '20px'}}>
            {step === 'email' && 'Enter your work email to start'}
            {step === 'login' && `Log in as ${email}`}
            {step === 'register' && `New recruiter? Create a password for ${email}`}
          </p>

          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="form">
              <div className="form-group">
                <label>Work Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required autoFocus />
              </div>
              <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Checking...' : 'Continue →'}</button>
            </form>
          )}

          {step === 'login' && (
            <form onSubmit={handleLogin} className="form">
              <div className="form-group">
                <label>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
              </div>
              <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Logging in...' : 'Login'}</button>
              <button type="button" onClick={() => {setStep('email'); setPassword(''); setMessage('');}} className="btn-text">← Back</button>
            </form>
          )}

          {step === 'register' && (
            <form onSubmit={handleRegister} className="form">
              <div className="form-group">
                <label>Create Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" required minLength={6} autoFocus />
              </div>
              <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Creating Account...' : 'Create Account'}</button>
              <button type="button" onClick={() => {setStep('email'); setPassword(''); setMessage('');}} className="btn-text">← Back</button>
            </form>
          )}
          {message && <div className={`message ${message.includes('❌') ? 'error' : message.includes('ℹ️') ? 'info' : 'success'}`}>{message}</div>}
        </div>
      </div>
    </div>
  )
}

export default RecruiterAuth