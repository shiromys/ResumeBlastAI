import { useEffect, useState, useRef } from 'react'
import './LandingPage.css'

// --- INTERNAL COMPONENT: Live Counter ---
const CountUp = ({ end, duration = 2000, suffix = '' }) => {
  const [count, setCount] = useState(0);
  const countRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setIsVisible(true);
      else { setIsVisible(false); setCount(0); }
    }, { threshold: 0.1 });
    if (countRef.current) observer.observe(countRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) window.requestAnimationFrame(step);
      else setCount(end);
    };
    window.requestAnimationFrame(step);
  }, [isVisible, end, duration]);

  return <span ref={countRef}>{count}{suffix}</span>;
};

// --- INTERNAL COMPONENT: Typewriter ---
const TypewriterEffect = ({ text, delay = 0, infinite = false, onTypeEnd, onDeleteStart }) => {
  const [currentText, setCurrentText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsStarted(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!isStarted) return;
    let timer;
    const typeSpeed = isDeleting ? 30 : 60;
    const pauseTime = 2000;

    if (!isDeleting && currentIndex < text.length) {
      timer = setTimeout(() => {
        setCurrentText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, typeSpeed);
    } else if (!isDeleting && currentIndex === text.length) {
      if (onTypeEnd) onTypeEnd();
      if (infinite) {
        timer = setTimeout(() => {
          setIsDeleting(true);
          if (onDeleteStart) onDeleteStart();
        }, pauseTime);
      }
    } else if (isDeleting && currentIndex > 0) {
      timer = setTimeout(() => {
        setCurrentText(prev => prev.slice(0, -1));
        setCurrentIndex(prev => prev - 1);
      }, typeSpeed);
    } else if (isDeleting && currentIndex === 0) {
      setIsDeleting(false);
    }
    return () => clearTimeout(timer);
  }, [currentIndex, isDeleting, isStarted, text, infinite, onTypeEnd, onDeleteStart]);

  return <span>{currentText}</span>;
};

