import { useState, useEffect } from 'react'
import { adminFetch } from '../../services/adminApi'  // ✅ NEW: attaches the admin's Supabase token to every call
import { supabase } from '../../lib/supabase' // Ensure this path correctly points to your supabase client

function RecruitersManager({ user }) {
  // ✅ NEW: this page is now independent of Plans & Pricing (moved to its
  // own PlansPricingManager.jsx / its own sidebar page) — no more internal
  // tab switcher here, this component is "Manage Recruiters" only.
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState(null)

  const [newRecruiter, setNewRecruiter] = useState({
    target_table: 'recruiters',
    email: '',
    name: '',
    company: '',
    industry: 'Technology',
    location: 'Remote'
  })

  const [deleteData, setDeleteData] = useState({
    target_table: 'recruiters',
    email: '',
    reason_type: '',
    custom_reason: ''
  })

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      console.log('🔄 Fetching recruiter stats from:', `${API_URL}/api/admin/recruiters/stats`)
      const res = await adminFetch(`${API_URL}/api/admin/recruiters/stats`)
      
      if (res.ok) {
        const data = await res.json()
        console.log('📊 Raw stats data received:', data)
        
        const normalizedStats = {
          paid_count: data.paid_count || data.paid_recruiters_count || 0,
          freemium_count: data.freemium_count || data.freemium_recruiters_count || 0,
          total_count: data.total_count || 
                      (data.paid_count + data.freemium_count) ||
                      (data.paid_recruiters_count + data.freemium_recruiters_count) || 0
        }
        
        console.log('✅ Normalized stats:', normalizedStats)
        setStats(normalizedStats)
      } else {
        console.error('❌ Stats fetch failed:', res.status, res.statusText)
        setStats({ paid_count: 0, freemium_count: 0, total_count: 0 })
      }
    } catch (e) { 
      console.error('❌ Error fetching stats:', e)
      setStats({ paid_count: 0, freemium_count: 0, total_count: 0 })
    }
  }

  const handleAddRecruiter = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}/api/admin/recruiters/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecruiter)
      })
      
      if (res.ok) {
        alert('✅ Recruiter added successfully!')
        setNewRecruiter({ ...newRecruiter, email: '', name: '', company: '' })
        fetchStats()
      } else {
        const err = await res.json()
        alert('❌ Error: ' + err.error)
      }
    } catch (e) {
      alert('Error adding recruiter')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRecruiter = async (e) => {
    e.preventDefault()
    
    const finalReason = deleteData.reason_type === 'others' 
      ? deleteData.custom_reason 
      : deleteData.reason_type;

    if (!finalReason) {
      alert("Please select or type a reason for deletion.");
      return;
    }

    // ✅ FIXED: Fetch current admin email from props or session
    let adminEmail = user?.email;
    
    if (!adminEmail) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      adminEmail = authUser?.email || 'unknown_admin';
    }
    
    console.log('🔍 Admin performing deletion:', adminEmail);

    const confirmDelete = window.confirm(
      `⚠️ PERMANENT DELETE: Are you sure you want to remove ${deleteData.email}?\n\nReason: ${finalReason}\nDeleted by: ${adminEmail}`
    );
    if (!confirmDelete) return;

    setLoading(true)
    try {
      const res = await adminFetch(`${API_URL}/api/admin/recruiters/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_table: deleteData.target_table,
          email: deleteData.email,
          reason: finalReason,
          admin_email: adminEmail
        })
      })
      
      const result = await res.json()
      if (res.ok) {
        alert(`✅ SUCCESS: ${deleteData.email} has been removed and logged.\n\nDeleted by: ${adminEmail}`)
        setDeleteData({ target_table: 'recruiters', email: '', reason_type: '', custom_reason: '' })
        fetchStats()
      } else {
        alert('❌ Error: ' + result.error)
      }
    } catch (e) {
      alert('Error deleting recruiter')
      console.error('Delete error:', e)
    } finally {
      setLoading(false)
    }
  }

  const redButtonStyle = {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.3)',
    transition: 'transform 0.2s',
  }

  return (
    <div style={{padding: '0'}}>
      {/* ✅ ADDED: SYSTEM MAINTENANCE NOTE */}
          <div style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '30px',
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            color: '#1e40af',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
          }}>
            <span style={{ fontSize: '24px' }}>ℹ️</span>
            <p style={{ margin: 0, fontSize: '15px', lineHeight: '1.6', fontWeight: '500' }}>
              <strong>System Note:</strong> Please make sure to update the plans and pricing limits whenever a recruiter is added or deleted in the Manage Recruiter section to maintain accurate system settings.
            </p>
          </div>

          <div className="stats-grid" style={{ marginBottom: '30px' }}>
            <div className="stat-card" style={{background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)', border: '2px solid #DC2626'}}>
              <h3 style={{color: '#991B1B', display: 'flex', alignItems: 'center', gap: '8px'}}>
                 PAID RECRUITERS
              </h3>
              <div className="stat-value" style={{ color: '#DC2626', fontSize: '48px', fontWeight: 'bold' }}>
                {stats?.paid_count !== undefined ? stats.paid_count : '•••'}
              </div>
              <p style={{color: '#7f1d1d', fontSize: '14px', marginTop: '8px'}}>
                Live count from <code>recruiters</code> table
              </p>
            </div>

            <div className="stat-card" style={{background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)', border: '2px solid #059669'}}>
              <h3 style={{color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px'}}>
                 FREE USERS
              </h3>
              <div className="stat-value" style={{ color: '#059669', fontSize: '48px', fontWeight: 'bold' }}>
                {stats?.freemium_count !== undefined ? stats.freemium_count : '•••'}
              </div>
              <p style={{color: '#064e3b', fontSize: '14px', marginTop: '8px'}}>
                Live count from <code>freemium_recruiters</code> table
              </p>
            </div>

            <div className="stat-card" style={{background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', border: '2px solid #2563EB'}}>
              <h3 style={{color: '#1e40af', display: 'center', alignItems: 'center', gap: '8px'}}>
                 TOTAL RECRUITERS
              </h3>
              <div className="stat-value" style={{ color: '#2563EB', fontSize: '48px', fontWeight: 'bold' }}>
                {stats?.total_count !== undefined ? stats.total_count : '•••'}
              </div>
              <p style={{color: '#1e3a8a', fontSize: '14px', marginTop: '8px'}}>
                Combined count from both tables
              </p>
            </div>
          </div>

          <div className="dashboard-section" style={{marginBottom: '30px', background: '#F0FDF4', padding: '20px', borderRadius: '10px', border: '2px dashed #059669'}}>
            <h2 style={{fontSize: '20px', marginBottom: '20px', color: '#047857'}}> Add New Recruiter</h2>
            <form onSubmit={handleAddRecruiter} style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
              <div className="form-group">
                <label>Select Target Database</label>
                <select value={newRecruiter.target_table} onChange={(e) => setNewRecruiter({...newRecruiter, target_table: e.target.value})} style={{padding: '10px', borderRadius: '8px', border: '1px solid #10b981', width: '100%', marginTop: '5px'}}>
                  <option value="recruiters">Paid Users DB (recruiters table)</option>
                  <option value="freemium_recruiters">Free Users DB (freemium_recruiters table)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Location</label>
                <input type="text" value={newRecruiter.location} onChange={(e) => setNewRecruiter({...newRecruiter, location: e.target.value})} style={{width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '5px'}}/>
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input required type="text" value={newRecruiter.name} onChange={(e) => setNewRecruiter({...newRecruiter, name: e.target.value})} style={{width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '5px'}}/>
              </div>
              <div className="form-group">
                <label>Email</label>
                <input required type="email" value={newRecruiter.email} onChange={(e) => setNewRecruiter({...newRecruiter, email: e.target.value})} style={{width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '5px'}}/>
              </div>
              <div className="form-group">
                <label>Company</label>
                <input required type="text" value={newRecruiter.company} onChange={(e) => setNewRecruiter({...newRecruiter, company: e.target.value})} style={{width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '5px'}}/>
              </div>
              <div className="form-group">
                <label>Industry</label>
                <input type="text" value={newRecruiter.industry} onChange={(e) => setNewRecruiter({...newRecruiter, industry: e.target.value})} style={{width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '5px'}}/>
              </div>
              <div style={{gridColumn: '1 / -1'}}>
                <button type="submit" disabled={loading} style={redButtonStyle}>Add Recruiter to Database</button>
              </div>
            </form>
          </div>

          <div className="dashboard-section" style={{marginTop: '30px', background: '#FFF5F5', padding: '20px', borderRadius: '10px', border: '2px dashed #DC2626'}}>
            <h2 style={{fontSize: '20px', marginBottom: '20px', color: '#B91C1C'}}> Delete Recruiter from Database</h2>
            <form onSubmit={handleDeleteRecruiter} style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
              
              <div className="form-group">
                <label>Select Target Database</label>
                <select value={deleteData.target_table} onChange={(e) => setDeleteData({...deleteData, target_table: e.target.value})} style={{padding: '10px', borderRadius: '8px', border: '1px solid #DC2626', width: '100%', marginTop: '5px'}}>
                  <option value="recruiters">Paid Users DB (recruiters table)</option>
                  <option value="freemium_recruiters">Free Users DB (freemium_recruiters table)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Email Address to Delete</label>
                <input required type="email" placeholder="example@company.com" value={deleteData.email} onChange={(e) => setDeleteData({...deleteData, email: e.target.value})} style={{width: '100%', padding: '10px', border: '1px solid #DC2626', borderRadius: '8px', marginTop: '5px'}}/>
              </div>

              <div className="form-group" style={{gridColumn: '1 / -1'}}>
                <label>Reason for Deletion</label>
                <select 
                    required
                    value={deleteData.reason_type} 
                    onChange={(e) => setDeleteData({...deleteData, reason_type: e.target.value})} 
                    style={{padding: '10px', borderRadius: '8px', border: '1px solid #DC2626', width: '100%', marginTop: '5px'}}
                >
                  <option value="">-- Click to select a reason --</option>
                  <option value="Non -Compliance">Non -Compliance</option>
                  <option value="Misuse of the application">Misuse of the application</option>
                  <option value="Minimal Activity">Minimal Activity</option>
                  <option value="Violation of Policy">Violation of Policy</option>
                  <option value="others">others</option>
                </select>
              </div>

              {deleteData.reason_type === 'others' && (
                <div className="form-group" style={{gridColumn: '1 / -1'}}>
                    <label>Please specify the reason</label>
                    <textarea 
                        required
                        placeholder="Type the reason here..."
                        value={deleteData.custom_reason}
                        onChange={(e) => setDeleteData({...deleteData, custom_reason: e.target.value})}
                        style={{width: '100%', padding: '10px', border: '1px solid #DC2626', borderRadius: '8px', marginTop: '5px', minHeight: '80px', fontFamily: 'inherit'}}
                    />
                </div>
              )}

              <div style={{gridColumn: '1 / -1'}}>
                <button type="submit" disabled={loading || !deleteData.email || !deleteData.reason_type} style={{...redButtonStyle, width: '100%', background: '#B91C1C'}}>
                   Confirm and Delete Email
                </button>
              </div>
            </form>
          </div>
    </div>
  )
}

export default RecruitersManager