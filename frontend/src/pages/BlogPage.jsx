// frontend/src/pages/BlogPage.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageMeta from '../components/SEO/PageMeta'
import './BlogPage.css'

function BlogPage() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    fetch(`${API_URL}/api/blog/posts`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setPosts(data.data)
        else setError(data.error || 'Failed to load posts')
      })
      .catch(() => setError('Failed to load posts'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="blog-page">
      <PageMeta
        title="Blog | Job Search & Recruiter Outreach Tips — ResumeBlast.ai"
        description="Practical advice on job search strategy, recruiter outreach, and getting your resume seen — from the ResumeBlast.ai team."
        canonical="https://www.resumeblast.ai/blog"
      />

      <div className="blog-header">
        <p className="blog-label">The ResumeBlast.ai Blog</p>
        <h1 className="blog-title">Job Search & Recruiter Insights</h1>
      </div>

      {loading && <p className="blog-status">Loading posts…</p>}
      {error && <p className="blog-status blog-error">{error}</p>}

      <div className="blog-grid">
        {posts.map(post => (
          <Link to={`/blog/${post.slug}`} className="blog-card" key={post.slug}>
            {post.thumbnail_url && (
              <img src={post.thumbnail_url} alt={post.title} className="blog-card-image" />
            )}
            <div className="blog-card-body">
              {post.labels?.length > 0 && (
                <div className="blog-card-labels">
                  {post.labels.slice(0, 2).map(l => <span key={l} className="blog-tag">{l}</span>)}
                </div>
              )}
              <h2 className="blog-card-title">{post.title}</h2>
              <p className="blog-card-excerpt">{post.excerpt}</p>
              {post.published_at && (
                <p className="blog-card-date">
                  {new Date(post.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default BlogPage