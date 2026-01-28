import { useState } from 'react'
import ResumeUpload from './ResumeUpload'
import ResumeAnalysis from './ResumeAnalysis'
import './JobSeekerDashboard.css'

function JobSeekerDashboard({ user, onLogout }) {
  const [selectedResume, setSelectedResume] = useState(null)

  const handleUploadSuccess = (resumeData) => {
    console.log('✅ Resume uploaded:', resumeData)
    setSelectedResume(resumeData)
  }

  return (
    <div className="job-seeker-dashboard">
      {/* No header here - using global navbar from App.jsx */}
      
      <div className="dashboard-content">
        {!selectedResume ? (
          <div className="upload-section">
            <h2>Job Seeker Dashboard</h2>
            <ResumeUpload 
              user={user} 
              onUploadSuccess={handleUploadSuccess} 
            />
          </div>
        ) : (
          <div className="analysis-section">
            <ResumeAnalysis
              user={user}
              resumeText={selectedResume.text}
              resumeUrl={selectedResume.url}
              resumeId={selectedResume.id}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default JobSeekerDashboard