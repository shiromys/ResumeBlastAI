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

import './App.css'
import usePageTracking from './hooks/usePageTracking'

function App() {
  usePageTracking()

  const [user, setUser] = useState(null)
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

  // ✅ IMPROVED: Robust Admin Check with Timeout
  // Prevents the app from getting stuck on the spinner if the DB call hangs
  const checkAdminStatus = async (email) => {
    if (!email) return false
    
    try {
      // Create a timeout promise that rejects after 5 seconds
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Admin check timed out')), 5000)
      )

      // The actual RPC call
      const rpcPromise = supabase.rpc('check_is_admin', { check_email: email })

      // Race them - if RPC hangs, timeout wins so the app can load
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise])
      
      if (error) {
        console.warn('⚠️ Admin check warning:', error.message)
        return false // Default to non-admin on error
      }
      
      console.log(`🔍 DB Admin Check: ${email} → ${data ? '✅ ADMIN' : '❌ NOT ADMIN'}`)
      return !!data 
      
    } catch (err) {
      console.warn('⚠️ Admin check failed or timed out (defaulting to user):', err.message)
      return false
    }
  }

  // 1. INITIALIZATION
  useEffect(() => {
    const initSession = async () => {
      console.log('📄 Initializing session...')
      try {
        const params = new URLSearchParams(window.location.search)
        const isPaymentReturn = params.get('payment') === 'success'
        
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) throw error

        if (session?.user) {
          console.log('👤 User found in session:', session.user.email)
          setUser(session.user)
          prevUserIdRef.current = session.user.id
          
          // Check Admin Status (Fail-safe)
          const adminStatus = await checkAdminStatus(session.user.email)
          setIsAdmin(adminStatus)
          
          if (isPaymentReturn) {
            console.log('💰 Payment return detected in App.jsx')
            setPaymentSuccess(true)
            // We set this to true to show the workbench
            setHasUploadedInSession(true)
            setViewMode('upload-workbench') 
            
            // Try to restore resume data from local storage if available
            const savedResumeData = localStorage.getItem('pending_blast_resume_data')
            if (savedResumeData) {
               try {
                 const parsed = JSON.parse(savedResumeData)
                 if (parsed.id) setResumeId(parsed.id)
                 if (parsed.url) setResumeUrl(parsed.url)
               } catch (e) { console.error(e) }
            }
          } else if (adminStatus) {
            console.log('🛡️ Admin detected - redirecting to admin panel')
            setViewMode('admin')
          } else if (session.user.user_metadata?.role === 'recruiter') {
            setViewMode('recruiter')
          } else {
            setViewMode('dashboard')
          }
        } else {
          setViewMode('jobseeker-home')
        }
      } catch (error) {
        console.error('❌ Session init error:', error)
        // Ensure we don't get stuck in loading even on error
        setViewMode('jobseeker-home')
      } finally {
        console.log('🏁 Session initialization complete')
        setIsRestoring(false) 
      }
    }

    initSession()

    // 2. LISTEN FOR LOGIN/LOGOUT EVENTS
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`🔔 Auth event: ${event}`)
      
      if (event === 'SIGNED_IN' && session?.user) {
         if (prevUserIdRef.current === session.user.id) return 
         
         prevUserIdRef.current = session.user.id
         setUser(session.user)
         
         const adminStatus = await checkAdminStatus(session.user.email)
         setIsAdmin(adminStatus)

         if (adminStatus) {
             setViewMode('admin')
         } else {
             const role = session?.user?.user_metadata?.role
             if (role === 'recruiter') {
                 setViewMode('recruiter')
             } else {
                 setViewMode('upload-workbench')
             }
         }

      } else if (event === 'SIGNED_OUT') {
         prevUserIdRef.current = null
         setUser(null)
         setIsAdmin(false)
         setViewMode('jobseeker-home')
         setHasUploadedInSession(false)
      }
    })

    return () => subscription.unsubscribe()
  }, []) 

  const handleStartBlast = () => {
    setHasUploadedInSession(false)
    setResumeText('')
    setResumeUrl('')
    setResumeId('')
    setViewMode('upload-workbench')
  }

  const handleViewChange = (view) => {
    window.scrollTo(0, 0)
    switch(view) {
      case 'home': setViewMode(user ? 'upload-workbench' : 'jobseeker-home'); break;
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

    if (viewMode === 'contact') {
      return <ContactPage onBack={() => setViewMode(user ? 'dashboard' : 'jobseeker-home')} />
    }

    if (viewMode === 'admin') {
      if (!user || !isAdmin) {
        // Fallback if trying to access admin without perms
        return <LandingPage onGetStarted={handleStartBlast} />
      }
      return <AdminDashboard user={user} onExit={() => setViewMode('dashboard')} />
    }

    if (viewMode === 'recruiter') {
      if (user) return <div className="container"><RecruiterOnboarding user={user} /></div>
      return <RecruiterLanding onBackToJobSeeker={() => setViewMode('jobseeker-home')} onLogin={() => setShowSignup(true)} />
    }

    if (user) {
        if (viewMode === 'dashboard') return <div className="container"><UserDashboard user={user} onStartBlast={handleStartBlast} /></div>
        if (viewMode === 'jobseeker-home') return <LandingPage onGetStarted={handleStartBlast} />

        return (
            <div className="container dashboard-container">
              <div style={{marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                 <button className="btn-text" onClick={() => setViewMode('dashboard')}>← Back to Dashboard</button>
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
                    resumeText={resumeText} 
                    resumeId={resumeId} 
                    resumeUrl={resumeUrl} 
                    isPaymentSuccess={paymentSuccess} 
                  />
                </>
              ) : (
                <ResumeUpload user={user} onUploadSuccess={({ text, url, id }) => { setResumeText(text); setResumeUrl(url); setResumeId(id); setHasUploadedInSession(true); }} />
              )}
            </div>
          )
    }
    return <LandingPage onGetStarted={() => setShowSignup(true)} />
  }

  const isRecruiterDashboard = viewMode === 'recruiter' && user
  const isAdminPage = viewMode === 'admin' && user
  const isContactPage = viewMode === 'contact' 
  const shouldShowFooter = !isAdminPage && !isContactPage

  return (
    <div className="app-wrapper">
      <GoogleAnalytics />
      <PaymentSuccessHandler />
      {/* PaymentBlastTrigger handles the "Success Modal" on return from Stripe.
        It runs independently so it works even if ResumeAnalysis is empty.
      */}
      <PaymentBlastTrigger />
      
      {!isRecruiterDashboard && !isAdminPage && !isContactPage && (
        <Navbar user={user} isAdmin={isAdmin} onViewChange={handleViewChange} onLoginClick={() => setShowSignup(true)} onLogout={handleLogout} />
      )}
      <main className="main-content" style={(isRecruiterDashboard || isAdminPage || isContactPage) ? { paddingTop: 0 } : {}}>{renderContent()}</main>
      {shouldShowFooter && <Footer />}
      {showSignup && (
        viewMode === 'recruiter' 
          ? <RecruiterAuth onClose={() => setShowSignup(false)} onSuccess={(u) => { setUser({...u, role: 'recruiter'}); setShowSignup(false); }} />
          : <AuthModal onClose={() => setShowSignup(false)} onSuccess={(u) => { setUser(u); setShowSignup(false); setViewMode('upload-workbench'); }} />
      )}
    </div>
  )
}

export default App