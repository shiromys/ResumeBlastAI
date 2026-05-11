const SITE = 'ResumeBlast.ai'
const BASE  = 'https://resumeblast.ai'
const OG   = `${BASE}/og-image.jpg`

export const OG_IMAGE = OG

export function getPageMeta(page) {
  const pages = {
    home: {
      title: `AI Recruiter Outreach Platform | Send Your Resume Directly to Recruiters — ${SITE}`,
      description: `ResumeBlast.ai sends your resume directly to verified recruiters via AI-powered 3-wave email campaigns. Reach 250–500 recruiters automatically. Start free.`,
      canonical: `${BASE}/`,
    },
    'employer-network': {
      title: `Hire Pre-Screened Candidates Directly | Employer Network — ${SITE}`,
      description: `Receive AI-analyzed resumes from motivated job seekers. Skip job boards and connect directly with verified tech talent ready to interview.`,
      canonical: `${BASE}/employer-network`,
    },
    recruiter: {
      title: `Post-Free Hiring | Connect With Job Seekers Directly — ${SITE}`,
      description: `Skip job board clutter. Connect directly with job seekers actively distributing their profiles. Hire smarter without posting on job boards.`,
      canonical: `${BASE}/recruiter`,
    },
    contact: {
      title: `Contact Us — ${SITE}`,
      description: `Get in touch with the ResumeBlast.ai team. Questions about campaigns, pricing, or support.`,
      canonical: `${BASE}/contact`,
    },
    privacy:   { title: `Privacy Policy — ${SITE}`,   description: `Read the ResumeBlast.ai privacy policy.`,   canonical: `${BASE}/privacy`,  noindex: true },
    terms:     { title: `Terms of Service — ${SITE}`, description: `Read the ResumeBlast.ai terms of service.`, canonical: `${BASE}/terms`,    noindex: true },
    refund:    { title: `Refund Policy — ${SITE}`,    description: `Read the ResumeBlast.ai refund policy.`,    canonical: `${BASE}/refund`,   noindex: true },
    dashboard: { title: `Dashboard — ${SITE}`,        description: `Manage your campaigns.`,                    canonical: `${BASE}/dashboard`,noindex: true },
    workbench: { title: `Workbench — ${SITE}`,        description: `Upload and blast your resume.`,             canonical: `${BASE}/workbench`,noindex: true },
    admin:     { title: `Admin — ${SITE}`,            description: `Admin panel.`,                              canonical: `${BASE}/admin`,    noindex: true },
  }
  return { ...pages[page], ogImage: OG }
}