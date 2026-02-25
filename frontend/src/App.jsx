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

import './App.css'
import usePageTracking from './hooks/usePageTracking'

// ✅ FIX: Detect guest session using URL params FIRST (most reliable),
// then fall back to localStorage signals.
const detectGuestSession = (params) => {
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

function App() {
  usePageTracking()

  const navigate = useNavigate()
  const location = useLocation()

  const [user, setUser] = useState(null)
  const [isGuest, setIsGuest] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showSignup, setShowSignup] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true) 
  const [paymentSuccess, setPaymentSuccess] = useState(false) 
  const [hasUploadedInSession, setHasUploadedInSession] = useState(false)

  const prevUserIdRef = useRef(null)
  const [resumeText, setResumeText] = useState('')
  const [resumeUrl, setResumeUrl] = useState('')
  const [resumeId, setResumeId] = useState('')

  const checkAdminStatus = async (email) => {
    if (!email) return false
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Admin check timed out')), 5000)
      )
      const rpcPromise = supabase.rpc('check_is_admin', { check_email: email })
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise])
      if (error) return false 
      return !!data 
    } catch (err) {
      return false
    }
  }

  useEffect(() => {
    const initSession = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const isPaymentReturn = params.get('payment') === 'success'
        const sessionId = params.get('session_id')

        const detectedGuestId = isPaymentReturn ? detectGuestSession(params) : null
        const isGuestReturning = !!detectedGuestId

        console.log('🔍 Session init:', { 
          isPaymentReturn, 
          isGuestReturning,
          detectedGuestId,
          sessionId: sessionId?.slice(0, 20) 
        })

        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          setUser(session.user)
          setIsGuest(false)
          localStorage.removeItem('is_guest_session')
          prevUserIdRef.current = session.user.id

          const adminStatus = await checkAdminStatus(session.user.email)
          setIsAdmin(adminStatus)

          if (isPaymentReturn) {
            setPaymentSuccess(true)
            setHasUploadedInSession(true)
            navigate('/workbench', { replace: true })
          } else if (window.location.pathname === '/') {
             // Only force navigation if landing on root
             if (adminStatus) {
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
          navigate('/workbench', { replace: true })
          setHasUploadedInSession(false)

          const cleanUrl = `${window.location.pathname}?payment=success&session_id=${sessionId}`
          window.history.replaceState({}, '', cleanUrl)

        } else if (isPaymentReturn && !isGuestReturning) {
          console.warn('⚠️ Payment return but no guest session detected — going home')
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
        localStorage.removeItem('is_guest_session')
        if (prevUserIdRef.current === session.user.id) return
        prevUserIdRef.current = session.user.id
        setUser(session.user)
        const adminStatus = await checkAdminStatus(session.user.email)
        setIsAdmin(adminStatus)
        if (adminStatus) navigate('/admin')
        else {
          const role = session?.user?.user_metadata?.role
          if (role === 'recruiter') navigate('/recruiter')
          else navigate('/workbench')
        }
      } else if (event === 'SIGNED_OUT') {
        prevUserIdRef.current = null
        setUser(null)
        setIsAdmin(false)
        setIsGuest(false)
        navigate('/')
        setHasUploadedInSession(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])

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
    window.scrollTo(0, 0)
    if (['privacy', 'terms', 'refund'].includes(view)) {
      navigate(`/${view}`)
      return
    }
    switch (view) {
      case 'home': navigate((user || isGuest) ? '/workbench' : '/'); break
      case 'recruiter': navigate('/recruiter'); break
      case 'employer-network': navigate('/employer-network'); break // ✅ NEW
      case 'dashboard': navigate('/dashboard'); break
      case 'contact': navigate('/contact'); break
      case 'admin':
        if (isAdmin) navigate('/admin')
        else alert('You do not have admin privileges')
        break
      case 'how-it-works':
      case 'pricing':
        navigate('/')
        setTimeout(() => document.getElementById(view)?.scrollIntoView({ behavior: 'smooth' }), 100)
        break
      default: break
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
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

  const currentPath = location.pathname
  const isRecruiterDashboard = currentPath === '/recruiter' && user
  const isAdminPage = currentPath === '/admin' && user
  const isContactPage = currentPath === '/contact'
  const isLegalPage = ['/privacy', '/terms', '/refund'].includes(currentPath)
  const shouldShowFooter = !isAdminPage && !isContactPage

  return (
    <div className="app-wrapper">
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
            (user && isAdmin) ? <AdminDashboard user={user} onExit={() => navigate('/dashboard')} /> : <LandingPage onGetStarted={handleStartBlast} user={user} />
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
    </div>
  )
}

export default App