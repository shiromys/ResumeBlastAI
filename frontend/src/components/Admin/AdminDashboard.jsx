import { useState, useEffect } from 'react'
import ContactSubmissions from './ContactSubmissions'
import RecruitersManager from './RecruitersManager' 
import './AdminStyles.css'
import AppRegisteredRecruiters from './AppRegisteredRecruiters';

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
    brevoStats: null 
  })
  const [error, setError] = useState(null)
  
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  const [unreadCount, setUnreadCount] = useState(0)
  
  // ✅ NEW: State for pending employer signups
  const [pendingSignupsCount, setPendingSignupsCount] = useState(0)

  // Drip Campaign States
  const [dripEmail, setDripEmail] = useState('')
  const [dripUserId, setDripUserId] = useState('')
  const [dripData, setDripData] = useState(null)
  const [dripLoading, setDripLoading] = useState(false)
  const [dripError, setDripError] = useState(null)
  const [pollingActive, setPollingActive] = useState(false)

  // ✅ NEW: BREVO LOGS STATES
  const [brevoLogs, setBrevoLogs] = useState([])
  const [brevoSummary, setBrevoSummary] = useState(null)
  const [brevoLogsLoading, setBrevoLogsLoading] = useState(false)
  const [brevoLogsError, setBrevoLogsError] = useState(null)
  const [brevoFilters, setBrevoFilters] = useState({
    event_type: '',
    email_to: '',
    start_date: '',
    end_date: '',
    limit: 100,
    offset: 0
  })
  const [brevoPagination, setBrevoPagination] = useState({
    total: 0,
    limit: 100,
    offset: 0
  })

  // ✅ FIXED: Real-time Polling for Drip Campaigns with proper cleanup
  useEffect(() => {
    let interval;
    if (activeTab === 'drip' && (dripEmail || dripUserId) && dripData) {
      setPollingActive(true);
      interval = setInterval(() => {
        handleSearchDrip(); 
      }, 30000); // 30 second refresh
    } else {
      setPollingActive(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, dripEmail, dripUserId, dripData]);

  // ✅ NEW: Auto-fetch Brevo logs when tab is active
  useEffect(() => {
    if (activeTab === 'brevo-logs') {
      fetchBrevoLogs();
      const interval = setInterval(fetchBrevoLogs, 30000);
      return () => clearInterval(interval);
    }
  }, [activeTab, brevoFilters]);

  useEffect(() => {
    if (!user) {
      if (onExit) onExit()
      return
    }
    
    if (activeTab !== 'support' && activeTab !== 'recruiters' && activeTab !== 'drip' && activeTab !== 'brevo-logs' && activeTab !== 'app-registered') {
      fetchData(activeTab)
    } else {
      setLoading(false)
    }
  }, [activeTab, user])

  useEffect(() => {
    if (user) {
      fetchUnreadCount()
      const interval = setInterval(fetchUnreadCount, 30000)
      return () => clearInterval(interval)
    }
  }, [user])

  const fetchUnreadCount = async () => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    try {
      // 1. Fetch support tickets count
      const response = await fetch(`${API_URL}/api/admin/contact-submissions/unread-count`)
      if (response.ok) {
        const data = await response.json()
        setUnreadCount(data.unread_count || 0)
      }

      // 2. ✅ NEW: Fetch pending signups count
      const signupsResponse = await fetch(`${API_URL}/api/admin/app-registered-recruiters/pending-count`)
      if (signupsResponse.ok) {
        const signupsData = await signupsResponse.json()
        setPendingSignupsCount(signupsData.pending_count || 0)
      }
    } catch (error) {
      console.error('Error fetching counts:', error)
    }
  }

  // ✅ NEW: Fetch Brevo event logs
  const fetchBrevoLogs = async () => {
    setBrevoLogsLoading(true)
    setBrevoLogsError(null)
    
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    
    try {
      const queryParams = new URLSearchParams()
      queryParams.append('limit', brevoFilters.limit.toString())
      queryParams.append('offset', brevoFilters.offset.toString())
      
      if (brevoFilters.event_type) {
        queryParams.append('event_type', brevoFilters.event_type)
      }
      if (brevoFilters.email_to) {
        queryParams.append('email_to', brevoFilters.email_to)
      }
      if (brevoFilters.start_date) {
        queryParams.append('start_date', brevoFilters.start_date)
      }
      if (brevoFilters.end_date) {
        queryParams.append('end_date', brevoFilters.end_date)
      }

      console.log(`📡 Fetching Brevo Logs: ${API_URL}/api/admin/brevo-logs?${queryParams.toString()}`)

      const response = await fetch(`${API_URL}/api/admin/brevo-logs?${queryParams.toString()}`)
      
      if (response.ok) {
        const resData = await response.json()
        console.log(`✅ brevo-logs data received:`, resData)
        if (resData.success) {
          setBrevoLogs(resData.logs || [])
          setBrevoPagination({
            total: resData.total || 0,
            limit: resData.limit || 100,
            offset: resData.offset || 0
          })
        }
      } else {
        setBrevoLogsError('Failed to fetch Brevo logs')
      }
    } catch (error) {
      console.error('Error fetching Brevo logs:', error)
      setBrevoLogsError(error.message)
    } finally {
      setBrevoLogsLoading(false)
    }
  }

  // ✅ NEW: Fetch Brevo summary
  const fetchBrevoSummary = async () => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    
    try {
      const queryParams = new URLSearchParams()
      queryParams.append('days', '7')
      
      if (brevoFilters.email_to) {
        queryParams.append('email_to', brevoFilters.email_to)
      }

      const response = await fetch(`${API_URL}/api/admin/brevo-logs/summary?${queryParams.toString()}`)
      
      if (response.ok) {
        const resData = await response.json()
        if (resData.success) {
          setBrevoSummary(resData.summary)
        }
      }
    } catch (error) {
      console.error('Error fetching Brevo summary:', error)
    }
  }

  // ✅ NEW: Update filter and refetch
  const handleBrevoFilterChange = (field, value) => {
    setBrevoFilters(prev => ({
      ...prev,
      [field]: value,
      offset: 0
    }))
  }

  // ✅ NEW: Pagination handlers
  const handleBrevoNextPage = () => {
    setBrevoFilters(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }))
  }

  const handleBrevoPrevPage = () => {
    setBrevoFilters(prev => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit)
    }))
  }

  // ✅ NEW: Export to CSV
  const exportBrevoLogsToCSV = () => {
    if (brevoLogs.length === 0) {
      alert('No logs to export')
      return
    }

    const headers = ['Date', 'Event Type', 'From', 'To', 'Subject']
    const rows = brevoLogs.map(log => [
      new Date(log.timestamp).toLocaleString(),
      log.event_type,
      log.email_from,
      log.email_to,
      log.email_subject
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `brevo-logs-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  // ✅ FIXED: Proper data fetching with real-time revenue analytics
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
        // ✅ FIXED: Properly append query parameters for date filtering
        if (customStartDate && customEndDate) {
          endpoint += `?start_date=${customStartDate}&end_date=${customEndDate}`
        }
      }
      if (tab === 'health') endpoint = '/api/admin/health'
      
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
        console.log(`✅ ${tab} data received:`, json)
        
        // ✅ FIXED: Verify data before setting state
        if (json && (json.success !== false || json.error === undefined)) {
          setData(prev => ({
            ...prev,
            [dataKey]: json
          }))
        } else {
          throw new Error(json.error || `Failed to fetch ${tab}`)
        }
      }
    } catch (e) {
      console.error(`❌ Error fetching ${tab}:`, e)
      setError(`Failed to load ${tab} data: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  // ✅ FIXED: Proper drip campaign search with real-time status
  const handleSearchDrip = async (e) => {
    if (e) e.preventDefault();
    
    const email = dripEmail.trim();
    const userId = dripUserId.trim();
    
    if (!email && !userId) {
      setDripError('Please enter either an email or user ID');
      setDripData(null);
      return;
    }
    
    setDripLoading(true);
    setDripError(null);
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    try {
      // ✅ FIXED: Build URL with proper encoding for special characters
      let url = `${API_URL}/api/admin/drip-stats?`;
      let params = [];
      
      if (userId) params.push(`user_id=${encodeURIComponent(userId)}`);
      if (email) params.push(`email=${encodeURIComponent(email)}`);
      
      if (params.length > 0) url += params.join('&');
      
      console.log(`🔍 Searching drip campaign with URL: ${url}`);
      
      const response = await fetch(url);
      const result = await response.json();
      
      console.log(`📊 Drip search result:`, result);
      
      if (response.ok && result.success && result.data) {
        setDripData(result.data);
        setDripError(null);
        console.log(`✅ Campaign found: ${result.data.id}`);
      } else {
        const errorMsg = result.message || result.error || 'Campaign not found';
        setDripError(errorMsg);
        setDripData(null);
        console.log(`❌ Drip search failed: ${errorMsg}`);
      }
    } catch (err) {
      console.error('❌ Drip stats error:', err);
      setDripError(`Failed to fetch drip stats: ${err.message}`);
      setDripData(null);
    } finally {
      setDripLoading(false);
    }
  };

  // ✅ FIXED: Handle date range submission for revenue analytics
  const handleDateRangeSubmit = (e) => {
    e.preventDefault()
    if (startDate && endDate) {
      console.log(` Applying date filter: ${startDate} to ${endDate}`)
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
      console.log(` Deleting user: ${userEmail}`)
      
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

  // ✅ FIXED: Force Wave with proper campaign ID and immediate UI refresh
  const forceWave = async (wave) => {
    const campaignId = dripData?.id; 
    if (!campaignId) {
      alert("❌ No active campaign selected. Please search for a campaign first.");
      return;
    }

    const waveName = wave === 2 ? 'Day 4 Follow-up' : 'Day 8 Reminder'
    if (!window.confirm(`⚠️ Override Warning:\n\nAre you sure you want to force start the ${waveName} (Wave ${wave})?\n\nThis will:\n• Bypass daily sending limits\n• Skip prerequisite checks\n• Trigger immediate scheduler execution\n\nCampaign ID: ${campaignId}`)) {
      return;
    }

    setDripLoading(true)
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      console.log(`Forcing Wave ${wave} for campaign ${campaignId}`)
      
      const res = await fetch(`${API_URL}/api/admin/drip-campaign/force-wave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, wave })
      })
      const result = await res.json()
      
      if (!res.ok) {
        console.error(`❌ Force wave failed:`, result)
        throw new Error(result.error || 'Failed to force wave')
      }
      
      console.log(`✅ Wave ${wave} forced successfully:`, result)
      alert(`✅ ${result.message}\n\nThe scheduler will process this shortly.`)
      
      // ✅ FIXED: Refresh data immediately after forcing wave
      setTimeout(() => {
        handleSearchDrip()
      }, 2000)
      
    } catch (err) {
      console.error(`Error forcing wave:`, err)
      alert(`❌ Error: ${err.message}`)
    } finally {
      setDripLoading(false)
    }
  }

  return (
    <div className="admin-container">
      <div className="admin-sidebar">
        <div className="sidebar-header">
          <h3>Admin Panel</h3>
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
            className={`nav-item ${activeTab === 'drip' ? 'active' : ''}`}
            onClick={() => setActiveTab('drip')}
          >
            Drip Campaigns
          </button>

          {/* ✅ NEW: Brevo Logs Tab Button */}
          <button
            className={`nav-item ${activeTab === 'brevo-logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('brevo-logs')}
          >
            Brevo Logs
          </button>
          
          <button
            className={`nav-item ${activeTab === 'recruiters' ? 'active' : ''}`}
            onClick={() => setActiveTab('recruiters')}
          >
            Recruiters & Plans
          </button>

          {/* ✅ NEW: Employer Signups Tab with Badge */}
          <button 
            className={`nav-item ${activeTab === 'app-registered' ? 'active' : ''}`} 
            onClick={() => setActiveTab('app-registered')}
            style={{ position: 'relative' }}
          >
            Employer Signups
            {pendingSignupsCount > 0 && (
              <span className="support-unread-badge">
                {pendingSignupsCount}
              </span>
            )}
          </button>

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
            {/* ✅ NEW: BREVO LOGS TAB */}
            {activeTab === 'brevo-logs' && (
              <div>
                <h2>📧 Brevo Email Event Logs</h2>
                <p style={{ color: '#6b7280', marginBottom: '20px' }}>Real-time logs of all email events from Brevo webhooks</p>

                {/* Filters Section */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '15px', 
                  marginBottom: '25px',
                  padding: '15px',
                  background: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0'
                }}>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#555' }}>Event Type</label>
                    <select 
                      value={brevoFilters.event_type}
                      onChange={(e) => handleBrevoFilterChange('event_type', e.target.value)}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '5px' }}
                    >
                      <option value="">All Events</option>
                      <option value="delivered">Delivered</option>
                      <option value="opened">Opened</option>
                      <option value="click">Clicked</option>
                      <option value="hard_bounce">Hard Bounce</option>
                      <option value="soft_bounce">Soft Bounce</option>
                      <option value="blocked">Blocked</option>
                      <option value="spam">Spam</option>
                      <option value="unsubscribed">Unsubscribed</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#555' }}>Recipient Email</label>
                    <input 
                      type="text"
                      placeholder="Filter by email..."
                      value={brevoFilters.email_to}
                      onChange={(e) => handleBrevoFilterChange('email_to', e.target.value)}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '5px' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#555' }}>Start Date</label>
                    <input 
                      type="date"
                      value={brevoFilters.start_date}
                      onChange={(e) => handleBrevoFilterChange('start_date', e.target.value)}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '5px' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#555' }}>End Date</label>
                    <input 
                      type="date"
                      value={brevoFilters.end_date}
                      onChange={(e) => handleBrevoFilterChange('end_date', e.target.value)}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '5px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button 
                      onClick={exportBrevoLogsToCSV}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '13px',
                        textTransform: 'uppercase'
                      }}
                    >
                      📥 Export CSV
                    </button>
                  </div>
                </div>

                {/* Error Banner */}
                {brevoLogsError && <p style={{ color: '#dc2626', padding: '15px', background: '#fee2e2', borderRadius: '4px', marginBottom: '15px' }}>⚠️ {brevoLogsError}</p>}

                {/* Loading State */}
                {brevoLogsLoading && <p style={{ color: '#666', marginBottom: '15px' }}>Loading events...</p>}

                {/* Logs Table */}
                {!brevoLogsLoading && brevoLogs.length > 0 && (
                  <div style={{ marginBottom: '25px' }}>
                    <div style={{ background: 'white', borderRadius: '6px', border: '1px solid #e0e0e0', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                          <tr>
                            <th style={{ padding: '15px', textAlign: 'left', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase' }}>Date & Time</th>
                            <th style={{ padding: '15px', textAlign: 'left', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase' }}>Event Type</th>
                            <th style={{ padding: '15px', textAlign: 'left', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase' }}>From</th>
                            <th style={{ padding: '15px', textAlign: 'left', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase' }}>To</th>
                            <th style={{ padding: '15px', textAlign: 'left', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase' }}>Subject</th>
                          </tr>
                        </thead>
                        <tbody>
                          {brevoLogs.map((log) => (
                            <tr key={log.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '12px 15px', fontSize: '13px', color: '#555' }}>{new Date(log.timestamp).toLocaleString()}</td>
                              <td style={{ padding: '12px 15px', fontSize: '13px' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 10px',
                                  borderRadius: '20px',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  textTransform: 'uppercase',
                                  backgroundColor: log.event_type === 'delivered' ? '#c8e6c9' : log.event_type === 'opened' ? '#bbdefb' : log.event_type === 'click' ? '#ffe0b2' : '#ffcdd2',
                                  color: log.event_type === 'delivered' ? '#2e7d32' : log.event_type === 'opened' ? '#1565c0' : log.event_type === 'click' ? '#e65100' : '#c62828'
                                }}>
                                  {log.event_type}
                                </span>
                              </td>
                              <td style={{ padding: '12px 15px', fontSize: '13px', color: '#555' }}>{log.email_from}</td>
                              <td style={{ padding: '12px 15px', fontSize: '13px', color: '#555' }}>{log.email_to}</td>
                              <td style={{ padding: '12px 15px', fontSize: '13px', color: '#555' }}>{log.email_subject}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', padding: '20px', background: 'white', borderTop: '1px solid #e0e0e0', marginTop: '0' }}>
                      <button 
                        onClick={handleBrevoPrevPage}
                        disabled={brevoFilters.offset === 0}
                        style={{
                          padding: '10px 15px',
                          background: brevoFilters.offset === 0 ? '#ccc' : '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: brevoFilters.offset === 0 ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '13px',
                          opacity: brevoFilters.offset === 0 ? 0.6 : 1
                        }}
                      >
                        ← Previous
                      </button>
                      <span style={{ fontSize: '14px', color: '#555', fontWeight: '500' }}>
                        Page {Math.floor(brevoPagination.offset / brevoPagination.limit) + 1} 
                        (Showing {brevoLogs.length} of {brevoPagination.total} total)
                      </span>
                      <button 
                        onClick={handleBrevoNextPage}
                        disabled={brevoFilters.offset + brevoFilters.limit >= brevoPagination.total}
                        style={{
                          padding: '10px 15px',
                          background: brevoFilters.offset + brevoFilters.limit >= brevoPagination.total ? '#ccc' : '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: brevoFilters.offset + brevoFilters.limit >= brevoPagination.total ? 'not-allowed' : 'pointer',
                          fontWeight: '600',
                          fontSize: '13px',
                          opacity: brevoFilters.offset + brevoFilters.limit >= brevoPagination.total ? 0.6 : 1
                        }}
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {!brevoLogsLoading && brevoLogs.length === 0 && (
                  <p style={{ padding: '50px', textAlign: 'center', color: '#999', background: 'white', borderRadius: '6px', border: '1px solid #e0e0e0' }}>📭 No events found. Check your filters.</p>
                )}
              </div>
            )}

            {activeTab === 'drip' && (
              <div>
                <h2>Drip Campaign Management</h2>
                
                <div className="date-range-section">
                  <h3>🔍 Lookup User Campaign</h3>
                  <form onSubmit={handleSearchDrip} className="date-range-form" style={{ alignItems: 'end' }}>
                    <div className="form-group" style={{ width: '300px' }}>
                      <label htmlFor="drip-user-id">User ID (or Campaign ID)</label>
                      <input
                        id="drip-user-id"
                        type="text"
                        placeholder="ccfe7980-f90a-4044-9e8d-ee5e300e75dc"
                        value={dripUserId}
                        onChange={(e) => setDripUserId(e.target.value)}
                        style={{ padding: '10px 14px', border: '2px solid #E2E8F0', borderRadius: '10px' }}
                      />
                    </div>
                    <div className="form-group" style={{ width: '300px' }}>
                      <label htmlFor="drip-email">User Email</label>
                      <input
                        id="drip-email"
                        type="email"
                        placeholder="candidate@example.com"
                        value={dripEmail}
                        onChange={(e) => setDripEmail(e.target.value)}
                        style={{ padding: '10px 14px', border: '2px solid #E2E8F0', borderRadius: '10px' }}
                      />
                    </div>
                    <div className="form-group">
                      <button type="submit" className="btn-primary" disabled={dripLoading}>
                        {dripLoading ? 'Fetching...' : 'Check Blast Status'}
                      </button>
                    </div>
                  </form>
                </div>

                {dripError && (
                  <div className="error-banner">
                    ⚠️ {dripError}
                  </div>
                )}

                {dripData && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h3>Campaign Info: <span style={{color: '#DC2626'}}>{dripData.status?.toUpperCase()}</span></h3>
                      <span style={{ fontSize: '12px', color: dripLoading ? '#DC2626' : '#059669', fontWeight: 600 }}>
                        {pollingActive ? '🟢 Polling active: Updates every 30s' : '⚪ No active polling'}
                      </span>
                    </div>

                    <div className="stats-grid">
                      <div className="stat-card" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                        <h3>Total Progress</h3>
                        <div className="stat-value">{dripData.total_sent} / {dripData.total_recipients}</div>
                        <p>Total Emails Sent</p>
                      </div>

                      <div className="stat-card" style={{ borderLeft: '4px solid #3B82F6' }}>
                        <h3>Wave 1 (Day 1)</h3>
                        <div className="stat-value" style={{ color: '#3B82F6' }}>{dripData.wave1_sent}</div>
                        <p>Initial Blast</p>
                      </div>

                      <div className="stat-card" style={{ borderLeft: '4px solid #10B981' }}>
                        <h3>Wave 2 (Day 4)</h3>
                        <div className="stat-value" style={{ color: '#10B981' }}>{dripData.wave2_sent}</div>
                        <p>Follow-up emails</p>
                      </div>

                      <div className="stat-card" style={{ borderLeft: '4px solid #F59E0B' }}>
                        <h3>Wave 3 (Day 8)</h3>
                        <div className="stat-value" style={{ color: '#F59E0B' }}>{dripData.wave3_sent}</div>
                        <p>Final reminders</p>
                      </div>
                    </div>

                    <div className="stat-card" style={{ marginBottom: '32px' }}>
                      <h3>Manual Overrides</h3>
                      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
                        Force the scheduler to skip completion requirements and start next waves immediately.
                      </p>
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <button 
                          className="btn-primary" 
                          onClick={() => forceWave(2)} 
                          disabled={dripData.wave2_sent > 0 || dripLoading}
                          style={{ background: dripData.wave2_sent > 0 ? '#94A3B8' : '#DC2626', boxShadow: 'none', opacity: (dripData.wave2_sent > 0 || dripLoading) ? 0.6 : 1 }}
                        >
                          {dripLoading ? '⏳ Processing...' : dripData.wave2_sent > 0 ? '✓ Wave 2 In Progress' : '🚀 Force Start Wave 2'}
                        </button>
                        <button 
                          className="btn-primary" 
                          onClick={() => forceWave(3)} 
                          disabled={dripData.wave3_sent > 0 || dripLoading}
                          style={{ background: dripData.wave3_sent > 0 ? '#94A3B8' : '#DC2626', boxShadow: 'none', opacity: (dripData.wave3_sent > 0 || dripLoading) ? 0.6 : 1 }}
                        >
                          {dripLoading ? '⏳ Processing...' : dripData.wave3_sent > 0 ? '✓ Wave 3 In Progress' : '🚀 Force Start Wave 3'}
                        </button>
                      </div>
                    </div>

                    <div className="stat-card">
                      <h3>📜 Campaign Metadata</h3>
                      <div style={{ marginTop: '10px', fontSize: '14px', lineHeight: '2' }}>
                        {/* ✅ EXPLICITLY SET STRONG TAGS TO BLACK SO THEY DON'T TURN WHITE */}
                        <p><strong style={{ color: '#000000' }}>User ID:</strong> <code style={{background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '12px'}}>{dripData.user_id}</code></p>
                        <p><strong style={{ color: '#000000' }}>Campaign ID:</strong> <code style={{background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '12px'}}>{dripData.id}</code></p>
                        <p><strong style={{ color: '#000000' }}>User Email:</strong> {dripData.user_email}</p>
                        <p><strong style={{ color: '#000000' }}>Resume URL:</strong> <a href={dripData.resume_url} target="_blank" rel="noreferrer" style={{color: '#DC2626', textDecoration: 'underline'}}>View Blasted File</a></p>
                        <p><strong style={{ color: '#000000' }}>Plan Name:</strong> <span style={{textTransform: 'capitalize'}}>{dripData.plan_name}</span></p>
                        <p><strong style={{ color: '#000000' }}>Started At:</strong> {new Date(dripData.created_at).toLocaleString()}</p>
                        <p><strong style={{ color: '#000000' }}>Last Batch Activity:</strong> {dripData.last_activity ? new Date(dripData.last_activity).toLocaleString() : 'Processing Initial Wave...'}</p>
                        <p><strong style={{ color: '#000000' }}>Data Refreshed:</strong> {dripData.fetched_at ? new Date(dripData.fetched_at).toLocaleTimeString() : 'Just now'}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'monitoring' && data.monitoring && (
              <div>
                <h2>System Overview</h2>
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

            {/* ✅ RESTORED DETAILED EMAIL PLAN & CREDITS SECTION */}
            {activeTab === 'brevo' && data.brevoStats && data.brevoStats.success && (
              <div>
                <h2>Email Plan & Credits</h2>

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
                      <strong style={{ display: 'block', fontSize: '16px', marginBottom: '5px', color: '#000000' }}>
                        Email Credits Usage Alert — Action Required
                      </strong>
                      <span style={{ fontSize: '14px', lineHeight: '1.6' }}>
                        <strong style={{ color: '#000000' }}>{data.brevoStats.plan_details.usage_percent}%</strong> of your {data.brevoStats.plan_details.usage_label} has been consumed
                        ({data.brevoStats.plan_details.credits_used.toLocaleString()} used
                        out of <strong style={{ color: '#000000' }}>{data.brevoStats.plan_details.total_limit.toLocaleString()}</strong> total).
                        Please top up your Brevo plan to prevent email service interruption.
                      </span>
                    </div>
                  </div>
                )}

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
                    { label: 'Company',         value: data.brevoStats.company         },
                    { label: 'Data Fetched At', value: data.brevoStats.fetched_at     }
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '3px' }}>{value || 'N/A'}</div>
                    </div>
                  ))}
                  <div style={{ marginLeft: 'auto' }}>
                    <button onClick={() => fetchData('brevo')} className="btn-primary" style={{ padding: '9px 22px', fontSize: '13px' }}>
                      🔄 Refresh
                    </button>
                  </div>
                </div>

                <div className="stats-grid">
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
                        🔄 Renews:{' '}
                        {new Date(data.brevoStats.plan_details.plan_end_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    )}
                  </div>

                  <div className="stat-card">
                    <h3>Credits Remaining</h3>
                    <div className="stat-value" style={{ color: data.brevoStats.plan_details.trigger_alert ? '#DC2626' : '#059669' }}>
                      {data.brevoStats.plan_details.credits_remaining.toLocaleString()}
                    </div>
                    <p style={{ marginTop: '10px', fontSize: '13px' }}>
                      out of <strong style={{ color: '#000000' }}>{data.brevoStats.plan_details.total_limit.toLocaleString()}</strong> total
                    </p>
                    <p style={{ marginTop: '10px', fontSize: '13px' }}>
                      <strong style={{ color: '#000000' }}>{data.brevoStats.plan_details.credits_used.toLocaleString()}</strong> used this cycle
                    </p>
                  </div>

                  <div className="stat-card">
                    <h3>Usage — {data.brevoStats.plan_details.usage_label}</h3>
                    <div className="stat-value" style={{
                      color: data.brevoStats.plan_details.usage_percent >= 70 ? '#DC2626'
                           : data.brevoStats.plan_details.usage_percent >= 50 ? '#D97706'
                           : '#059669'
                    }}>
                      {data.brevoStats.plan_details.usage_percent}%
                    </div>

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

                <div className="stat-card" style={{ padding: '0', overflow: 'hidden', marginTop: '24px' }}>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>📊 Credit Usage Summary</h3>
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

            {activeTab === 'brevo' && data.brevoStats && !data.brevoStats.success && (
              <div>
                <h2>Email Plan & Credits</h2>
                <div className="error-banner">
                  ⚠️ {data.brevoStats.error || 'Unable to load Brevo data. Ensure BREVO_API_KEY is set correctly in your .env file.'}
                </div>
              </div>
            )}

            {/* ✅ NEW COMPONENT RENDER BLOCK FOR EMPLOYER SIGNUPS */}
            {activeTab === 'app-registered' && (
              <AppRegisteredRecruiters onUpdate={fetchUnreadCount} />
            )}

            {activeTab === 'recruiters' && (
              <RecruitersManager user={user} />
            )}

            {activeTab === 'users' && data.users && (
              <div>
                <h2>User Management</h2>
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

            {/* ✅ FIXED: DETAILED REVENUE ANALYTICS WITH REAL-TIME DATA */}
            {activeTab === 'stripe' && (
              <div>
                <h2>Revenue Analytics</h2>
                <div className="date-range-section">
                  <h3>Custom Date Range</h3>
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
                        ✓ Apply Filter
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
                          ✕ Clear
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
                        <h3>{startDate && endDate ? 'Selected Period' : ' All-Time'}</h3>
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
                        <div style={{padding: '20px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc'}}>
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