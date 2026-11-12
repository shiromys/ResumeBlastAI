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