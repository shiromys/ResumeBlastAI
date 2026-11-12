import { useState, useEffect, useRef } from 'react'
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'

// Components
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import LandingPage from './components/LandingPage'
import RecruiterLanding from './components/RecruiterLanding'
import RecruiterAuth from './components/RecruiterAuth' 
import RecruiterOnboarding from './components/RecruiterOnboarding' 
import ResumeUpload from './components/ResumeUpload'
import AuthModal from './components/AuthModal'
import ResumeAnalysis from './components/ResumeAnalysis'
import GoogleAnalytics from './components/GoogleAnalytics'
import PaymentSuccessHandler from './components/PaymentSuccessHandler'
import UserDashboard from './components/UserDashboard'
import AdminDashboard from './components/Admin/AdminDashboard'
import PaymentBlastTrigger from './components/PaymentBlastTrigger'
import ContactPage from './components/ContactPage'
import LegalPage from './components/LegalPage'
import EmployerNetwork from './components/EmployerNetwork' // ✅ NEW
import HowItWorksPage from './pages/HowItWorksPage'
import PricingPage from './pages/PricingPage'
import ScrollToTop from './components/ScrollToTop' // ✅ ADDED
import BlogPage from './pages/BlogPage'
import BlogPostPage from './pages/BlogPostPage'
import MaintenancePage from './components/MaintenancePage' // ✅ NEW: Maintenance Mode takeover

import './App.css'
import usePageTracking from './hooks/usePageTracking'
import ComplianceBanner from './components/ComplianceBanner'
import ThankYouPage from './pages/ThankYouPage'

