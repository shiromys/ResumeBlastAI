import { useState, useEffect } from 'react'

function RecruitersManager() {
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

  // ✅ NEW: State for Deleting Recruiter
  const [deleteData, setDeleteData] = useState({
    target_table: 'recruiters',
    email: ''
  })

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  useEffect(() => {
    fetchStats()
    fetchPlans()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/recruiters/stats`)
      if (res.ok) setStats(await res.json())
    } catch (e) { console.error(e) }
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

  // ✅ NEW: Handler for Deleting Recruiter
  const handleDeleteRecruiter = async (e) => {
    e.preventDefault()
    
    const confirmDelete = window.confirm(
      `⚠️ PERMANENT DELETE: Are you sure you want to remove ${deleteData.email} from the ${deleteData.target_table} table?`
    );
    if (!confirmDelete) return;

    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/admin/recruiters/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deleteData)
      })
      
      const result = await res.json()
      if (res.ok) {
        alert(`✅ SUCCESS: ${deleteData.email} has been removed.`)
        setDeleteData({ ...deleteData, email: '' })
        fetchStats() 
      } else {
        alert('❌ Error: ' + result.error)
      }
    } catch (e) {
      alert('Error deleting recruiter')
    } finally {
      setLoading(false)
    }
  }

  const initiatePlanUpdate = (planId) => {
    const nameInput = document.getElementById(`name-${planId}`).value;
    const priceInput = document.getElementById(`price-${planId}`).value;
    const limitInput = document.getElementById(`limit-${planId}`).value;

    setPendingPlanUpdate({
        id: planId,
        name: nameInput,
        price: priceInput,
        limit: limitInput
    });
    setShowPlanDisclaimer(true);
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
        alert('✅ SUCCESS: Plan updated globally.');
        await fetchPlans(); 
      } else {
        alert('❌ Update failed.')
      }
    } catch (e) {
      console.error(e)
      alert('Error updating plan')
    } finally {
        setLoading(false);
        setPendingPlanUpdate(null);
    }
  }

  const redButtonStyle = {
    background: '#DC2626',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'background 0.2s',
    marginRight: '10px'
  };

  const activeRedStyle = {
    ...redButtonStyle,
    background: '#B91C1C', 
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
  };

  return (
    <div>
      <div style={{display: 'flex', gap: '15px', marginBottom: '25px'}}>
        <button onClick={() => setActiveTab('recruiters')} style={activeTab === 'recruiters' ? activeRedStyle : redButtonStyle}>Manage Recruiters</button>
        <button onClick={() => setActiveTab('plans')} style={activeTab === 'plans' ? activeRedStyle : redButtonStyle}>Manage Plans</button>
      </div>

      {activeTab === 'recruiters' && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Paid Database (Recruiters Table)</h3>
              <div className="stat-value">{stats?.paid_recruiters_count || 0}</div>
              <p>Available for Basic/Pro</p>
            </div>
            <div className="stat-card">
              <h3>Free Database (Freemium Table)</h3>
              <div className="stat-value">{stats?.freemium_recruiters_count || 0}</div>
              <p>Available for Free Blast</p>
            </div>
          </div>

          {/* ADD RECRUITER SECTION */}
          <div className="dashboard-section" style={{marginTop: '30px', background: 'white', padding: '20px', borderRadius: '10px', border: '1px solid #e5e7eb'}}>
            <h2 style={{fontSize: '20px', marginBottom: '20px'}}> Add New Recruiter</h2>
            <form onSubmit={handleAddRecruiter} style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
              <div className="form-group" style={{gridColumn: '1 / -1'}}>
                <label>Target Database</label>
                <select value={newRecruiter.target_table} onChange={(e) => setNewRecruiter({...newRecruiter, target_table: e.target.value})} style={{padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', width: '100%', marginTop: '5px'}}>
                  <option value="recruiters">Paid Users DB (recruiters table)</option>
                  <option value="freemium_recruiters">Free Users DB (freemium_recruiters table)</option>
                </select>
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

          {/* ✅ NEW: DELETE RECRUITER SECTION */}
          <div className="dashboard-section" style={{marginTop: '30px', background: '#FFF5F5', padding: '20px', borderRadius: '10px', border: '2px dashed #DC2626'}}>
            <h2 style={{fontSize: '20px', marginBottom: '20px', color: '#B91C1C'}}> Delete Recruiter from Database</h2>
            <form onSubmit={handleDeleteRecruiter} style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'end'}}>
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
              <div style={{gridColumn: '1 / -1'}}>
                <button type="submit" disabled={loading || !deleteData.email} style={{...redButtonStyle, width: '100%', background: '#B91C1C'}}>
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
                <p>Live limit for {plan.display_name}</p>
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
                        onClick={() => setShowPlanDisclaimer(false)} 
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