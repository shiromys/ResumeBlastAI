import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase' // Ensure this path correctly points to your supabase client

function RecruitersManager({ user }) {
  const [activeTab, setActiveTab] = useState('recruiters') 
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState(null)
  const [plans, setPlans] = useState([])
  
  const [showPlanDisclaimer, setShowPlanDisclaimer] = useState(false)
  const [pendingPlanUpdate, setPendingPlanUpdate] = useState(null)
  
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
    fetchPlans()
  }, [])

  useEffect(() => {
    if (activeTab === 'recruiters') {
      fetchStats()
    }
  }, [activeTab])

  const fetchStats = async () => {
    try {
      console.log('🔄 Fetching recruiter stats from:', `${API_URL}/api/admin/recruiters/stats`)
      const res = await fetch(`${API_URL}/api/admin/recruiters/stats`)
      
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

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/plans`)
      if (res.ok) {
        const data = await res.json()
        const planOrder = ['freemium', 'basic', 'pro'];
        const sortedPlans = (data.plans || []).sort((a, b) => {
          return planOrder.indexOf(a.key_name) - planOrder.indexOf(b.key_name);
        });
        setPlans(sortedPlans)
      }
    } catch (e) { console.error(e) }
  }

  const handleAddRecruiter = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/recruiters/add`, {
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
      const res = await fetch(`${API_URL}/api/admin/recruiters/delete`, {
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

  const initiatePlanUpdate = (planId) => {
    const originalPlan = plans.find(p => p.id === planId)
    
    if (!originalPlan) {
      alert('⚠️ Error: Could not find plan data')
      return
    }

    const nameInput = document.getElementById(`name-${planId}`).value.trim()
    const priceInput = document.getElementById(`price-${planId}`).value
    const limitInput = document.getElementById(`limit-${planId}`).value

    const originalName = originalPlan.display_name
    const originalPrice = (originalPlan.price_cents / 100).toFixed(2)
    const originalLimit = originalPlan.recruiter_limit.toString()

    const nameChanged = nameInput !== originalName
    const priceChanged = priceInput !== originalPrice
    const limitChanged = limitInput !== originalLimit

    const hasChanges = nameChanged || priceChanged || limitChanged

    if (!hasChanges) {
      alert('ℹ️ No changes detected. The plan values remain the same.')
      return
    }

    let changesSummary = '📝 Changes detected:\n\n'
    if (nameChanged) changesSummary += `• Display Name: "${originalName}" → "${nameInput}"\n`
    if (priceChanged) changesSummary += `• Price: $${originalPrice} → $${priceInput}\n`
    if (limitChanged) changesSummary += `• Limit: ${originalLimit} → ${limitInput} recruiters\n`

    console.log(changesSummary)

    setPendingPlanUpdate({
        id: planId,
        name: nameInput,
        price: priceInput,
        limit: limitInput,
        changesSummary: changesSummary,
        // ✅ Store original values for reset on cancel
        originalName: originalName,
        originalPrice: originalPrice,
        originalLimit: originalLimit
    });
    setShowPlanDisclaimer(true);
  }

  const handleCancelDisclaimer = () => {
    if (pendingPlanUpdate) {
      const { id, originalName, originalPrice, originalLimit } = pendingPlanUpdate
      
      document.getElementById(`name-${id}`).value = originalName
      document.getElementById(`price-${id}`).value = originalPrice
      document.getElementById(`limit-${id}`).value = originalLimit
      
      console.log('🔄 Reset plan inputs to original values')
    }
    
    setShowPlanDisclaimer(false)
    setPendingPlanUpdate(null)
  }

  const handleUpdatePlan = async () => {
    const { id, name, price, limit } = pendingPlanUpdate;
    const priceInCents = Math.round(parseFloat(price) * 100);
    if (isNaN(priceInCents)) {
        alert("Please enter a valid price");
        setShowPlanDisclaimer(false);
        return;
    }
    setLoading(true);
    setShowPlanDisclaimer(false);
    try {
      const res = await fetch(`${API_URL}/api/admin/plans/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, display_name: name, price_cents: priceInCents, recruiter_limit: parseInt(limit)})
      })
      
      if (res.ok) {
        alert('✅ Plan updated successfully! Changes are now live.')
        fetchPlans()
      } else {
        const err = await res.json()
        alert('❌ Error: ' + err.error)
      }
    } catch (e) {
      alert('Error updating plan')
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
      <div style={{marginBottom: '30px'}}>
        <div style={{display: 'flex', gap: '15px', borderBottom: '2px solid #e5e7eb'}}>
          <button onClick={() => setActiveTab('recruiters')} style={{padding: '12px 24px', border: 'none', background: activeTab === 'recruiters' ? '#DC2626' : 'transparent', color: activeTab === 'recruiters' ? 'white' : '#6b7280', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px 8px 0 0'}}>
             Manage Recruiters
          </button>
          <button onClick={() => setActiveTab('plans')} style={{padding: '12px 24px', border: 'none', background: activeTab === 'plans' ? '#DC2626' : 'transparent', color: activeTab === 'plans' ? 'white' : '#6b7280', fontWeight: 'bold', cursor: 'pointer', borderRadius: '8px 8px 0 0'}}>
             Manage Plans & Pricing
          </button>
        </div>
      </div>

      {activeTab === 'recruiters' && (
        <>
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
        </>
      )}

      {activeTab === 'plans' && (
        <div>
          <div className="stats-grid" style={{ marginBottom: '30px' }}>
            {plans.map(plan => (
              <div key={`stat-${plan.id}`} className="stat-card">
                <h3 style={{ textTransform: 'capitalize' }}>{plan.key_name} Blast Limit</h3>
                <div className="stat-value" style={{ color: '#DC2626' }}>{plan.recruiter_limit}</div>
                <p> limit for {plan.display_name}</p>
              </div>
            ))}
          </div>
          <h2> Edit Pricing & Limits</h2>
          <div style={{display: 'grid', gap: '20px'}}>
            {plans.map(plan => (
              <div key={plan.id} className="stat-card" style={{borderLeft: '4px solid #DC2626'}}>
                <h3 style={{fontSize: '18px', color: '#DC2626', textTransform: 'uppercase'}}>{plan.key_name} PLAN</h3>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px'}}>
                  <div><label>Display Name</label><input type="text" defaultValue={plan.display_name} id={`name-${plan.id}`} style={{width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #d1d5db'}} /></div>
                  <div><label>Price ($)</label><input type="number" step="0.01" defaultValue={(plan.price_cents / 100).toFixed(2)} id={`price-${plan.id}`} style={{width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #d1d5db'}} /></div>
                  <div><label>Recruiter Limit</label><input type="number" defaultValue={plan.recruiter_limit} id={`limit-${plan.id}`} style={{width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #d1d5db'}} /></div>
                </div>
                <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '10px'}}>
                  <button style={redButtonStyle} onClick={() => initiatePlanUpdate(plan.id)}>Update Plan</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showPlanDisclaimer && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'}}>
            <div style={{background: 'white', borderRadius: '16px', maxWidth: '600px', width: '100%', padding: '30px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'}}>
                <h2 style={{color: '#DC2626', margin: '0 0 20px 0', fontSize: '24px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                   ⚠️ Critical System Update Warning
                </h2>
                
                <div style={{background: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: '12px', padding: '20px', marginBottom: '25px'}}>
                    {pendingPlanUpdate?.changesSummary && (
                      <div style={{background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: '8px', padding: '15px', marginBottom: '20px'}}>
                        <p style={{color: '#9A3412', fontWeight: '700', marginBottom: '10px', fontSize: '15px', whiteSpace: 'pre-line'}}>
                          {pendingPlanUpdate.changesSummary}
                        </p>
                      </div>
                    )}
                    
                    <p style={{color: '#991B1B', fontWeight: '700', marginBottom: '15px', fontSize: '16px'}}>
                        You are about to modify the core pricing and distribution logic for the {pendingPlanUpdate?.name?.toUpperCase()}.
                    </p>
                    <p style={{color: '#374151', fontSize: '14px', marginBottom: '10px'}}>By proceeding, you acknowledge that:</p>
                    <ul style={{color: '#B91C1C', fontSize: '14px', paddingLeft: '20px', lineHeight: '1.6'}}>
                        <li style={{marginBottom: '8px'}}><strong>Global Impact:</strong> These changes will take effect immediately across the entire application, including the Landing Page pricing cards, the User Workbench, and Stripe Checkout sessions.</li>
                        <li style={{marginBottom: '8px'}}><strong>Financial Logic:</strong> Updates to the "Price" field will directly change the amount charged to users in real-time via the Stripe integration.</li>
                        <li style={{marginBottom: '8px'}}><strong>Distribution Logic:</strong> Modifying the "Recruiter Limit" will immediately change the number of emails sent during a resume blast for all future users of this plan.</li>
                    </ul>
                    <p style={{color: '#374151', fontSize: '14px', marginTop: '15px', fontWeight: '600'}}>Please verify all numbers carefully. Are you sure you want to apply these changes application-wide?</p>
                </div>

                <div style={{display: 'flex', gap: '12px', justifyContent: 'flex-end'}}>
                    <button 
                        onClick={handleCancelDisclaimer}
                        style={{padding: '12px 24px', borderRadius: '8px', border: '1px solid #E5E7EB', cursor: 'pointer', background: 'white', fontWeight: '600'}}
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleUpdatePlan} 
                        style={{
                            ...redButtonStyle, 
                            padding: '12px 30px', 
                            background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
                            fontSize: '15px',
                            fontWeight: 'bold'
                        }}
                    >
                        I Agree & Update Globally
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}

export default RecruitersManager