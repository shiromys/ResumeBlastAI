import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'  // Import supabase client
import './ContactPage.css'

function ContactPage({ onBack }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [user, setUser] = useState(null)

  // ✅ Get authenticated user on component mount
  useEffect(() => {
    getAuthenticatedUser()
  }, [])

  const getAuthenticatedUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error) {
        console.error('Error getting user:', error)
        return
      }

      if (user) {
        console.log('✅ Authenticated user:', user.email)
        setUser(user)
        
        // ✅ Pre-fill form with user's authenticated email and name
        setFormData({
          name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0],
          email: user.email,
          subject: '',
          message: ''
        })
      } else {
        console.log('⚠️ No authenticated user found')
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      // Validate form
      if (!formData.name || !formData.email || !formData.subject || !formData.message) {
        throw new Error('Please fill in all fields')
      }

      // ✅ Include user ID in submission (if authenticated)
      const submissionData = {
        ...formData,
        user_id: user?.id || 'N/A'
      }

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      
      console.log('📤 Submitting support ticket from authenticated user')
      console.log('   User:', formData.email)
      console.log('   User ID:', user?.id)
      
      const response = await fetch(`${API_URL}/api/support-ticket/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit support ticket')
      }

      console.log('✅ Support ticket submitted successfully')
      console.log('   Ticket ID:', data.ticket_id)
      
      setMessage('✅ Message sent successfully! We\'ll get back to you soon.')
      
      // Reset only subject and message (keep name and email)
      setFormData({
        ...formData,
        subject: '',
        message: ''
      })
      
      // Navigate back after 2 seconds
      setTimeout(() => {
        if (onBack) onBack()
      }, 2000)

    } catch (error) {
      console.error('❌ Contact form error:', error)
      setMessage('❌ ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="contact-page">
      <div className="contact-container">
        {/* Back Button */}
        {onBack && (
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>
        )}

        {/* Header */}
        <div className="contact-header">
          <h1>Get In Touch</h1>
          <p className="contact-subtitle">
            We'd love to hear from you. Please fill out the form below or use our contact details.
          </p>
          {user && (
            <p style={{
              backgroundColor: '#D1FAE5',
              color: '#065F46',
              padding: '12px 20px',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              marginTop: '20px',
              border: '2px solid #10B981',
              display: 'inline-block',
              boxShadow: '0 2px 4px rgba(16, 185, 129, 0.15)'
            }}>
              ✓ Logged in as: <strong style={{ color: '#000000' }}>{user.email}</strong>
            </p>
          )}
        </div>

        {/* Contact Info Cards */}
        <div className="contact-info-grid">
          <div className="contact-info-card">
            <div className="contact-icon">📧</div>
            <h3>Email Us</h3>
            <p>info@resumeblast.ai</p>
          </div>

          <div className="contact-info-card">
            <div className="contact-icon">📞</div>
            <h3>Call Us</h3>
            <p>(800)971-8013</p>
          </div>

          <div className="contact-info-card">
            <div className="contact-icon">🕐</div>
            <h3>Business Hours</h3>
            <p>Mon - Fri: 9:00 - 6 PM CST</p>
          </div>
        </div>

        {/* Contact Form */}
        <div className="contact-form-section">
          <h2>Send Us a Message</h2>
          
          <form onSubmit={handleSubmit} className="contact-form">
            <div className="form-row">
              <div className="form-group">
                <label>Your Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  required
                  readOnly={!!user}
                  style={user ? { background: '#F3F4F6', cursor: 'not-allowed' } : {}}
                />
              </div>

              <div className="form-group">
                <label>Your Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="john@example.com"
                  required
                  readOnly={!!user}
                  style={user ? { background: '#F3F4F6', cursor: 'not-allowed' } : {}}
                />
                {user && (
                  <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '5px' }}>
                    ✓ Using your registered email address
                  </p>
                )}
              </div>
            </div>

            <div className="form-group">
              <label>Subject</label>
              <input
                type="text"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                placeholder="How can we help you?"
                required
              />
            </div>

            <div className="form-group">
              <label>Message</label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="Your message here..."
                rows="6"
                required
              />
            </div>

            <button 
              type="submit" 
              disabled={loading} 
              className="submit-button"
            >
              {loading ? 'Sending...' : 'Send Message'}
            </button>
          </form>

          {message && (
            <div className={`form-message ${message.includes('❌') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ContactPage