function LandingPage({ onGetStarted }) {
  const [showHighlight, setShowHighlight] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-page">
      {/* HERO SECTION */}
      <section id="home" className="hero">
        <div className="hero-content">
          <div className="tagline-wrapper">
            <p className="tagline animated-wipe">
              AI-Powered Resume Distribution to <span className="counter-badge"><CountUp end={2000} suffix="+" /></span> Recruiters
            </p>
          </div>
          
          <h1>
            <span style={{ display: 'block', minHeight: '1.2em' }}>
              <TypewriterEffect text="Stop Applying." />
            </span>
            <span className="highlight-container" style={{ display: 'block', minHeight: '1.2em' }}>
              <TypewriterEffect 
                text="Start Blasting." 
                delay={800} 
                infinite={true} 
                onTypeEnd={() => setShowHighlight(true)} 
                onDeleteStart={() => setShowHighlight(false)} 
              />
              <span className={`highlight-bg ${showHighlight ? 'active' : ''}`}></span>
            </span>
          </h1>
          
          <div className="hero-highlight-block">
            <p className="subtitle">
              Don't waste time rewriting your resume. Our engine analyzes your profile and sends it directly to <strong style={{color: '#DC2626', fontWeight: '800'}}><CountUp end={2000} suffix="+" /> verified recruiters</strong> looking for your skills.
            </p>
            <div className="cta-container">
              <button className="cta-button large" onClick={onGetStarted}>
                Start Your Job Search
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-it-works">
        <h2>How It Works</h2>
        <p className="section-subtitle">Get noticed in 4 simple steps</p>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-icon">📄</div>
            <h3>Upload Resume</h3>
            <p>Upload your existing PDF. No rewriting, reformatting, or "AI optimizing" required.</p>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-icon">🤖</div>
            <h3>AI Analysis</h3>
            <p>Our AI scans your resume to detect your role, seniority, and best-fit industry automatically.</p>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-icon">📧</div>
            <h3>Mass Distribution</h3>
            <p>We blast your resume to <strong style={{color: '#DC2626'}}>2000+</strong> verified recruiters specifically looking for your skills.</p>
          </div>
          <div className="step">
            <div className="step-number">4</div>
            <div className="step-icon">📊</div>
            <h3>Track Results</h3>
            <p>Real-time analytics dashboard showing recent blasts and uploads.</p>
          </div>
        </div>
      </section>

      {/* Pricing Section - MINIMIZED LENGTH */}
      <section id="pricing" className="pricing">
        <h2>Choose Your Plan</h2>
        <p className="section-subtitle">Start for free, upgrade for power.</p>
        
        <div className="pricing-container" style={{display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '850px', margin: '0 auto'}}>
          
          {/* FREEMIUM CARD - COMPACT */}
          <div className="pricing-card" style={{flex: '1', minWidth: '280px', position: 'relative', border: '2px solid #DC2626', padding: '0'}}>
            <div className="popular-badge" style={{background: '#DC2626', position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', padding: '2px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', color: 'white'}}>
              New User Offer
            </div>
            
            {/* Header */}
            <div className="price-header" style={{padding: '20px 20px 10px', borderBottom: '1px solid #F3F4F6'}}>
              <h3 style={{fontSize: '20px', fontWeight: '700', margin: '0 0 5px 0', color: '#1F2937'}}>Freemium Blast</h3>
              <div className="price-tag" style={{margin: '5px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center'}}>
                <span className="currency" style={{fontSize: '20px', fontWeight: '600', color: '#374151', marginTop: '4px'}}>$</span>
                <span className="amount" style={{fontSize: '48px', fontWeight: '800', color: '#1F2937', lineHeight: '1'}}>0</span>
              </div>
              <p className="price-description" style={{fontSize: '12px', color: '#6B7280', margin: '5px 0'}}>One-time use only</p>
            </div>

            {/* List */}
            <ul className="features-list" style={{listStyle: 'none', padding: '15px 25px', margin: '0'}}>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                <strong>11 Verified Recruiters</strong>
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                Top Agencies Included
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                Instant Email Delivery
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                Professional Template
              </li>
              <li style={{padding: '5px 0', fontSize: '13px', color: '#9CA3AF', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                Limited to 11 Recruiters
              </li>
            </ul>

            {/* Button */}
            <div style={{padding: '0 20px 20px'}}>
              <button 
                className="cta-button" 
                style={{
                  background: '#DC2626', 
                  color: 'white', 
                  width: '100%',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: '700',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'background 0.3s ease'
                }} 
                onClick={onGetStarted}
                onMouseOver={(e) => e.target.style.background = '#991B1B'}
                onMouseOut={(e) => e.target.style.background = '#DC2626'}
              >
                Try for Free
              </button>
            </div>
          </div>

          {/* PREMIUM CARD - UPDATED TO "COMING SOON" WITH RED THEME */}
          <div className="pricing-card featured" style={{flex: '1', minWidth: '280px', position: 'relative', border: '2px solid #DC2626', boxShadow: 'none', padding: '0'}}>
            <div className="popular-badge" style={{background: '#DC2626', position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', padding: '2px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', color: 'white'}}>
              Coming Soon
            </div>

            {/* Header */}
            <div className="price-header" style={{padding: '20px 20px 10px', borderBottom: '1px solid #F3F4F6'}}>
              <h3 style={{fontSize: '20px', fontWeight: '700', margin: '0 0 5px 0', color: '#1F2937'}}>Premium Plans</h3>
              <div className="price-tag" style={{margin: '15px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60px'}}>
                <span className="amount" style={{fontSize: '32px', fontWeight: '800', color: '#374151', lineHeight: '1'}}>Coming Soon</span>
              </div>
              <p className="price-description" style={{fontSize: '12px', color: '#6B7280', margin: '5px 0'}}>Join the waitlist</p>
            </div>

            {/* List */}
            <ul className="features-list" style={{listStyle: 'none', padding: '15px 25px', margin: '0'}}>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                AI Targeting Analysis
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                Distribution to <strong>2000+ Recruiters</strong>
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                Verified Recruiters
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                Real-time Analytics Dashboard
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                Direct Inbox Placement
              </li>
              <li style={{padding: '5px 0', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}>✓</span>
                30-Day Email Support
              </li>
            </ul>

            {/* Button */}
            <div style={{padding: '0 20px 20px'}}>
              <button 
                className="cta-button featured" 
                style={{
                  background: '#DC2626',
                  color: 'white',
                  width: '100%',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: '700',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'not-allowed',
                  boxShadow: 'none',
                  opacity: 0.7
                }}
                disabled={true}
              >
                Coming Soon
              </button>
              <p className="guarantee" style={{textAlign: 'center', fontSize: '11px', color: '#6B7280', marginTop: '10px', fontWeight: '500'}}>
                 Notify me when available
              </p>
            </div>
          </div>
        </div>

        {/* Additional Info Section */}
        <div style={{
          marginTop: '40px',
          textAlign: 'center',
          padding: '20px',
          background: '#F9FAFB',
          borderRadius: '12px',
          maxWidth: '800px',
          margin: '40px auto 0'
        }}>
          <p style={{
            color: '#374151',
            fontSize: '14px',
            lineHeight: '1.6',
            margin: 0
          }}>
            <strong style={{color: '#DC2626'}}>New to ResumeBlast?</strong> Start with our <strong>FREE Freemium Blast</strong> to 11 top recruiters. 
            Ready for more? Upgrade to <strong style={{color: '#DC2626'}}>Premium</strong> anytime to reach 2000+ verified recruiters with advanced analytics.
          </p>
        </div>
      </section>

      {/* Upsells Section */}
      <section className="upsells">
        <h2>Explore Our Other Career Tools</h2>
        <div className="upsell-cards">
          <a href="https://instantresumeai.com" target="_blank" rel="noopener noreferrer" className="upsell-card">
            <h3>⚡ InstantResumeAI</h3>
            <p>Get your resume AI-enhanced in minutes without mass distribution. Perfect for quick updates.</p>
            <span className="learn-more">Learn More →</span>
          </a>
          <a href="https://www.cloudsourcehrm.us/" target="_blank" rel="noopener noreferrer" className="upsell-card">
            <h3>📧 Cloude Source HRM</h3>
            <p>Access our premium recruiter database with 10,000+ contacts for targeted outreach campaigns.</p>
            <span className="learn-more">Learn More →</span>
          </a>
          <a href="https://blastyourresume.com" target="_blank" rel="noopener noreferrer" className="upsell-card">
            <h3>💼 BlastyourResume</h3>
            <p>Automated job application system - apply to 100+ jobs per day on major job boards.</p>
            <span className="learn-more">Learn More →</span>
          </a>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="final-cta">
        <h2>Ready to Land Your Dream Job?</h2>
        <p>Join 10,000+ professionals who found their next opportunity with ResumeBlast.ai</p>
        <button className="cta-button large" onClick={onGetStarted}>
          Start Your Job Search Now
        </button>
        <p className="cta-subtext">✓ One-time payment | Secure checkout</p>
      </section>
    </div>
  )
}

export default LandingPage