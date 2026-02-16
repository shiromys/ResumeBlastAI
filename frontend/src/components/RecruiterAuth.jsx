// src/components/RecruiterAuth.jsx
import { useState } from 'react'
import { checkRecruiterExists, registerRecruiter, grantDirectRecruiterAccess } from '../services/recruiterAuthService'
import { logRecruiterActivity, ACTIVITY_TYPES } from '../services/recruiterActivityService'
import './AuthModal.css'

function RecruiterAuth({ onClose, onSuccess }) {
  const [step, setStep] = useState('email') 
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const result = await checkRecruiterExists(email);
      if (result.exists) {
        // FLOW: Verified Recruiter (Paid or Freemium)
        const access = await grantDirectRecruiterAccess(email);
        if (access.success) {
          // Log activity using the existing ID from the database
          await logRecruiterActivity(access.recruiter.id, ACTIVITY_TYPES.LOGIN, { 
            email,
            source: result.source 
          });
          onSuccess({ ...access.recruiter, user_metadata: { role: 'recruiter' } });
        } else {
          setMessage('❌ Profile verification failed. Please contact support.');
        }
      } else {
        // FLOW: New Recruiter - Proceed to create account
        setStep('register');
      }
    } catch (err) {
      setMessage('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await registerRecruiter(email, password);
      if (result.success) {
        // New recruiter activity log
        await logRecruiterActivity(result.recruiter.id, 'registration', { email });
        onSuccess({ ...result.recruiter, user_metadata: { role: 'recruiter' } });
      } else {
        setMessage('❌ ' + result.error);
      }
    } catch (err) {
      setMessage('❌ Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="auth-modal">
          <h1>{step === 'email' ? 'Recruiter Login' : 'Create Recruiter Account'}</h1>
          <form onSubmit={step === 'email' ? handleEmailSubmit : handleRegister} className="form">
            <div className="form-group">
              <label>Work Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value.toLowerCase())} 
                placeholder="recruiter@company.com" 
                required 
                autoFocus 
                disabled={step === 'register'}
              />
            </div>
            {step === 'register' && (
              <div className="form-group">
                <label>Create Password</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  minLength={6} 
                  placeholder="••••••••" 
                  autoFocus
                />
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Verifying...' : (step === 'email' ? 'Access Dashboard' : 'Confirm & Login')}
            </button>
          </form>
          {message && <div className={`message ${message.includes('❌') ? 'error' : 'success'}`}>{message}</div>}
        </div>
      </div>
    </div>
  );
}

export default RecruiterAuth;