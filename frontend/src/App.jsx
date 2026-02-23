import { useState, useEffect, useRef } from 'react'
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

import './App.css'
import usePageTracking from './hooks/usePageTracking'

// ✅ FIX: Robust guest detection helper
// Checks BOTH the is_guest_session flag AND the presence of a guest_id in localStorage.
// This handles cases where is_guest_session was set but guest_id is the more reliable signal.
const detectGuestSession = () => {
  const flagSet = localStorage.getItem('is_guest_session') === 'true'
  const guestId = localStorage.getItem('guest_id') || localStorage.getItem('guestId') || ''
  const hasGuestId = guestId.startsWith('guest_')
  return flagSet || hasGuestId
}

function App() {
  usePageTracking()

  const [user, setUser] = useState(null)
  const [isGuest, setIsGuest] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showSignup, setShowSignup] = useState(false)
  const [viewMode, setViewMode] = useState('jobseeker-home') 
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
        
        // ✅ FIX: Use robust detection - checks both flag AND guest_id key
        const isGuestReturning = detectGuestSession()

        console.log('🔍 Session init:', { isPaymentReturn, isGuestReturning, sessionId: sessionId?.slice(0, 20) })
        
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (session?.user) {
          // ── REGISTERED USER ──────────────────────────────────────────
          setUser(session.user)
          setIsGuest(false)
          localStorage.removeItem('is_guest_session')
          prevUserIdRef.current = session.user.id
          
          const adminStatus = await checkAdminStatus(session.user.email)
          setIsAdmin(adminStatus)
          
          if (isPaymentReturn) {
            setPaymentSuccess(true)
            setHasUploadedInSession(true)
            setViewMode('upload-workbench') 
          } else if (adminStatus) {
            setViewMode('admin')
          } else if (session.user.user_metadata?.role === 'recruiter') {
            setViewMode('recruiter')
          } else {
            setViewMode('dashboard')
          }

        } else if (isPaymentReturn && isGuestReturning) {
          // ── GUEST RETURNING FROM STRIPE PAYMENT ──────────────────────
          // ✅ FIX: This block now reliably triggers because detectGuestSession()
          // checks guest_id presence, not just the is_guest_session flag.
          console.log('✅ Guest returning from payment — routing to workbench')
          setIsGuest(true)
          setPaymentSuccess(true)
          setViewMode('upload-workbench')
          setHasUploadedInSession(false) // Guest needs to upload resume now

        } else if (isPaymentReturn && !isGuestReturning) {
          // ── PAYMENT RETURN BUT NO GUEST SIGNAL ───────────────────────
          // Could be a direct URL visit or expired session - check if we have
          // a pending_blast_config as a final fallback signal
          const pendingConfig = localStorage.getItem('pending_blast_config')
          const pendingPlan = localStorage.getItem('selected_plan_type')
          
          if (pendingConfig || pendingPlan) {
            // There's pending blast data - treat as guest
            console.log('⚠️ Payment return with pending blast data — treating as guest')
            setIsGuest(true)
            setPaymentSuccess(true)
            setViewMode('upload-workbench')
            setHasUploadedInSession(false)
          } else {
            console.log('⚠️ Payment return but no guest session found — going home')
            setViewMode('jobseeker-home')
          }

        } else {
          // ── NO SESSION, NOT A PAYMENT RETURN ─────────────────────────
          if (!['privacy', 'terms', 'refund'].includes(viewMode)) {
            setViewMode('jobseeker-home')
          }
        }
      } catch (error) {
        console.error('❌ Session init error:', error)
        setViewMode('jobseeker-home')
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
         if (adminStatus) setViewMode('admin')
         else {
             const role = session?.user?.user_metadata?.role
             if (role === 'recruiter') setViewMode('recruiter')
             else setViewMode('upload-workbench')
         }
      } else if (event === 'SIGNED_OUT') {
         prevUserIdRef.current = null
         setUser(null)
         setIsAdmin(false)
         setIsGuest(false)
         setViewMode('jobseeker-home')
         setHasUploadedInSession(false)
      }
    })
    return () => subscription.unsubscribe()
  }, []) 

  const handleStartBlast = () => {
    if (!user && !isGuest) {
      setShowSignup(true);
      return;
    }
    setHasUploadedInSession(false)
    setResumeText('')
    setResumeUrl('')
    setResumeId('')
    setViewMode('upload-workbench')
  }

  const handleViewChange = (view) => {
    window.scrollTo(0, 0)
    if (['privacy', 'terms', 'refund'].includes(view)) {
      setViewMode(view)
      return
    }

    switch(view) {
      case 'home': setViewMode((user || isGuest) ? 'upload-workbench' : 'jobseeker-home'); break;
      case 'recruiter': setViewMode('recruiter'); break;
      case 'dashboard': setViewMode('dashboard'); break;
      case 'contact': setViewMode('contact'); break;
      case 'admin':
        if (isAdmin) setViewMode('admin');
        else alert('You do not have admin privileges');
        break;
      case 'how-it-works':
      case 'pricing':
        setViewMode('jobseeker-home')
        setTimeout(() => document.getElementById(view)?.scrollIntoView({ behavior: 'smooth' }), 100)
        break;
      default: break;
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setIsAdmin(false)
    setIsGuest(false)
    setHasUploadedInSession(false)
    setViewMode('jobseeker-home')
    window.location.href = '/'
  }

  const renderContent = () => {
    if (isRestoring) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <div className="spinner" style={{ width: '50px', height: '50px' }}></div>
        </div>
      )
    }

    if (viewMode === 'privacy' || viewMode === 'terms' || viewMode === 'refund') {
      return <LegalPage type={viewMode} onBack={() => setViewMode(user ? 'dashboard' : 'jobseeker-home')} />
    }

    if (viewMode === 'contact') {
      return <ContactPage onBack={() => setViewMode(user ? 'dashboard' : 'jobseeker-home')} />
    }

    if (viewMode === 'admin') {
      if (!user || !isAdmin) return <LandingPage onGetStarted={handleStartBlast} user={user} />
      return <AdminDashboard user={user} onExit={() => setViewMode('dashboard')} />
    }

    if (viewMode === 'recruiter') {
      if (user) return <div className="container"><RecruiterOnboarding user={user} /></div>
      return <RecruiterLanding onBackToJobSeeker={() => setViewMode('jobseeker-home')} onLogin={() => setShowSignup(true)} />
    }

    if (user || isGuest) {
        if (viewMode === 'dashboard' && user) return <div className="container"><UserDashboard user={user} onStartBlast={handleStartBlast} /></div>
        if (viewMode === 'jobseeker-home') return <LandingPage onGetStarted={handleStartBlast} user={user} />

        return (
            <div className="container dashboard-container">
              <div style={{marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                 {user && <button className="btn-text" onClick={() => setViewMode('dashboard')}>← Back to Dashboard</button>}
                 <h1 style={{fontSize: '24px', margin: 0}}>Resume Blast Workbench</h1>
              </div>
              {hasUploadedInSession ? (
                <>
                   <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '20px', padding: '15px', background: '#f3f4f6', borderRadius: '8px', alignItems:'center'}}>
                    <div><h3 style={{margin: 0, fontSize: '18px'}}>Current Resume Analysis</h3></div>
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
                <ResumeUpload user={user} isGuest={isGuest} onUploadSuccess={({ text, url, id }) => { setResumeText(text); setResumeUrl(url); setResumeId(id); setHasUploadedInSession(true); }} />
              )}
            </div>
          )
    }
    return <LandingPage onGetStarted={handleStartBlast} user={user} />
  }

  const isRecruiterDashboard = viewMode === 'recruiter' && user
  const isAdminPage = viewMode === 'admin' && user
  const isContactPage = viewMode === 'contact' 
  const isLegalPage = ['privacy', 'terms', 'refund'].includes(viewMode)
  
  const shouldShowFooter = !isAdminPage && !isContactPage

  return (
    <div className="app-wrapper">
      <GoogleAnalytics />
      <PaymentSuccessHandler />
      <PaymentBlastTrigger />
      
      {!isRecruiterDashboard && !isAdminPage && !isContactPage && !isLegalPage && (
        <Navbar user={user} isGuest={isGuest} isAdmin={isAdmin} onViewChange={handleViewChange} onLoginClick={() => setShowSignup(true)} onLogout={handleLogout} />
      )}
      
      <main className="main-content" style={(isRecruiterDashboard || isAdminPage || isContactPage || isLegalPage) ? { paddingTop: 0 } : {}}>{renderContent()}</main>
      
      {shouldShowFooter && <Footer onViewChange={handleViewChange} />}
      
      {showSignup && (
        viewMode === 'recruiter' 
          ? <RecruiterAuth onClose={() => setShowSignup(false)} onSuccess={(u) => { setUser({...u, role: 'recruiter'}); setShowSignup(false); }} />
          : <AuthModal onClose={() => setShowSignup(false)} onSuccess={(u) => { setUser(u); setShowSignup(false); setViewMode('upload-workbench'); }} />
      )}
    </div>
  )
}

export default App