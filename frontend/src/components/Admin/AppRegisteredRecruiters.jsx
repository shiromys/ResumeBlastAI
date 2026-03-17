// src/components/Admin/AppRegisteredRecruiters.jsx
import React, { useState, useEffect } from 'react';
import './AdminStyles.css';

const AppRegisteredRecruiters = ({ onUpdate }) => {
  const [recruiters, setRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    fetchRecruiters();
  }, []);

  const fetchRecruiters = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/app-registered-recruiters`);
      const data = await response.json();
      
      if (data.success) {
        setRecruiters(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch registered recruiters');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/app-registered-recruiters/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();

      if (data.success) {
        // Dynamically update the list so the green badge appears instantly
        setRecruiters(prevRecruiters => 
          prevRecruiters.map(rec => 
            rec.id === id ? { ...rec, status: 'added' } : rec
          )
        );
        
        // Trigger the parent dashboard to update the sidebar counter
        if (onUpdate) onUpdate();
      } else {
        alert('❌ ' + (data.error || 'Failed to approve recruiter'));
      }
    } catch (err) {
      alert('❌ An error occurred while adding the recruiter.');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) return <div className="error-banner">⚠️ {error}</div>;

  return (
    <div>
      <h2>Employer Signups</h2>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Recruiters who signed up via the Employer Network page. Click "Add to System" to move them to the active recruiters database.
      </p>
      
      <div className="stat-card" style={{ padding: '0', overflow: 'hidden' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Company</th>
              <th>Email</th>
              <th>Skills</th>
              <th>Date Registered</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {recruiters.map((recruiter) => {
              // Parse skills safely for display
              let skills = [];
              try {
                const primary = recruiter.primary_skills || [];
                const additional = recruiter.additional_skills || [];
                skills = [...primary, ...additional];
              } catch(e) {}

              return (
                <tr key={recruiter.id}>
                  <td style={{ fontWeight: '600' }}>{recruiter.recruiter_name || 'N/A'}</td>
                  <td>{recruiter.company_name || 'N/A'}</td>
                  <td>{recruiter.email}</td>
                  <td>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px'}}>
                        {skills.slice(0, 3).map((s, i) => (
                            <span key={i} style={{background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', color: '#374151'}}>{s}</span>
                        ))}
                        {skills.length > 3 && <span style={{fontSize: '11px', color: '#6b7280'}}>+{skills.length - 3}</span>}
                    </div>
                  </td>
                  <td>{new Date(recruiter.created_at).toLocaleDateString()}</td>
                  <td>
                    {recruiter.status === 'added' ? (
                      /* ✅ THE GREEN BADGE (Guaranteed Styling) */
                      <span style={{
                        backgroundColor: '#d1fae5',
                        color: '#065f46',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '700',
                        display: 'inline-block',
                        border: '1px solid #a7f3d0',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}>
                        ✓ Added
                      </span>
                    ) : (
                      /* THE ACTION BUTTON */
                      <button 
                        className="btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: '#3b82f6', border: 'none', boxShadow: '0 1px 2px rgba(59,130,246,0.5)' }}
                        onClick={() => handleApprove(recruiter.id)}
                      >
                        + Add to System
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {recruiters.length === 0 && (
              <tr>
                <td colSpan="6" style={{textAlign: 'center', padding: '40px', color: '#9CA3AF'}}>
                  No employer signups found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AppRegisteredRecruiters;