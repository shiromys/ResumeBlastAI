// src/components/EmployerNetworkBanner.jsx
// Beautified: re-appears every 45s, glowing border, shimmer CTA,
// animated gradient header, live ping dot, stat cards, bounce CTA.
import { useState, useEffect } from 'react'

function EmployerNetworkBanner({ onNavigateToEmployerNetwork }) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const show = () => {
      setClosing(false)
      setVisible(true)
    }

    // First appearance (Delay removed, appears instantly)
    show()

    // Re-appear every 45s after being dismissed
    const reAppearInterval = setInterval(() => {
      setVisible((v) => {
        if (!v) { show(); }
        return v
      })
    }, 45000)

    return () => {
      clearInterval(reAppearInterval)
    }
  }, [])

  const handleDismiss = (e) => {
    e.stopPropagation()
    setClosing(true)
    setTimeout(() => { setVisible(false); setClosing(false) }, 300)
  }

  const handleClick = () => {
    setVisible(false)
    onNavigateToEmployerNetwork()
  }

  if (!visible) return null

  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: '28px',
          right: '28px',
          zIndex: 9999,
          width: '360px',
          borderRadius: '20px',
          overflow: 'hidden',
          cursor: 'pointer',
          animation: closing
            ? 'bannerSlideDown 0.3s ease both'
            : 'bannerSlideUp 0.5s cubic-bezier(0.34,1.56,0.64,1) both, glowPulse 3s 0.8s ease-in-out infinite',
        }}
        onClick={handleClick}
      >

        {/* ── Animated gradient header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #DC2626 0%, #7F1D1D 50%, #DC2626 100%)',
          backgroundSize: '200% 200%',
          animation: 'gradientShift 4s ease infinite',
          padding: '18px 20px 16px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Shimmer sweep */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)',
            animation: 'shimmerSweep 3s 1s linear infinite',
          }} />

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            style={{
              position: 'absolute', top: '10px', right: '10px',
              background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: '50%',
              width: '26px', height: '26px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '16px', color: '#fff', lineHeight: 1,
              transition: 'background 0.15s', zIndex: 2,
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
          >×</button>

          {/* Live badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)',
            color: '#fff', fontSize: '9px', fontWeight: '800',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            padding: '3px 10px 3px 8px', borderRadius: '100px', marginBottom: '10px',
            border: '1px solid rgba(255,255,255,0.28)',
          }}>
            <span style={{
              width: '7px', height: '7px', background: '#4ADE80',
              borderRadius: '50%', display: 'inline-block', flexShrink: 0,
              animation: 'livePing 1.4s ease-in-out infinite',
            }} />
            Live — Free Access Available
          </div>

          <h3 style={{
            fontFamily: 'Inter, sans-serif', fontSize: '20px', fontWeight: '900',
            color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.15,
            margin: 0, textShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }}>
             Join the Recruiter Network
          </h3>
          <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.82)', margin: '6px 0 0', lineHeight: 1.5 }}>
            AI-screened resumes · No job board noise · Hire direct
          </p>
        </div>

        {/* ── Body ── */}
        <div style={{ background: '#fff', padding: '16px 20px 20px' }}>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            {[
              { num: '100%', label: 'Free' },
              { num: 'AI', label: 'Screened' },
              { num: '24h', label: 'Review' },
            ].map((s, i) => (
              <div key={i} style={{
                textAlign: 'center', background: '#FEF2F2',
                borderRadius: '10px', padding: '8px 4px',
                border: '1px solid #FEE2E2',
              }}>
                <div style={{ fontSize: '15px', fontWeight: '900', color: '#DC2626', lineHeight: 1 }}>{s.num}</div>
                <div style={{ fontSize: '9px', color: '#9CA3AF', marginTop: '3px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Bullets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '16px' }}>
            {[
              'Free employer access — no credit card',
              'AI-scored & structured candidate profiles',
              'Direct resume downloads, zero gatekeeping',
            ].map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '12.5px', color: '#374151', fontWeight: '500' }}>
                <div style={{
                  width: '18px', height: '18px', background: '#DC2626', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, color: '#fff', fontSize: '9px', fontWeight: '800',
                  boxShadow: '0 1px 4px rgba(220,38,38,0.4)',
                }}>✓</div>
                {text}
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
              color: '#fff', border: 'none', borderRadius: '10px',
              padding: '13px', fontSize: '14px', fontWeight: '800',
              fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              boxShadow: '0 4px 14px rgba(220,38,38,0.5)',
              letterSpacing: '-0.01em',
              position: 'relative', overflow: 'hidden',
              animation: 'ctaBounce 2.5s 2s ease-in-out infinite',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 22px rgba(220,38,38,0.6)' }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(220,38,38,0.5)' }}
          >
            {/* Shimmer on CTA */}
            <span style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.28) 50%, transparent 70%)',
              animation: 'shimmerSweep 2.2s 1.5s linear infinite',
            }} />
            <span style={{ position: 'relative' }}>Get Free Recruiter Access →</span>
          </button>

          <p style={{ textAlign: 'center', fontSize: '10px', color: '#9CA3AF', marginTop: '8px', marginBottom: 0 }}>
            Click anywhere on this card to explore
          </p>
        </div>
      </div>

      <style>{`
        @keyframes bannerSlideUp {
          from { opacity: 0; transform: translateY(50px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bannerSlideDown {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to   { opacity: 0; transform: translateY(50px) scale(0.92); }
        }
        @keyframes glowPulse {
          0%, 100% {
            box-shadow: 0 0 0 2px #DC2626,
                        0 8px 40px rgba(220,38,38,0.30),
                        0 24px 60px rgba(0,0,0,0.14);
          }
          50% {
            box-shadow: 0 0 0 3px #DC2626,
                        0 8px 55px rgba(220,38,38,0.55),
                        0 24px 70px rgba(0,0,0,0.18);
          }
        }
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes shimmerSweep {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(220%); }
        }
        @keyframes livePing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.8); opacity: 1; }
          60%       { box-shadow: 0 0 0 6px rgba(74,222,128,0); opacity: 0.8; }
        }
        @keyframes ctaBounce {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-3px); }
        }
      `}</style>
    </>
  )
}

export default EmployerNetworkBanner