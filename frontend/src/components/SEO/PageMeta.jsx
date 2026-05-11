import { Helmet } from 'react-helmet-async'
import { getPageMeta, OG_IMAGE } from '../../lib/seo'

function PageMeta({ page, title, description, canonical, noindex }) {
  const meta   = page ? getPageMeta(page) : {}
  const t      = title       || meta.title       || 'ResumeBlast.ai'
  const d      = description || meta.description || ''
  const c      = canonical   || meta.canonical   || 'https://resumeblast.ai/'
  const robots = (noindex || meta.noindex) ? 'noindex, nofollow' : 'index, follow'

  return (
    <Helmet>
      <title>{t}</title>
      <meta name="description"        content={d} />
      <meta name="robots"             content={robots} />
      <link rel="canonical"           href={c} />
      <meta property="og:title"       content={t} />
      <meta property="og:description" content={d} />
      <meta property="og:url"         content={c} />
      <meta property="og:image"       content={OG_IMAGE} />
      <meta name="twitter:title"       content={t} />
      <meta name="twitter:description" content={d} />
      <meta name="twitter:image"       content={OG_IMAGE} />
    </Helmet>
  )
}

export default PageMeta