// src/components/ResumeUpload.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { validateFile } from '../utils/fileValidator'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '../constants'
import { trackResumeUpload, getGuestId } from '../services/activityTrackingService'
import { saveGuestResume } from '../services/guestTrackingService' // ✅ ADDED: Guest DB tracking
import PropTypes from 'prop-types'
import * as mammoth from 'mammoth' 
import * as pdfjsLib from 'pdfjs-dist' 
import './ResumeUpload.css'

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

function ResumeUpload({ user, isGuest, onUploadSuccess }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [currentUser, setCurrentUser] = useState(user)

  // ✅ UPDATED: Fetch current user if not passed as prop, but skip if isGuest
  useEffect(() => {
    const getCurrentUser = async () => {
      // ✅ FIX: If user is a guest, initialize with a placeholder guest identity
      if (isGuest) {
        // We use the persistent guest ID from the service
        const guestId = getGuestId();
        setCurrentUser({ id: guestId, email: `${guestId}@resumeblast.ai` })
        return
      }

      if (!user || !user.id) {
        console.log('⚠️ User not passed as prop, fetching from Supabase...')
        const { data: { user: authUser }, error } = await supabase.auth.getUser()
        
        if (error) {
          console.error('❌ Error fetching user:', error)
          setError('Please log in to upload your resume')
          return
        }
        
        if (authUser) {
          console.log('✅ User fetched:', authUser.id)
          setCurrentUser(authUser)
        } else {
          setError('Please log in to upload your resume')
        }
      } else {
        setCurrentUser(user)
      }
    }
    
    getCurrentUser()
  }, [user, isGuest])

  const parsePDF = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let fullText = ''
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        
        const lines = {}
        textContent.items.forEach((item) => {
          const y = Math.round(item.transform[5]) 
          if (!lines[y]) lines[y] = []
          lines[y].push(item)
        })
        
        const sortedLines = Object.keys(lines)
          .sort((a, b) => b - a)
          .map(y => {
            return lines[y]
              .sort((a, b) => a.transform[4] - b.transform[4])
              .map(item => item.str)
              .join(' ')
          })
        
        fullText += sortedLines.join('\n') + '\n\n'
      }
      
      return fullText.trim()
    } catch (err) {
      console.error('PDF Parse Error:', err)
      throw new Error('Could not read PDF. Ensure it is text-based.')
    }
  }

  const parseWord = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
      return result.value
    } catch (err) {
      console.error('DOCX Parse Error:', err)
      throw new Error('Could not read DOCX file.')
    }
  }

  const handleFileUpload = async (file) => {
    try {
      // ✅ FIX: Allow the process to proceed if it is a guest session
      if (!currentUser && !isGuest) {
        setError('❌ Please log in or select a plan to upload your resume')
        console.error('❌ User/Guest not authenticated')
        return
      }

      const validation = validateFile(file)
      if (!validation.isValid) {
        setError(validation.errors.join(' '))
        return
      }

      setUploading(true)
      setError(null)
      setMessage('📤 Uploading your resume...')
      setProgress(10)

      const timestamp = Date.now()
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      
      // ✅ FIX: Use 'guest_uploads' folder for guests, otherwise use the user's ID
      const folderPrefix = isGuest ? 'guest_uploads' : (currentUser?.id || 'unknown')
      const fileName = `${folderPrefix}/${timestamp}_${sanitizedFileName}`

      console.log('📁 Upload path:', fileName)

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('resume')
        .upload(fileName, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        console.error('❌ Upload error:', uploadError)
        throw new Error(`Upload failed: ${uploadError.message}`)
      }
      
      setProgress(40)
      setMessage('📄 Extracting text content...')

      const { data: urlData } = supabase.storage
        .from('resume')
        .getPublicUrl(fileName)

      let extractedContent = ''
      const fileExtension = file.name.split('.').pop().toLowerCase()

      if (fileExtension === 'txt') {
        extractedContent = await file.text()
      } else if (fileExtension === 'pdf') {
        extractedContent = await parsePDF(file)
      } else if (fileExtension === 'docx' || fileExtension === 'doc') {
        extractedContent = await parseWord(file)
      }

      if (!extractedContent || extractedContent.length < 50) {
        throw new Error('Could not extract content. File might be empty or corrupted.')
      }

      setProgress(80)
      setMessage('💾 Saving to database...')

      // ✅ MODIFIED: TRACK EVERY UPLOAD
      // Logic adjusted to ensure trackResumeUpload is called for both types of users
      const trackingUserId = isGuest ? getGuestId() : (currentUser?.id || 'unknown');
      
      let resumeId = isGuest ? `guest_${Date.now()}` : null;
      
      const trackingResult = await trackResumeUpload(trackingUserId, {
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        file_type: fileExtension,
        extracted_text: extractedContent,
        extraction_method: fileExtension
      })

      if (!trackingResult.success) {
        console.error('⚠️ Failed to track resume upload:', trackingResult.error)
      } else if (trackingResult.resume_id) {
        // Use the ID returned from the tracking service (database ID)
        resumeId = trackingResult.resume_id;
      }

      // ✅ ADDED: Save resume data to guest_users table for guest users
      // This is fire-and-forget — does NOT block or affect the upload flow
      if (isGuest) {
        saveGuestResume({
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_size: file.size,
          file_type: fileExtension,
          extracted_text: extractedContent
        });
      }

      setProgress(100)
      setMessage(SUCCESS_MESSAGES.UPLOAD_SUCCESS)

      if (onUploadSuccess) {
        onUploadSuccess({
          text: extractedContent,
          url: urlData.publicUrl,
          name: file.name,
          id: resumeId
        })
      }
      
    } catch (error) {
      console.error('❌ Upload Process Error:', error)
      setError(error.message || ERROR_MESSAGES.UPLOAD_FAILED)
    } finally {
      setUploading(false)
      setTimeout(() => setProgress(0), 3000)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
  }

  if (!currentUser && !isGuest) {
    return (
      <div className="resume-upload">
        <h3>📄 Upload Your Resume</h3>
        <p className="upload-description">Loading...</p>
      </div>
    )
  }

  return (
    <div className="resume-upload">
      <h3>📄 Upload Your Resume</h3>
      <p className="upload-description">DOCX, PDF, or TXT (max 5MB)</p>
      
      <div style={{
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '6px',
        padding: '12px',
        marginBottom: '20px',
        fontSize: '14px',
        color: '#0369a1',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        lineHeight: '1.5'
      }}>
        <span style={{fontSize: '16px'}}>💡</span>
        <span>
          For better results, please ensure your uploaded resume contains the relevant skills for the roles you are targeting.
        </span>
      </div>

      <div className={`upload-zone ${uploading ? 'uploading' : ''}`}>
        <input
          type="file"
          id="resume-file-input"
          accept=".pdf,.docx,.doc,.txt"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: 'none' }}
        />
        <label htmlFor="resume-file-input" className="upload-label">
          {uploading ? (
            <>
              <div className="upload-spinner"></div>
              <p>{message} {progress}%</p>
            </>
          ) : (
             <>
              <div className="upload-icon">📤</div>
              <p className="upload-text"><strong>Click to browse</strong></p>
            </>
          )}
        </label>
      </div>
      {error && <div className="message error">❌ {error}</div>}
    </div>
  )
}

ResumeUpload.propTypes = {
  user: PropTypes.shape({ 
    id: PropTypes.string,
    email: PropTypes.string 
  }),
  isGuest: PropTypes.bool, 
  onUploadSuccess: PropTypes.func.isRequired
}

export default ResumeUpload;