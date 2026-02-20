import { useState, useEffect } from 'react'
import ContactSubmissions from './ContactSubmissions'
import RecruitersManager from './RecruitersManager' // ✅ NEW IMPORT
import './AdminStyles.css'

function AdminDashboard({ user, onExit }) {
  const [activeTab, setActiveTab] = useState('monitoring')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    monitoring: null,
    users: null,
    stripe: null,
    health: null,
    support: null,
    serverStatus: null,
    brevoStats: null // ✅ NEW KEY
  })
  const [error, setError] = useState(null)
  
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  // NEW: Unread ticket count
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!user) {
      if (onExit) onExit()
      return
    }
    
    // Support and Recruiters manage their own loading state internally
    if (activeTab !== 'support' && activeTab !== 'recruiters') {
      fetchData(activeTab)
    } else {
      setLoading(false)
    }
  }, [activeTab, user])

  // NEW: Poll for unread count
  useEffect(() => {
    if (user) {
      fetchUnreadCount()
      // Poll every 30 seconds
      const interval = setInterval(fetchUnreadCount, 30000)
      return () => clearInterval(interval)
    }
  }, [user])

  // NEW: Fetch unread count
  const fetchUnreadCount = async () => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    try {
      const response = await fetch(`${API_URL}/api/admin/contact-submissions/unread-count`)
      if (response.ok) {
        const data = await response.json()
        setUnreadCount(data.unread_count || 0)
      }
    } catch (error) {
      console.error('Error fetching unread count:', error)
    }
  }

  const fetchData = async (tab, customStartDate = null, customEndDate = null) => {
    setLoading(true)
    setError(null)
    
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    
    try {
      let endpoint = ''
      let dataKey = tab
      
      if (tab === 'monitoring') {
        endpoint = '/api/admin/stats'
        const serverStatusRes = await fetch(`${API_URL}/api/admin/server-status`)
        if (serverStatusRes.ok) {
          const serverData = await serverStatusRes.json()
          setData(prev => ({ ...prev, serverStatus: serverData }))
        }
      }
      if (tab === 'users') endpoint = '/api/admin/users'
      if (tab === 'stripe') {
        endpoint = '/api/admin/revenue'
        if (customStartDate && customEndDate) {
          endpoint += `?start_date=${customStartDate}&date=${customEndDate}`
        }
      }
      if (tab === 'health') endpoint = '/api/admin/health'
      
      // ✅ NEW: Brevo stats endpoint mapping
      if (tab === 'brevo') {
        endpoint = '/api/admin/brevo-stats'
        dataKey = 'brevoStats'
      }

      if (endpoint) {
        console.log(`📡 Fetching: ${API_URL}${endpoint}`)
        
        const res = await fetch(`${API_URL}${endpoint}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        const json = await res.json()
        console.log(`✅ ${tab} data:`, json)
        
        setData(prev => ({
          ...prev,
          [dataKey]: json
        }))
      }
    } catch (e) {
      console.error(`❌ Error fetching ${tab}:`, e)
      setError(`Failed to load ${tab} data`)
    } finally {
      setLoading(false)
    }
  }

  const handleDateRangeSubmit = (e) => {
    e.preventDefault()
    if (startDate && endDate) {
      fetchData('stripe', startDate, endDate)
    } else {
      alert('Please select both start and end dates')
    }
  }

  const handleDeleteUser = async (userEmail, userId) => {
    const confirmed = window.confirm(
      `⚠️ WARNING: Are you absolutely sure you want to delete user "${userEmail}"?\n\n` +
      `This action will:\n` +
      `• Delete all user data (resumes, blasts, payments, activity)\n` +
      `• Remove from authentication system\n` +
      `• Prevent future signup/login\n\n` +
      `This action CANNOT be undone!`
    )
    
    if (!confirmed) return
    
    const finalConfirm = window.confirm(
      `FINAL CONFIRMATION: Delete ${userEmail}?\n\nType YES in your mind and click OK to proceed.`
    )
    
    if (!finalConfirm) return
    
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    
    try {
      console.log(`🗑️ Deleting user: ${userEmail}`)
      
      const response = await fetch(`${API_URL}/api/admin/users/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          user_id: userId,
          admin_email: user?.email || 'admin',
          reason: 'Admin deletion via dashboard'
        })
      })
      
      const result = await response.json()
      
      if (result.success || response.status === 207) {
        const details = result.details || {}
        const steps = details.steps_completed || []
        const tables = details.tables_deleted || []

        alert(`✅ User "${userEmail}" has been successfully deleted!\n\nDetails:\n` +
              `• Auth Deleted: ${steps.includes('auth_deletion') ? 'Yes' : 'No/Already Gone'}\n` +
              `• Blacklisted: ${steps.includes('blacklist') ? 'Yes' : 'Failed'}\n` +
              `• Database: Cleared ${tables.length} tables\n` + 
              `• Status: ${details.reason || 'Completed'}`)
        
        fetchData('users')
      } else {
        alert(`❌ Error deleting user:\n${result.error || 'Unknown error'}`)
      }
      
    } catch (error) {
      console.error('Delete error:', error)
      alert(`❌ Failed to delete user:\n${error.message}`)
    }
  }

  return (
    <div className="admin-container">
      <div className="admin-sidebar">
        <div className="sidebar-header">
          <h3> Admin Panel</h3>
          <p style={{fontSize: '12px', color: '#9ca3af', marginTop: '8px'}}>
            {user?.email || 'Admin'}
          </p>
        </div>
        
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'monitoring' ? 'active' : ''}`}
            onClick={() => setActiveTab('monitoring')}
          >
             Monitoring
          </button>
          
          <button
            className={`nav-item ${activeTab === 'recruiters' ? 'active' : ''}`}
            onClick={() => setActiveTab('recruiters')}
          >
             Recruiters & Plans
          </button>

          {/* ✅ Emails tab — badge shows when 70%+ credits used */}
          <button
            className={`nav-item ${activeTab === 'brevo' ? 'active' : ''}`}
            onClick={() => setActiveTab('brevo')}
            style={{ position: 'relative' }}
          >
             Emails (Credits)
            {data.brevoStats?.plan_details?.trigger_alert && (
              <span className="support-unread-badge" style={{ background: '#F59E0B', fontSize: '13px', minWidth: '26px' }}>
                ⚠️
              </span>
            )}
          </button>

          <button
            className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
             Users
          </button>
          <button
            className={`nav-item ${activeTab === 'stripe' ? 'active' : ''}`}
            onClick={() => setActiveTab('stripe')}
          >
             Revenue Analytics
          </button>
          <button
            className={`nav-item ${activeTab === 'health' ? 'active' : ''}`}
            onClick={() => setActiveTab('health')}
          >
             System Health
          </button>
          
          <button
            className={`nav-item ${activeTab === 'support' ? 'active' : ''}`}
            onClick={() => setActiveTab('support')}
            style={{ position: 'relative' }}
          >
             Support
            {unreadCount > 0 && (
              <span className="support-unread-badge">
                {unreadCount}
              </span>
            )}
          </button>
        </nav>
        
        <div className="sidebar-footer">
          <button className="nav-item" onClick={onExit}>
             Exit Dashboard
          </button>
        </div>
      </div>

      <div className="admin-content">
        {error && (
          <div className="error-banner">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px' }}>
            <div className="spinner"></div>
          </div>
        ) : (
          <>
            {activeTab === 'monitoring' && data.monitoring && (
              <div>
                <h2> System Overview</h2>
                <div className="stats-grid">
                  <div className="stat-card">
                    <h3>Total Users</h3>
                    <div className="stat-value">{data.monitoring.total_users || 0}</div>
                    <p>{data.monitoring.active_users || 0} active</p>
                  </div>
                  
                  <div className="stat-card">
                    <h3>Total Blasts</h3>
                    <div className="stat-value">{data.monitoring.total_blasts || 0}</div>
                    <p>Resume distributions</p>
                  </div>
                  
                  <div className="stat-card">
                    <h3>Resume Uploads</h3>
                    <div className="stat-value">{data.monitoring.total_resume_uploads || 0}</div>
                    <p>Total files</p>
                  </div>
                  
                  <div className="stat-card">
                    <h3>Total Revenue</h3>
                    <div className="stat-value" style={{ color: '#059669' }}>
                      ${data.monitoring.total_revenue || 0}
                    </div>
                    <p>All-time earnings</p>
                  </div>
                </div>

                {data.serverStatus && (
                  <div style={{ marginTop: '40px' }}>
                    <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px', color: '#111827' }}>
                       Server Status
                    </h3>
                    <div className="stats-grid">
                      <div className="stat-card">
                        <h3>Uptime</h3>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#059669' }}>
                          {data.serverStatus.uptime || 'Running'}
                        </div>
                      </div>
                      
                      {data.serverStatus.services && (
                        <>
                          <div className="stat-card">
                            <h3>Database</h3>
                            <div style={{ fontSize: '18px', fontWeight: '600', color: '#059669' }}>
                              {data.serverStatus.services.Database?.status || 'Unknown'}
                            </div>
                            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                              {data.serverStatus.services.Database?.latency || 'N/A'}
                            </p>
                          </div>
                          
                          <div className="stat-card">
                            <h3>API Server</h3>
                            <div style={{ fontSize: '18px', fontWeight: '600', color: '#059669' }}>
                              {data.serverStatus.services.Server?.status || 'Unknown'}
                            </div>
                          </div>
                        </>
                      )}
                      
                      {data.serverStatus.configuration && (
                        <div className="stat-card">
                          <h3>Configuration</h3>
                          <div style={{ fontSize: '13px', marginTop: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ color: '#6b7280' }}>Stripe:</span>
                              <span style={{ fontWeight: '600', color: data.serverStatus.configuration.Stripe === 'Set' ? '#059669' : '#DC2626' }}>
                                {data.serverStatus.configuration.Stripe || 'Missing'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span style={{ color: '#6b7280' }}>Supabase:</span>
                              <span style={{ fontWeight: '600', color: data.serverStatus.configuration.Supabase === 'Set' ? '#059669' : '#DC2626' }}>
                                {data.serverStatus.configuration.Supabase || 'Missing'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#6b7280' }}>Anthropic:</span>
                              <span style={{ fontWeight: '600', color: data.serverStatus.configuration.Anthropic === 'Set' ? '#059669' : '#DC2626' }}>
                                {data.serverStatus.configuration.Anthropic || 'Missing'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ✅ EMAILS SECTION — 100% real-time data from Brevo API */}
            {activeTab === 'brevo' && data.brevoStats && data.brevoStats.success && (
              <div>
                <h2> Email Plan & Credits</h2>

                {/* ── 70% Alert Banner ─────────────────────────────────────── */}
                {data.brevoStats.plan_details.trigger_alert && (
                  <div style={{
                    backgroundColor: '#fffbeb',
                    border: '2px solid #fbbf24',
                    borderLeft: '6px solid #d97706',
                    color: '#92400e',
                    padding: '18px 22px',
                    borderRadius: '12px',
                    marginBottom: '28px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '14px',
                    boxShadow: '0 4px 14px rgba(251,191,36,0.2)'
                  }}>
                    <span style={{ fontSize: '26px', lineHeight: '1', flexShrink: 0 }}>⚠️</span>
                    <div>
                      <strong style={{ display: 'block', fontSize: '16px', marginBottom: '5px' }}>
                        Email Credits Usage Alert — Action Required
                      </strong>
                      <span style={{ fontSize: '14px', lineHeight: '1.6' }}>
                        <strong>{data.brevoStats.plan_details.usage_percent}%</strong> of your {data.brevoStats.plan_details.usage_label} has been consumed
                        ({data.brevoStats.plan_details.credits_used.toLocaleString()} used
                        out of {data.brevoStats.plan_details.total_limit.toLocaleString()} total).
                        Please top up your Brevo plan to prevent email service interruption.
                      </span>
                    </div>
                  </div>
                )}

                {/* ── Account info strip + Refresh ─────────────────────────── */}
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px 22px',
                  marginBottom: '28px',
                  display: 'flex',
                  gap: '36px',
                  flexWrap: 'wrap',
                  alignItems: 'center'
                }}>
                  {[
                    { label: 'Account Holder', value: data.brevoStats.account_holder },
                    { label: 'Account Email',  value: data.brevoStats.account_email  },
                    { label: 'Company',         value: data.brevoStats.company        },
                    { label: 'Data Fetched At', value: data.brevoStats.fetched_at     }
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '3px' }}>{value || 'N/A'}</div>
                    </div>
                  ))}
                  <div style={{ marginLeft: 'auto' }}>
                    <button onClick={() => fetchData('brevo')} className="btn-primary" style={{ padding: '9px 22px', fontSize: '13px' }}>
                       Refresh
                    </button>
                  </div>
                </div>

                {/* ── Stat cards ───────────────────────────────────────────── */}
                <div className="stats-grid">

                  {/* Card 1 — Plan */}
                  <div className="stat-card">
                    <h3>Active Plan</h3>
                    <div className="stat-value" style={{ fontSize: '26px', textTransform: 'capitalize' }}>
                      {data.brevoStats.plan_details.type.replace('payAsYouGo', 'Pay As You Go')}
                    </div>
                    <p style={{ marginTop: '10px', fontSize: '13px' }}>
                       Purchased:{' '}
                      {data.brevoStats.plan_details.purchase_date && data.brevoStats.plan_details.purchase_date !== 'N/A'
                        ? new Date(data.brevoStats.plan_details.purchase_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                        : 'N/A'}
                    </p>
                    {data.brevoStats.plan_details.plan_end_date !== 'N/A' && (
                      <p style={{ marginTop: '5px', fontSize: '13px' }}>
                         Renews:{' '}
                        {new Date(data.brevoStats.plan_details.plan_end_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {/* Card 2 — Credits remaining */}
                  <div className="stat-card">
                    <h3>Credits Remaining</h3>
                    <div className="stat-value" style={{ color: data.brevoStats.plan_details.trigger_alert ? '#DC2626' : '#059669' }}>
                      {data.brevoStats.plan_details.credits_remaining.toLocaleString()}
                    </div>
                    <p style={{ marginTop: '10px', fontSize: '13px' }}>
                      out of <strong>{data.brevoStats.plan_details.total_limit.toLocaleString()}</strong> total
                    </p>
                    <p style={{ marginTop: '5px', fontSize: '13px' }}>
                      <strong>{data.brevoStats.plan_details.credits_used.toLocaleString()}</strong> used this cycle
                    </p>
                  </div>

                  {/* Card 3 — Usage % with progress bar */}
                  <div className="stat-card">
                    <h3>Usage — {data.brevoStats.plan_details.usage_label}</h3>
                    <div className="stat-value" style={{
                      color: data.brevoStats.plan_details.usage_percent >= 70 ? '#DC2626'
                           : data.brevoStats.plan_details.usage_percent >= 50 ? '#D97706'
                           : '#059669'
                    }}>
                      {data.brevoStats.plan_details.usage_percent}%
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginTop: '14px', background: '#e5e7eb', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(data.brevoStats.plan_details.usage_percent, 100)}%`,
                        height: '100%',
                        borderRadius: '6px',
                        background: data.brevoStats.plan_details.usage_percent >= 70 ? '#DC2626'
                                  : data.brevoStats.plan_details.usage_percent >= 50 ? '#F59E0B'
                                  : '#10B981',
                        transition: 'width 0.6s ease'
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '11px', color: '#9ca3af' }}>
                      <span>0%</span>
                      <span style={{ color: '#F59E0B', fontWeight: 700 }}>⚠️ 70%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  {/* Card 4 — Today's sent */}
                  <div className="stat-card">
                    <h3>Today's Emails Sent</h3>
                    <div className="stat-value" style={{ color: '#1d4ed8' }}>
                      {data.brevoStats.plan_details.daily_sent.toLocaleString()}
                    </div>
                    <p style={{ marginTop: '10px', fontSize: '13px' }}>
                      emails sent today
                    </p>
                    {data.brevoStats.plan_details.type === 'free' && (
                      <p style={{ marginTop: '5px', fontSize: '13px', color: '#059669', fontWeight: 600 }}>
                        {Math.max(0, 300 - data.brevoStats.plan_details.daily_sent).toLocaleString()} left today (free cap: 300)
                      </p>
                    )}
                    <p style={{ marginTop: '5px', fontSize: '13px', color: '#6b7280' }}>
                      {data.brevoStats.plan_details.monthly_sent.toLocaleString()} sent this month
                    </p>
                  </div>
                </div>

                {/* ── Plan Features ─────────────────────────────────────────── */}
                <div className="stat-card" style={{ marginTop: '4px' }}>
                  <h3 style={{ marginBottom: '16px' }}>Plan Features</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {data.brevoStats.plan_details.features.map((feature, i) => (
                      <span key={i} style={{
                        background: '#f0fdf4',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontSize: '13px',
                        color: '#166534',
                        border: '1px solid #bbf7d0',
                        fontWeight: 600
                      }}>
                        ✅ {feature}
                      </span>
                    ))}
                  </div>
                </div>

                {/* ── Detailed credit summary table ─────────────────────────── */}
                <div className="stat-card" style={{ padding: '0', overflow: 'hidden', marginTop: '24px' }}>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}> Credit Usage Summary</h3>
                  </div>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Value (Live)</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Plan Type</td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {data.brevoStats.plan_details.type.replace('payAsYouGo', 'Pay As You Go')}
                        </td>
                        <td><span className="badge-success">Active</span></td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Total Sending Limit</td>
                        <td>{data.brevoStats.plan_details.total_limit.toLocaleString()}</td>
                        <td><span className="badge-success">Allocated</span></td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Credits Used (This Cycle)</td>
                        <td>{data.brevoStats.plan_details.credits_used.toLocaleString()}</td>
                        <td>
                          <span className={data.brevoStats.plan_details.usage_percent >= 70 ? 'badge-warning' : 'badge-success'}>
                            {data.brevoStats.plan_details.usage_percent}%
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Credits Remaining</td>
                        <td style={{ fontWeight: 700, color: data.brevoStats.plan_details.trigger_alert ? '#DC2626' : '#059669' }}>
                          {data.brevoStats.plan_details.credits_remaining.toLocaleString()}
                        </td>
                        <td>
                          <span className={data.brevoStats.plan_details.trigger_alert ? 'badge-warning' : 'badge-success'}>
                            {data.brevoStats.plan_details.trigger_alert ? 'Low — Top Up!' : 'Healthy'}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Emails Sent Today</td>
                        <td>{data.brevoStats.plan_details.daily_sent.toLocaleString()}</td>
                        <td><span className="badge-success">Today</span></td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Emails Sent This Month</td>
                        <td>{data.brevoStats.plan_details.monthly_sent.toLocaleString()}</td>
                        <td><span className="badge-success">Month-to-date</span></td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 600 }}>Plan Purchase / Start Date</td>
                        <td>
                          {data.brevoStats.plan_details.purchase_date && data.brevoStats.plan_details.purchase_date !== 'N/A'
                            ? new Date(data.brevoStats.plan_details.purchase_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                            : 'N/A'}
                        </td>
                        <td><span className="badge-success">Confirmed</span></td>
                      </tr>
                      {data.brevoStats.plan_details.plan_end_date !== 'N/A' && (
                        <tr>
                          <td style={{ fontWeight: 600 }}>Renewal Date</td>
                          <td>
                            {new Date(data.brevoStats.plan_details.plan_end_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </td>
                          <td><span className="badge-success">Upcoming</span></td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ fontWeight: 600 }}>Last Refreshed</td>
                        <td style={{ fontSize: '13px', color: '#6b7280' }}>{data.brevoStats.fetched_at}</td>
                        <td><span className="badge-success">Live</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Brevo tab: API error state */}
            {activeTab === 'brevo' && data.brevoStats && !data.brevoStats.success && (
              <div>
                <h2> Email Plan & Credits</h2>
                <div className="error-banner">
                  ⚠️ {data.brevoStats.error || 'Unable to load Brevo data. Ensure BREVO_API_KEY is set correctly in your .env file.'}
                </div>
              </div>
            )}

            {activeTab === 'recruiters' && (
              <RecruitersManager user={user} />
            )}

            {activeTab === 'users' && data.users && (
              <div>
                <h2> User Management</h2>
                <div className="stat-card" style={{ marginBottom: '20px' }}>
                  <h3>Total Users</h3>
                  <div className="stat-value">{data.users.count || 0}</div>
                </div>
                
                <div className="stat-card" style={{ padding: '0', overflow: 'hidden' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.users.users && data.users.users.length > 0 ? (
                        data.users.users.map((user) => (
                          <tr key={user.id}>
                            <td style={{ fontWeight: '600' }}>{user.email}</td>
                            <td>{user.full_name || 'N/A'}</td>
                            <td>
                              <span className={user.account_status === 'active' ? 'badge-success' : 'badge-warning'}>
                                {user.account_status || 'Unknown'}
                              </span>
                            </td>
                            <td>{new Date(user.created_at).toLocaleDateString()}</td>
                            <td>
                              <button
                                onClick={() => handleDeleteUser(user.email, user.id)}
                                style={{
                                  padding: '6px 12px',
                                  background: '#DC2626',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  transition: 'background 0.2s'
                                }}
                                onMouseOver={(e) => e.target.style.background = '#B91C1C'}
                                onMouseOut={(e) => e.target.style.background = '#DC2626'}
                              >
                                 Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
                            No users found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'stripe' && (
              <div>
                <h2> Revenue Analytics</h2>
                <div className="date-range-section">
                  <h3> Custom Date Range</h3>
                  <form onSubmit={handleDateRangeSubmit} className="date-range-form">
                    <div className="form-group">
                      <label htmlFor="start-date">Start Date</label>
                      <input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        max={endDate || new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="end-date">End Date</label>
                      <input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate}
                        max={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label style={{ opacity: 0 }}>Submit</label>
                      <button type="submit" className="btn-primary">
                        Apply Filter
                      </button>
                    </div>
                    
                    {(startDate || endDate) && (
                      <div className="form-group">
                        <label style={{ opacity: 0 }}>Clear</label>
                        <button
                          type="button"
                          onClick={() => {
                            setStartDate('')
                            setEndDate('')
                            fetchData('stripe')
                          }}
                          className="btn-secondary"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </form>
                </div>

                {data.stripe && (
                  <div>
                    <div className="stats-grid">
                      <div className="stat-card">
                        <h3>Today's Revenue</h3>
                        <div className="stat-value" style={{ color: '#059669' }}>
                          ${data.stripe.today_revenue || 0}
                        </div>
                        <p style={{ marginTop: '10px', color: '#6b7280', fontSize: '14px' }}>
                          {data.stripe.today_transactions || 0} transactions
                        </p>
                      </div>
                      
                      <div className="stat-card">
                        <h3>Last 7 Days</h3>
                        <div className="stat-value" style={{ color: '#059669' }}>
                          ${data.stripe.last_7_days_revenue || 0}
                        </div>
                        <p style={{ marginTop: '10px', color: '#6b7280', fontSize: '14px' }}>
                          Rolling 7-day total
                        </p>
                      </div>
                      
                      <div className="stat-card">
                        <h3>{startDate && endDate ? 'Selected Period Revenue' : 'All-Time Revenue'}</h3>
                        <div className="stat-value" style={{ color: '#059669' }}>
                          ${data.stripe.total_revenue || 0}
                        </div>
                        <p style={{ marginTop: '10px', color: '#6b7280', fontSize: '14px' }}>
                          {data.stripe.transactions || 0} total transactions
                        </p>
                      </div>
                    </div>

                    {data.stripe.daily_breakdown && data.stripe.daily_breakdown.length > 0 && (
                      <div className="stat-card" style={{ padding: '0', overflow: 'hidden', marginTop: '20px' }}>
                        <div style={{padding: '20px', borderBottom: '1px solid #e5e7eb'}}>
                          <h3 style={{margin: 0}}>📈 Daily Revenue Breakdown (Last 7 Days)</h3>
                        </div>
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Revenue</th>
                              <th>Transactions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.stripe.daily_breakdown.map((day, index) => (
                              <tr key={index}>
                                <td>{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</td>
                                <td style={{fontWeight: 'bold', color: day.revenue > 0 ? '#059669' : '#6b7280'}}>
                                  ${day.revenue.toFixed(2)}
                                </td>
                                <td>{day.transactions}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {data.stripe.failed_payments && (
                      <div className="stat-card" style={{ padding: '0', overflow: 'hidden', marginTop: '20px' }}>
                        <div style={{padding: '20px', borderBottom: '1px solid #e5e7eb', background: '#fee2e2'}}>
                          <h3 style={{margin: 0, color: '#991b1b'}}>❌ Failed Payments</h3>
                          <p style={{margin: '5px 0 0 0', fontSize: '14px', color: '#7f1d1d'}}>
                            Total: {data.stripe.failed_payments.count} failures | Amount: ${data.stripe.failed_payments.amount}
                          </p>
                        </div>
                        {data.stripe.failed_payments.count > 0 ? (
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Email</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Payment ID</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.stripe.failed_payments.payments.map((payment, index) => (
                                <tr key={index}>
                                  <td>{payment.user_email || 'N/A'}</td>
                                  <td style={{fontWeight: 'bold', color: '#DC2626'}}>
                                    ${(payment.amount / 100).toFixed(2)}
                                  </td>
                                  <td>
                                    <span style={{
                                      padding: '4px 8px',
                                      background: '#fee2e2',
                                      color: '#991b1b',
                                      borderRadius: '4px',
                                      fontSize: '12px',
                                      fontWeight: '600'
                                    }}>
                                      {payment.status}
                                    </span>
                                  </td>
                                  <td>{new Date(payment.created_at).toLocaleDateString()}</td>
                                  <td style={{fontSize: '12px', color: '#6b7280'}}>
                                    {payment.stripe_payment_intent_id?.slice(0, 20) || payment.id?.slice(0, 8) || 'N/A'}...
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{padding: '30px', textAlign: 'center', color: '#6b7280'}}>
                            ✅ No failed payments found
                          </div>
                        )}
                      </div>
                    )}

                    {data.stripe.refunded_payments && (
                      <div className="stat-card" style={{ padding: '0', overflow: 'hidden', marginTop: '20px' }}>
                        <div style={{padding: '20px', borderBottom: '1px solid #e5e7eb', background: '#fef3c7'}}>
                          <h3 style={{margin: 0, color: '#92400e'}}>💸 Refunded Payments</h3>
                          <p style={{margin: '5px 0 0 0', fontSize: '14px', color: '#78350f'}}>
                            Total: {data.stripe.refunded_payments.count} refunds | Amount: ${data.stripe.refunded_payments.amount}
                          </p>
                        </div>
                        {data.stripe.refunded_payments.count > 0 ? (
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Email</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Payment ID</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.stripe.refunded_payments.payments.map((payment, index) => (
                                <tr key={index}>
                                  <td>{payment.user_email || 'N/A'}</td>
                                  <td style={{fontWeight: 'bold', color: '#D97706'}}>
                                    ${(payment.amount / 100).toFixed(2)}
                                  </td>
                                  <td>
                                    <span style={{
                                      padding: '4px 8px',
                                      background: '#fef3c7',
                                      color: '#92400e',
                                      borderRadius: '4px',
                                      fontSize: '12px',
                                      fontWeight: '600'
                                    }}>
                                      {payment.status}
                                    </span>
                                  </td>
                                  <td>{new Date(payment.created_at).toLocaleDateString()}</td>
                                  <td style={{fontSize: '12px', color: '#6b7280'}}>
                                    {payment.stripe_payment_intent_id?.slice(0, 20) || payment.id?.slice(0, 8) || 'N/A'}...
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{padding: '30px', textAlign: 'center', color: '#6b7280'}}>
                            ✅ No refunded payments found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'health' && data.health && (
              <div>
                <h2> System Health</h2>
                <div className="stats-grid">
                  {Object.entries(data.health).map(([key, status]) => (
                    <div key={key} className="stat-card">
                      <h3>{key}</h3>
                      <div style={{
                        color: status === 'Healthy' || status === 'Configured' || status === 'Online' ? '#059669' : '#DC2626',
                        fontWeight: 'bold',
                        fontSize: '20px'
                      }}>
                        {status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'support' && (
              <ContactSubmissions 
                onTicketUpdate={fetchUnreadCount}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default AdminDashboard