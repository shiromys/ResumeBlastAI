import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Navbar.css'

function Navbar({ user, isGuest, isAdmin, onViewChange, onLoginClick, onLogout }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navigate = useNavigate()

  const close = () => setMobileMenuOpen(false)

  return (
    <>
      <nav className="navbar">
        <div className="navbar-container">
          <Link to="/" className="navbar-logo" onClick={close}>
            <img
              src="/image/logo.png"
              alt="ResumeBlast.ai — AI Recruiter Outreach Platform"
              className="logo-image"
            />
          </Link>

          <ul className={`navbar-menu ${mobileMenuOpen ? 'mobile-active' : ''}`}>
            <li><Link className="nav-link" to="/" onClick={close}>Home</Link></li>

            {!user ? (
              <>
                <li>
                  <Link className="nav-link" to="/how-it-works" onClick={close}>
                    How It Works
                  </Link>
                </li>

                <li>
                  <Link className="nav-link" to="/pricing" onClick={close}>
                    Pricing
                  </Link>
                </li>

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
                    <button
                      className="nav-link"
                      style={{ background: '#111827', color: 'white', border: '1px solid #374151', display: 'flex', alignItems: 'center', gap: '5px' }}
                      onClick={() => { close(); navigate('/admin') }}
                    >
                      🛡️ Admin Panel
                    </button>
                  </li>
                )}

                <li>
                  <div className="user-badge">
                    <div className="user-avatar">
                      {user.email?.split('@')[0].slice(0, 2).toUpperCase()}
                    </div>
                    <span className="user-name">{user.email?.split('@')[0]}</span>
                  </div>
                </li>

                <li><button className="nav-link nav-logout" onClick={onLogout}>Sign Out</button></li>
              </>
            )}
          </ul>

          <button
            className="mobile-menu-btn"
            aria-label="Toggle menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span>{mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
        </div>
      </nav>
    </>
  )
}

export default Navbar