// src/components/RecruiterAuth.jsx
import { useState } from 'react'
import { checkRecruiterExists, grantDirectRecruiterAccess } from '../services/recruiterAuthService'
import { logRecruiterActivity, ACTIVITY_TYPES } from '../services/recruiterActivityService'
import './AuthModal.css'

function RecruiterAuth({ onClose, onSuccess }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const result = await checkRecruiterExists(email);
      
      if (result.exists) {
        // FLOW: Verified Recruiter - Grant Access
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
        // FLOW: Unknown Recruiter - Deny Access and redirect to Employer Network
        setMessage('❌ Account not found. Please apply via the Employer Network page to register.');
      }
    } catch (err) {
      setMessage('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>
        <div className="auth-modal">
          <h1>Recruiter Login</h1>
          <form onSubmit={handleEmailSubmit} className="form">
            <div className="form-group">
              <label>Work Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value.toLowerCase())} 
                placeholder="recruiter@company.com" 
                required 
                autoFocus 
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Verifying...' : 'Access Dashboard'}
            </button>
          </form>
          {message && <div className={`message ${message.includes('❌') ? 'error' : 'success'}`}>{message}</div>}
        </div>
      </div>
    </div>
  );
}

export default RecruiterAuth;