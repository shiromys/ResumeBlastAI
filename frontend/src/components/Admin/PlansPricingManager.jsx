import { useState, useEffect } from 'react'
import { adminFetch } from '../../services/adminApi'  // ✅ NEW: attaches the admin's Supabase token to every call

// ✅ NEW: split out of RecruitersManager.jsx so "Recruiters" and
// "Plans & Pricing" are two independent admin pages instead of two tabs
// inside one page. This file is just the "Manage Plans & Pricing" half of
// what used to live in RecruitersManager.jsx — same state, same handlers,
// same JSX, same API calls — moved here unchanged so behavior is identical.
function PlansPricingManager() {
  const [loading, setLoading] = useState(false)
  const [plans, setPlans] = useState([])

  const [showPlanDisclaimer, setShowPlanDisclaimer] = useState(false)
  const [pendingPlanUpdate, setPendingPlanUpdate] = useState(null)

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    try {
      const res = await adminFetch(`${API_URL}/api/admin/plans`)
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
      const res = await adminFetch(`${API_URL}/api/admin/plans/update`, {
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

export default PlansPricingManager