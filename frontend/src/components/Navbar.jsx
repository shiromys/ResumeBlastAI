import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Navbar.css'

function Navbar({ user, isGuest, isAdmin, onViewChange, onLoginClick, onLogout }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navigate = useNavigate()

  const close = () => setMobileMenuOpen(false)

  const scrollTo = (id) => {
    close()
    if (window.location.pathname === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    } else {
      sessionStorage.setItem('scrollTarget', id)
      navigate('/')
    }
  }

  return (
    <>
      <nav className="navbar">
        <div className="navbar-container">
          <Link to="/" className="navbar-logo" onClick={close}>
            <img src="/image/logo.png" alt="ResumeBlast.ai — AI Recruiter Outreach Platform" className="logo-image" />
          </Link>

          <ul className={`navbar-menu ${mobileMenuOpen ? 'mobile-active' : ''}`}>
            <li><Link className="nav-link" to="/" onClick={close}>Home</Link></li>

            {!user ? (
              <>
                <li><button className="nav-link" onClick={() => scrollTo('how-it-works')}>How It Works</button></li>
                <li><button className="nav-link" onClick={() => scrollTo('pricing')}>Pricing</button></li>
                <li><Link className="nav-link" to="/recruiter" onClick={close}>Employers</Link></li>
                <li><Link className="nav-link" to="/contact" onClick={close}>Contact</Link></li>
                <li><button className="nav-link nav-login" onClick={onLoginClick}>Login</button></li>
              </>
            ) : (
              <>
                {!isGuest && (
                  <li><Link className="nav-link" to="/dashboard" onClick={close}>Dashboard</Link></li>
                )}
                <li><Link className="nav-link" to="/contact" onClick={close}>Contact</Link></li>
                {isAdmin && (
                  <li>
                    <button className="nav-link"
                      style={{background:'#111827',color:'white',border:'1px solid #374151',display:'flex',alignItems:'center',gap:'5px'}}
                      onClick={() => { close(); navigate('/admin') }}>
                      🛡️ Admin Panel
                    </button>
                  </li>
                )}
                <li className="user-badge">👤 {user.email?.split('@')[0]}</li>
                <li><button className="nav-link nav-logout" onClick={onLogout}>Sign Out</button></li>
              </>
            )}
          </ul>

          <button className="mobile-menu-btn" aria-label="Toggle menu" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <span>{mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </nav>
    </>
  )
}

export default Navbar