// ✅ FIX: Modified to accept isAuth parameter. 
// If a user is logged in, we ignore guest logic to prevent session conflicts.
const detectGuestSession = (params, isAuth) => {
  if (isAuth) return null; // Force exit if user is logged in

  const urlGuestId = params.get('guest_id') || ''
  if (urlGuestId.startsWith('guest_')) {
    console.log('✅ Guest detected via URL param:', urlGuestId)
    localStorage.setItem('guest_id', urlGuestId)
    localStorage.setItem('guestId', urlGuestId)
    localStorage.setItem('is_guest_session', 'true')
    return urlGuestId
  }

  const flagSet = localStorage.getItem('is_guest_session') === 'true'
  const storedGuestId = localStorage.getItem('guest_id') || localStorage.getItem('guestId') || ''
  if (flagSet || storedGuestId.startsWith('guest_')) {
    console.log('✅ Guest detected via localStorage:', storedGuestId || 'flag only')
    return storedGuestId || 'unknown_guest'
  }

  const pendingConfig = localStorage.getItem('pending_blast_config')
  const pendingPlan = localStorage.getItem('selected_plan_type')
  if (pendingConfig || pendingPlan) {
    console.log('✅ Guest detected via pending blast data in localStorage')
    return 'pending_guest'
  }

  return null
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function App() {
  usePageTracking()

  const navigate = useNavigate()
  const location = useLocation()

  const [user, setUser] = useState(null)
  const [isGuest, setIsGuest] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  // ✅ NEW: 'super_admin' | 'admin' | null — mirrors what the backend actually
  // resolved via /api/admin/whoami, so AdminDashboard can show the "Manage
  // Admin Access" tab to the two permanent super admins only. Passed down
  // alongside isAdmin rather than replacing it, so nothing that already
  // reads isAdmin needs to change.
  const [adminRole, setAdminRole] = useState(null)
  const [showSignup, setShowSignup] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [hasUploadedInSession, setHasUploadedInSession] = useState(false)

  const prevUserIdRef = useRef(null)
  const [resumeText, setResumeText] = useState('')
  const [resumeUrl, setResumeUrl] = useState('')
  const [resumeId, setResumeId] = useState('')

  // ✅ NEW: Maintenance Mode. Polled independently of the auth/session
  // flow above — it has to work (and keep working) whether or not anyone
  // is logged in. Fails open on any error (stays "not enabled") so a
  // flaky network request can never be the thing that shows every
  // visitor a maintenance page by accident.
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '', estimated_back_at: null })

  // ✅ CHANGED: this used to call a Postgres RPC (`check_is_admin`) that only
  // ever drove client-side UI state — the Flask backend never re-checked
  // anything, so it was decoration, not security. The backend now has a
  // real admin check (backend/services/admin_auth.py), exposed at
  // GET /api/admin/whoami, so this calls that instead and returns both
  // whether the signed-in user is an admin AND which role ('super_admin' or
  // 'admin') — the role is new information the old RPC never provided, and
  // is what gates the "Manage Admin Access" tab to the two permanent super
  // admins only.
  const checkAdminStatus = async (accessToken) => {
    if (!accessToken) return { isAdmin: false, role: null }
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Admin check timed out')), 5000)
      )
      const fetchPromise = fetch(`${API_URL}/api/admin/whoami`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then(r => r.json())
      const data = await Promise.race([fetchPromise, timeoutPromise])
      return { isAdmin: !!data?.is_admin, role: data?.role || null }
    } catch (err) {
      console.error('⚠️ Admin check failed:', err)
      return { isAdmin: false, role: null }
    }
  }

  useEffect(() => {
    const initSession = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const isPaymentReturn = params.get('payment') === 'success'
        const sessionId = params.get('session_id')

        // 1. Check Supabase Auth FIRST
        const { data: { session } } = await supabase.auth.getSession()
        const isAuthenticated = !!session?.user

        // 2. Only check for Guest if NOT authenticated
        const detectedGuestId = isPaymentReturn ? detectGuestSession(params, isAuthenticated) : null
        const isGuestReturning = !!detectedGuestId

        console.log('🔍 Session init:', { 
          isAuthenticated,
          isPaymentReturn, 
          isGuestReturning,
          detectedGuestId,
          sessionId: sessionId?.slice(0, 20) 
        })

        // ✅ HELPER: Restore Resume State from LocalStorage
        const restoreResumeData = () => {
          const savedData = localStorage.getItem('pending_blast_resume_data')
          if (savedData) {
            try {
              const parsed = JSON.parse(savedData)
              let restoredId = parsed.id || '';

              // If the user is authenticated, do not use a guest 'temp_' ID
              if (isAuthenticated && restoredId.startsWith('temp_')) {
                console.log('🧹 Clearing stale guest resume ID for authenticated user');
                restoredId = ''; // This forces the app to generate a real UUID
              }

              setResumeId(restoredId)
              setResumeUrl(parsed.url || '')
              setResumeText(parsed.text || '')
              setHasUploadedInSession(true)
              console.log('✅ Restored resume data from localStorage')
            } catch (e) {
              console.error('Failed to parse saved resume data', e)
            }
          }
        }

        if (isAuthenticated) {
          setUser(session.user)
          setIsGuest(false)
          // Explicitly clear guest flags when a real user is found
          localStorage.removeItem('is_guest_session') 
          localStorage.removeItem('guest_id')
          localStorage.removeItem('guestId')
          prevUserIdRef.current = session.user.id

          const adminStatus = await checkAdminStatus(session.access_token)
          setIsAdmin(adminStatus.isAdmin)
          setAdminRole(adminStatus.role)

          if (isPaymentReturn) {
            setPaymentSuccess(true)
            restoreResumeData() // Restore state for registered users
            // 🔥 FIX: Pass window.location.search to preserve Stripe URL parameters!
            navigate(`/thank-you${window.location.search}`, { replace: true })
          } else if (window.location.pathname === '/') {
             if (adminStatus.isAdmin) {
                navigate('/admin', { replace: true })
             } else if (session.user.user_metadata?.role === 'recruiter') {
                navigate('/recruiter', { replace: true })
             } else {
                navigate('/dashboard', { replace: true })
             }
          }

        } else if (isPaymentReturn && isGuestReturning) {
          console.log('✅ Guest returning from payment — routing to workbench')
          setIsGuest(true)
          setPaymentSuccess(true)
          restoreResumeData() // Restore state for guests

          // ✅ NEW: Stripe Checkout now collects the guest's real email itself
          // (mandatory, editable — see payment.py), replacing the old
          // GuestEmailGate confirm-email step. Silently fetch what Stripe
          // captured for this session and carry it forward in localStorage —
          // ResumeAnalysis.jsx's blast payload and the later "Complete
          // Account Setup" step both read guest_confirmed_email from here.
          if (sessionId) {
            try {
              const resp = await fetch(`${API_URL}/api/guest/session-email/${sessionId}`)
              const json = await resp.json()
              if (json.success && json.email) {
                localStorage.setItem('guest_confirmed_email', json.email)
              }
            } catch (e) {
              console.error('⚠️ Could not fetch guest session email:', e)
            }
          }

          // 🔥 FIX: Pass window.location.search to preserve Stripe URL parameters for guests too!
          navigate(`/thank-you${window.location.search}`, { replace: true })

        } else if (isPaymentReturn && !isGuestReturning) {
          console.warn('⚠️ Payment return but no session detected — going home')
          navigate('/', { replace: true })
        }
      } catch (error) {
        console.error('❌ Session init error:', error)
        navigate('/', { replace: true })
      } finally {
        setIsRestoring(false)
      }
    }

    initSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setIsGuest(false)
        
        // Aggressively clear all guest-related local storage items on login
        localStorage.removeItem('is_guest_session')
        localStorage.removeItem('guest_id')
        localStorage.removeItem('guestId')
        
        const savedResume = localStorage.getItem('pending_blast_resume_data');
        if (savedResume && savedResume.includes('temp_')) {
          localStorage.removeItem('pending_blast_resume_data');
          localStorage.removeItem('pending_blast_config');
        }

        if (prevUserIdRef.current === session.user.id) return
        prevUserIdRef.current = session.user.id
        setUser(session.user)
        
        const adminStatus = await checkAdminStatus(session.access_token)
        setIsAdmin(adminStatus.isAdmin)
        setAdminRole(adminStatus.role)
        if (adminStatus.isAdmin) navigate('/admin')
        else {
          const role = session?.user?.user_metadata?.role
          if (role === 'recruiter') navigate('/recruiter')
          else {
            // 🔥 FIX: Ensure we do NOT navigate away and wipe the URL if a payment is processing
            const searchParams = new URLSearchParams(window.location.search);
            if (searchParams.get('payment') !== 'success') {
              navigate('/workbench');
            }
          }
        }
      } else if (event === 'SIGNED_OUT') {
        prevUserIdRef.current = null
        setUser(null)
        setIsAdmin(false)
        setAdminRole(null)
        setIsGuest(false)
        navigate('/')
        setHasUploadedInSession(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])

  // ✅ NEW: Maintenance Mode — checked once on load, then re-checked every
  // 45s so an admin's toggle reaches tabs that are already open (an
  // admin turning it off doesn't require every visitor to refresh), and
  // so turning it ON reasonably promptly covers people already browsing.
  // Deliberately independent of isRestoring/session state: this must
  // keep working the same way whether or not anyone is signed in.
  useEffect(() => {
    let cancelled = false

    const checkMaintenance = async () => {
      try {
        const res = await fetch(`${API_URL}/api/maintenance-status`)
        const json = await res.json()
        if (!cancelled && json && json.success) {
          setMaintenance({
            enabled: !!json.enabled,
            message: json.message || '',
            estimated_back_at: json.estimated_back_at || null,
          })
        }
      } catch (e) {
        // Fail open — never let a network hiccup flip this on by accident.
        console.warn('⚠️ Could not check maintenance status:', e)
      }
    }

    checkMaintenance()
    const interval = setInterval(checkMaintenance, 45000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const handleStartBlast = () => {
    if (!user && !isGuest) {
      setShowSignup(true)
      return
    }
    setHasUploadedInSession(false)
    setResumeText('')
    setResumeUrl('')
    setResumeId('')
    navigate('/workbench')
  }

  const handleViewChange = (view) => {
    if (['privacy', 'terms', 'refund'].includes(view)) {
      window.scrollTo(0, 0)
      navigate(`/${view}`)
      return
    }
    switch (view) {
      case 'home': 
        window.scrollTo(0, 0)
        navigate((user || isGuest) ? '/workbench' : '/')
        break
      case 'recruiter': 
        window.scrollTo(0, 0)
        navigate('/recruiter')
        break
      case 'employer-network': 
        window.scrollTo(0, 0)
        navigate('/employer-network')
        break
      case 'dashboard': 
        window.scrollTo(0, 0)
        navigate('/dashboard')
        break
      case 'contact': 
        window.scrollTo(0, 0)
        navigate('/contact')
        break
      case 'admin':
        window.scrollTo(0, 0)
        if (isAdmin) navigate('/admin')
        else alert('You do not have admin privileges')
        break
      case 'how-it-works':
        window.scrollTo(0, 0)
        navigate('/how-it-works')
        break
      case 'pricing':
        window.scrollTo(0, 0)
        navigate('/pricing')
        break
      default: break
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    setAdminRole(null)
    setIsGuest(false)
    setHasUploadedInSession(false)
    navigate('/')
  }

  if (isRestoring) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div className="spinner" style={{ width: '50px', height: '50px' }}></div>
      </div>
    )
  }

  // ✅ NEW: Maintenance Mode full-page takeover. Signed-in admins always
  // bypass it (isAdmin is already resolved by the time isRestoring is
  // false) — they stay on the real app with the real sidebar and real
  // "/admin" route, so they're never themselves locked out of the one
  // screen that can flip this back off. Everyone else, on every route,
  // sees this instead of the app underneath. The backend APIs
  // (payments, webhooks, the scheduler) are completely unaffected by
  // this — this is a frontend-only gate, nothing here blocks a request.
  if (maintenance.enabled && !isAdmin) {
    return <MaintenancePage message={maintenance.message} estimatedBackAt={maintenance.estimated_back_at} />
  }

  const currentPath = location.pathname
  const isRecruiterDashboard = currentPath === '/recruiter' && user
  const isAdminPage = currentPath === '/admin' && user
  const isContactPage = currentPath === '/contact'
  const isLegalPage = ['/privacy', '/terms', '/refund'].includes(currentPath)
  const shouldShowFooter = !isAdminPage && !isContactPage

  return (
    <div className="app-wrapper">
      <ScrollToTop /> {/* ✅ ADDED — fixes scroll position on all page navigations */}
      <GoogleAnalytics />
      <PaymentSuccessHandler />
      <PaymentBlastTrigger />

      {!isRecruiterDashboard && !isAdminPage && !isContactPage && !isLegalPage && (
        <Navbar
          user={user}
          isGuest={isGuest}
          isAdmin={isAdmin}
          onViewChange={handleViewChange}
          onLoginClick={() => setShowSignup(true)}
          onLogout={handleLogout}
        />
      )}

      <main
        className="main-content"
        style={(isRecruiterDashboard || isAdminPage || isContactPage || isLegalPage) ? { paddingTop: 0 } : {}}
      >
        <Routes>
          <Route path="/" element={<LandingPage onGetStarted={handleStartBlast} user={user} />} />

          <Route path="/thank-you" element={<ThankYouPage />} />

          <Route path="/workbench" element={
            (user || isGuest) ? (
              <div className="container dashboard-container">
                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {user && <button className="btn-text" onClick={() => navigate('/dashboard')}>← Back to Dashboard</button>}
                  <h1 style={{ fontSize: '24px', margin: 0 }}>Resume Blast Workbench</h1>
                </div>
                {hasUploadedInSession ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', padding: '15px', background: '#f3f4f6', borderRadius: '8px', alignItems: 'center' }}>
                      <div><h3 style={{ margin: 0, fontSize: '18px' }}>Current Resume Analysis</h3></div>
                      <button onClick={handleStartBlast} className="btn-outline">📄 Upload Different Resume</button>
                    </div>
                    <ResumeAnalysis
                      user={user}
                      isGuest={isGuest}
                      resumeText={resumeText}
                      resumeId={resumeId}
                      resumeUrl={resumeUrl}
                      isPaymentSuccess={paymentSuccess}
                    />
                  </>
                ) : (
                  // ✅ FIX: no more email-confirm gate here — Stripe Checkout
                  // already collected a real, mandatory email for guests, so
                  // they go straight from payment to upload.
                  <ResumeUpload
                    user={user}
                    isGuest={isGuest}
                    onUploadSuccess={({ text, url, id }) => {
                      setResumeText(text)
                      setResumeUrl(url)
                      setResumeId(id)
                      setHasUploadedInSession(true)
                    }}
                  />
                )}
              </div>
            ) : <Navigate to="/" replace />
          } />

          <Route path="/dashboard" element={
            user ? <div className="container"><UserDashboard user={user} onStartBlast={handleStartBlast} /></div> : <Navigate to="/" replace />
          } />

          <Route path="/admin" element={
            (user && isAdmin) ? <AdminDashboard user={user} adminRole={adminRole} onExit={() => navigate('/dashboard')} /> : <LandingPage onGetStarted={handleStartBlast} user={user} />
          } />

          <Route path="/employer-network" element={
            <EmployerNetwork onLogin={() => setShowSignup(true)} onViewChange={handleViewChange} />
          } />

          <Route path="/recruiter" element={
            user ? (
              <div className="container"><RecruiterOnboarding user={user} /></div>
            ) : (
              <RecruiterLanding
                onBackToJobSeeker={() => navigate('/')}
                onLogin={() => setShowSignup(true)}
                onViewChange={handleViewChange}
              />
            )
          } />

          <Route path="/how-it-works" element={
            <HowItWorksPage onGetStarted={handleStartBlast} />
          } />

          <Route path="/pricing" element={
            <PricingPage onGetStarted={handleStartBlast} user={user} />
          } />

          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />

          <Route path="/contact" element={<ContactPage onBack={() => navigate(user ? '/dashboard' : '/')} />} />
          <Route path="/privacy" element={<LegalPage type="privacy" onBack={() => navigate(user ? '/dashboard' : '/')} />} />
          <Route path="/terms" element={<LegalPage type="terms" onBack={() => navigate(user ? '/dashboard' : '/')} />} />
          <Route path="/refund" element={<LegalPage type="refund" onBack={() => navigate(user ? '/dashboard' : '/')} />} />

          {/* Catch-all fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {shouldShowFooter && <Footer onViewChange={handleViewChange} />}

      {showSignup && (
        currentPath === '/recruiter' || currentPath === '/employer-network'
          ? <RecruiterAuth
              onClose={() => setShowSignup(false)}
              onSuccess={(u) => { setUser({ ...u, role: 'recruiter' }); setShowSignup(false) }}
            />
          : <AuthModal
              onClose={() => setShowSignup(false)}
              onSuccess={(u) => { setUser(u); setShowSignup(false); navigate('/workbench') }}
            />
      )}

      {/* Add the Compliance Banner Here */}
      <ComplianceBanner />
    </div>
  )
}

export default App