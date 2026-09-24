// frontend/src/pages/BlogPostPage.jsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageMeta from '../components/SEO/PageMeta'
import './BlogPage.css'

function BlogPostPage() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
    fetch(`${API_URL}/api/blog/posts/${slug}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setPost(data.data)
        else setNotFound(true)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) return <div className="blog-page"><p className="blog-status">Loading…</p></div>

  if (notFound || !post) {
    return (
      <div className="blog-page">
        <p className="blog-status">Post not found.</p>
        <Link to="/blog" className="blog-back-link">← Back to blog</Link>
      </div>
    )
  }

  return (
    <div className="blog-page blog-post-page">
      <PageMeta
        title={`${post.title} | ResumeBlast.ai Blog`}
        description={post.excerpt}
        canonical={`https://www.resumeblast.ai/blog/${post.slug}`}
      />

      <div className="blog-post-header">
        <Link to="/blog" className="blog-back-link">← Back to blog</Link>
        {post.labels?.length > 0 && (
          <div className="blog-card-labels">
            {post.labels.map(l => <span key={l} className="blog-tag">{l}</span>)}
          </div>
        )}
        <h1 className="blog-post-title">{post.title}</h1>
        {post.published_at && (
          <p className="blog-card-date">
            {new Date(post.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>

      {post.thumbnail_url && (
        <img src={post.thumbnail_url} alt={post.title} className="blog-post-hero-image" />
      )}

      {/* Content is authored solely by the ResumeBlast.ai team via Blogger — a single
          trusted source, not user-submitted — so rendering it directly is safe. */}
      <div className="blog-post-content" dangerouslySetInnerHTML={{ __html: post.content_html }} />
    </div>
  )
}

export default BlogPostPage