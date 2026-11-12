// frontend/src/services/adminApi.js
//
// ✅ NEW: drop-in replacement for `fetch()` on every admin-panel call.
//
// The backend now actually checks who's calling /api/admin/* (see
// backend/services/admin_auth.py) instead of trusting every request —
// but that only works if the request carries proof of who's asking.
// This wrapper attaches the current Supabase session's access token as
// `Authorization: Bearer <token>` on every call, the same way any other
// authenticated API call would. Admin components should import
// `adminFetch` and use it exactly like `fetch` — same signature, same
// return value (a Response) — nothing else about call sites changes.
//
// If there's no active Supabase session (shouldn't happen on the admin
// panel, since you have to be logged in to reach it at all), this still
// makes the request without the header — the backend will just 401 it,
// same as it would for anyone else without a valid token.

import { supabase } from '../lib/supabase'

export async function adminFetch(url, options = {}) {
  let accessToken = ''
  try {
    const { data } = await supabase.auth.getSession()
    accessToken = data?.session?.access_token || ''
  } catch (e) {
    console.warn('⚠️ adminFetch: could not read Supabase session, calling without auth header', e)
  }

  const headers = {
    ...(options.headers || {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }

  return fetch(url, { ...options, headers })
}

// ✅ NEW: downloads whatever a protected admin endpoint returns (CSV, the
// rendered receipt HTML, etc.) as a real file save, instead of opening it
// in a tab. A plain `<a href>` / `window.open(url)` can't attach the
// Authorization header these routes require, so this fetches the content
// with `adminFetch` (auth included) and hands the browser a Blob to save,
// entirely client-side.
export async function downloadViaAdminFetch(url, filename) {
  const res = await adminFetch(url)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const json = await res.json()
      message = json.error || message
    } catch {
      // response wasn't JSON (e.g. a real CSV/HTML body) — keep the generic message
    }
    throw new Error(message)
  }
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30000)
}