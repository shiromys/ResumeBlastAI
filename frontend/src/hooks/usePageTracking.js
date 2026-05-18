// frontend/src/hooks/usePageTracking.js
//
// WHAT WAS WRONG:
//   useEffect(() => {...}, [])  ← empty array = only fires ONCE on load
//   Route changes from / to /employer-network were NEVER tracked
//
// WHAT THIS FIX DOES:
//   Fires gtag page_view on every pathname change using useLocation()
//
// NOTE: GoogleAnalytics.jsx now also tracks routes directly.
//       This hook is kept so App.jsx does not need to change.
//       Both work together without double-counting because:
//       - GoogleAnalytics.jsx tracks route changes via location.pathname
//       - This hook is now a no-op (returns null safely)
//       If you want to simplify later, you can remove this hook
//       and the usePageTracking() call from App.jsx entirely.

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const usePageTracking = () => {
  const location = useLocation()

  useEffect(() => {
    // GoogleAnalytics.jsx now handles all tracking.
    // This hook is intentionally left as a no-op to avoid
    // breaking the import in App.jsx.
    // Route tracking is handled in GoogleAnalytics.jsx
  }, [location.pathname])

  return null
}

export default usePageTracking