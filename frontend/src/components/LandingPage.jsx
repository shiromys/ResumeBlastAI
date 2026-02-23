import { useEffect, useState, useRef } from 'react'
import { initiateCheckout } from '../services/paymentService' // ✅ Added for guest payment
import './LandingPage.css'

// --- INTERNAL COMPONENT: Live Counter ---
const CountUp = ({ end, duration = 500, suffix = '' }) => {
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
    const pauseTime = 500;

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

function LandingPage({ onGetStarted, user }) { // ✅ Added user prop to check auth status
  // ✅ STATE: Store plans fetched from DB
  const [plans, setPlans] = useState({});

  useEffect(() => {
    window.scrollTo(0, 0);

    // ✅ FETCH: Get dynamic pricing and limits from backend
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    fetch(`${API_URL}/api/plans/public`)
      .then(res => res.json())
      .then(data => {
        if (data.plans) {
          // Convert array to object map for easy access (e.g., plans['basic'])
          const planMap = {};
          data.plans.forEach(p => planMap[p.key_name] = p);
          setPlans(planMap);
        }
      })
      .catch(err => console.error("Failed to load plans:", err));
  }, []);

  // ✅ NEW GUEST LOGIC: Handle plan selection based on auth status
  const handlePlanSelection = async (planKey) => {
    if (user || planKey === 'freemium') {
      // If registered OR freemium, follow existing flow
      onGetStarted();
    } else {
      // If NOT registered and paid plan, go to guest payment
      try {
        // ✅ FIX: Ensure the guest ID is established before leaving the site
        let guestId = localStorage.getItem('rb_guest_tracker_id');
        if (!guestId) {
          guestId = "guest_" + Date.now();
          localStorage.setItem('rb_guest_tracker_id', guestId);
        }

        localStorage.setItem('is_guest_session', 'true');
        localStorage.setItem('selected_plan_type', planKey);
        
        await initiateCheckout({ 
          email: "guest@resumeblast.ai", 
          id: guestId, // ✅ Use the stabilized ID
          plan: planKey,
          disclaimer_accepted: true 
        });
      } catch (err) {
        console.error("Guest payment failed:", err);
      }
    }
  };

  // ✅ HELPER: Format price parts (Whole . Decimal)
  const getPriceParts = (key, defaultCents) => {
    const cents = plans[key]?.price_cents ?? defaultCents;
    const whole = Math.floor(cents / 100);
    const fraction = (cents % 100).toString().padEnd(2, '0');
    return { whole, fraction };
  };

  // ✅ HELPER: Get recruiter limit
  const getLimit = (key, defaultLimit) => {
    return plans[key]?.recruiter_limit || defaultLimit;
  };

  const basicPrice = getPriceParts('basic', 999);
  const proPrice = getPriceParts('pro', 1299);

  return (
    <div className="landing-page">
      {/* HERO SECTION */}
      <section id="home" className="hero">
        <div className="hero-content">
          <div className="tagline-wrapper">
            <p className="tagline animated-wipe">
              AI-Powered Resume Distribution to <span className="counter-badge">500+</span> Recruiters
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
              />
            </span>
          </h1>
          
          <div className="hero-highlight-block">
            <p className="subtitle">
              Don't waste time rewriting your resume. Our engine analyzes your profile and sends it directly to <strong style={{color: '#DC2626', fontWeight: '800'}}><CountUp end={500} suffix="+" /> verified recruiters</strong> looking for your skills.
            </p>
            <div className="cta-container">
              <button className="cta-button large" onClick={onGetStarted}>
                Start Your Job Search
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="how-it-works">
        <h2>How It Works</h2>
        <p className="section-subtitle">Get noticed in 4 simple steps</p>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-icon">📄</div>
            <h3>Upload Resume</h3>
            <p>Upload your existing  Resume (.PDF,.TXT, .DOCX format) . No rewriting, reformatting, or "AI optimizing" required.</p>
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
            <p>We blast your resume to <strong style={{color: '#DC2626'}}>500+</strong> verified recruiters specifically looking for your skills.</p>
          </div>
          <div className="step">
            <div className="step-number">4</div>
            <div className="step-icon">📊</div>
            <h3>Track Results</h3>
            <p>Real-time analytics dashboard showing recent blasts and uploads.</p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="pricing">
        <h2>Choose Your Plan</h2>
        <p className="section-subtitle">Start for free, upgrade for maximum exposure.</p>
        
        <div className="pricing-container" style={{display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '1200px', margin: '50px auto 0'}}>
          
          {/* FREEMIUM CARD */}
          <div className="pricing-card" style={{flex: '1', minWidth: '280px', position: 'relative', border: '2px solid #DC2626', padding: '0'}}>
            <div className="popular-badge" style={{background: '#DC2626', position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', padding: '2px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', color: 'white'}}>
              
            </div>
            
            <div className="price-header" style={{padding: '20px 20px 10px', borderBottom: '1px solid #F3F4F6'}}>
              <h3 style={{fontSize: '20px', fontWeight: '700', margin: '0 0 5px 0', color: '#1F2937'}}>Freemium Blast</h3>
              <div className="price-tag" style={{margin: '5px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center'}}>
                <span className="currency" style={{fontSize: '20px', fontWeight: '600', color: '#374151', marginTop: '4px'}}>$</span>
                <span className="amount" style={{fontSize: '48px', fontWeight: '800', color: '#1F2937', lineHeight: '1'}}>0</span>
              </div>
              <p className="price-description" style={{fontSize: '12px', color: '#6B7280', margin: '5px 0'}}>One-time use only</p>
            </div>

            <ul className="features-list" style={{listStyle: 'none', padding: '15px 25px', margin: '0'}}>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}></span>
                {/* ✅ DYNAMIC: Freemium Count */}
                <strong>{getLimit('freemium', 11)} Verified Recruiters</strong>
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}></span>
                Resume Analysis
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}></span>
                Guaranteed Email Delivery
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}></span>
                Professional Template
              </li>
              <li style={{padding: '5px 0', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <span style={{color: '#DC2626', marginRight: '8px', fontSize: '14px'}}></span>
                Regular email support
              </li>
            </ul>

            <div style={{padding: '0 20px 20px'}}>
              <button 
                className="cta-button" 
                style={{ background: '#DC2626', color: 'white', width: '100%', padding: '12px', fontSize: '14px', fontWeight: '700', border: 'none', borderRadius: '6px', cursor: 'pointer' }} 
                onClick={() => handlePlanSelection('freemium')}
              >
                Try for Free
              </button>
            </div>
          </div>

          {/* BASIC PLAN CARD */}
          <div className="pricing-card featured" style={{flex: '1', minWidth: '280px', position: 'relative', border: '2px solid #DC2626', padding: '0'}}>
            <div className="popular-badge" style={{background: '#DC2626', position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', padding: '2px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', color: 'white'}}>
              
            </div>
            
            <div className="price-header" style={{padding: '20px 20px 10px', borderBottom: '1px solid #F3F4F6'}}>
              <h3 style={{fontSize: '20px', fontWeight: '700', margin: '0 0 5px 0', color: '#1F2937'}}>Basic Plan</h3>
              <div className="price-tag" style={{margin: '5px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center'}}>
                <span className="currency" style={{fontSize: '20px', fontWeight: '600', color: '#374151', marginTop: '4px'}}>$</span>
                {/* ✅ DYNAMIC: Basic Price */}
                <span className="amount" style={{fontSize: '48px', fontWeight: '800', color: '#1F2937', lineHeight: '1'}}>
                  {basicPrice.whole}<span style={{fontSize: '24px'}}>.{basicPrice.fraction}</span>
                </span>
              </div>
              <p className="price-description" style={{fontSize: '12px', color: '#6B7280', margin: '5px 0'}}>Focused growth</p>
            </div>

            <ul className="features-list" style={{listStyle: 'none', padding: '15px 25px', margin: '0'}}>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <strong>Everything in Freemium blast plus</strong>
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                {/* ✅ DYNAMIC: Basic Limit */}
                {getLimit('basic', 250)} Verified Recruiters
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                Industry specific list
              </li>
              <li style={{padding: '5px 0', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                Customized resume score
              </li>
              <li style={{padding: '5px 0', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                Priority email support
              </li>
              <li style={{padding: '5px 0', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                Skill analysis
              </li>
              
            </ul>

            <div style={{padding: '0 20px 20px'}}>
              <button 
                className="cta-button" 
                style={{ background: '#DC2626', color: 'white', width: '100%', padding: '12px', fontSize: '14px', fontWeight: '700', border: 'none', borderRadius: '6px', cursor: 'pointer' }} 
                onClick={() => handlePlanSelection('basic')}
              >
                Get Started
              </button>
            </div>
          </div>

          {/* PRO PLAN CARD */}
          <div className="pricing-card" style={{flex: '1', minWidth: '280px', position: 'relative', border: '2px solid #DC2626', padding: '0'}}>
             <div className="popular-badge" style={{background: '#DC2626', position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', padding: '2px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', color: 'white'}}>
              Most recommended
            </div>
            <div className="price-header" style={{padding: '20px 20px 10px', borderBottom: '1px solid #F3F4F6'}}>
              <h3 style={{fontSize: '20px', fontWeight: '700', margin: '0 0 5px 0', color: '#1F2937'}}>Pro Plan</h3>
              <div className="price-tag" style={{margin: '5px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center'}}>
                <span className="currency" style={{fontSize: '20px', fontWeight: '600', color: '#374151', marginTop: '4px'}}>$</span>
                {/* ✅ DYNAMIC: Pro Price */}
                <span className="amount" style={{fontSize: '48px', fontWeight: '800', color: '#1F2937', lineHeight: '1'}}>
                  {proPrice.whole}<span style={{fontSize: '24px'}}>.{proPrice.fraction}</span>
                </span>
              </div>
              <p className="price-description" style={{fontSize: '12px', color: '#6B7280', margin: '5px 0'}}>Maximum exposure</p>
            </div>

            <ul className="features-list" style={{listStyle: 'none', padding: '15px 25px', margin: '0'}}>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                <strong>Everything in Basic plan plus</strong>
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                {/* ✅ DYNAMIC: Pro Limit */}
                {getLimit('pro', 500)} verified recruiters
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
               Domain specific list
              </li>
              <li style={{padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                Customized resume score
              </li>
              <li style={{padding: '5px 0', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                Priority support
              </li>
               <li style={{padding: '5px 0', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                Skill Analysis
              </li>
              <li style={{padding: '5px 0', fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center'}}>
                Resume Analysis
              </li>
            </ul>

            <div style={{padding: '0 20px 20px'}}>
              <button 
                className="cta-button" 
                style={{ background: '#DC2626', color: 'white', width: '100%', padding: '12px', fontSize: '14px', fontWeight: '700', border: 'none', borderRadius: '6px', cursor: 'pointer' }} 
                onClick={() => handlePlanSelection('pro')}
              >
                Get Pro Now
              </button>
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
          <p style={{ color: '#374151', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
  New to ResumeBlast.ai? Start with our FREEmium Blast to {getLimit('freemium', 11)} top recruiters. 
  Ready for more? Upgrade to our <strong>Basic</strong> or <strong>Pro plan</strong> to reach up to {getLimit('pro', 500)} hiring managers.
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
            <h3>📧 CloudeSourceHRM</h3>
            <p>Access our premium recruiter database with 10,000+ contacts for targeted outreach campaigns.</p>
            <span className="learn-more">Learn More →</span>
          </a>
          <a href="https://blastyourresume.com" target="_blank" rel="noopener noreferrer" className="upsell-card">
            <h3>💼 BlastYourResume</h3>
            <p>Automated job application system - apply to 100+ jobs per day on major job boards.</p>
            <span className="learn-more">Learn More →</span>
          </a>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="final-cta">
        <h2>Ready to Land Your Dream Job?</h2>
        <p>Join 1000+ professionals who found their next opportunity with ResumeBlast.ai</p>
        <button className="cta-button large" onClick={onGetStarted}>
          Start Your Job Search Now
        </button>
        <p className="cta-subtext"> Secure checkout via Stripe</p>
      </section>
    </div>
  )
}

export default LandingPage