// frontend/src/components/GoogleAnalytics.jsx
//
// WHAT WAS WRONG:
//   1. usePageTracking.js only fired once (empty dependency array [])
//      — route changes were never tracked
//   2. gtag('config') was called in TWO places — double counting first page
//   3. Cleanup function was removing GA scripts on unmount (risky)
//
// WHAT THIS FIX DOES:
//   - Loads the GA script ONCE on mount
//   - Tracks EVERY route change using useLocation() from react-router
//   - Single source of truth — usePageTracking.js is no longer needed
//   - No risky cleanup that removes GA scripts

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const GA_ID = 'G-6NHVZMSX04'

function GoogleAnalytics() {
  const location = useLocation()

  // ── Load GA script once on mount ─────────────────────────────────────────
  useEffect(() => {
    if (window.gaScriptLoaded) return
    window.gaScriptLoaded = true

    // Script 1: Load the gtag library
    const script1 = document.createElement('script')
    script1.async = true
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
    document.head.appendChild(script1)

    // Script 2: Initialise dataLayer and gtag function
    const script2 = document.createElement('script')
    script2.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
    `
    document.head.appendChild(script2)

    console.log('✅ Google Analytics loaded:', GA_ID)
  }, [])  // ← empty array is correct here — script loads only once

  // ── Track every route change ──────────────────────────────────────────────
  // location.pathname changes every time the user navigates to a new page.
  // This fires for: / → /employer-network → /contact → /pricing etc.
  useEffect(() => {
    if (!window.gtag) return

    window.gtag('config', GA_ID, {
      page_path: location.pathname + location.search,
    })

    console.log('📊 GA Page View:', location.pathname)
  }, [location.pathname, location.search])  // ← fires on EVERY route change

  return null
}

export default GoogleAnalytics