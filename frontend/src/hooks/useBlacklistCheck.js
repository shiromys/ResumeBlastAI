import { useState } from 'react'

export const useBlacklistCheck = () => {
  const [isChecking, setIsChecking] = useState(false)

  const checkBlacklist = async (email) => {
    setIsChecking(true)
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

    try {
      const response = await fetch(`${API_URL}/api/auth/check-blacklist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      })

      const data = await response.json()

      // If user is blacklisted (403 or explicit flag)
      if (response.status === 403 || data.is_blacklisted) {
        return {
          allowed: false,
          // Use the message exactly as returned from backend
          message: data.message || "For the signup/login contact support"
        }
      }

      return {
        allowed: true,
        message: 'Account in good standing'
      }

    } catch (error) {
      console.error('Error checking blacklist:', error)
      // Allow access if server is unreachable (prevent blocking everyone)
      return {
        allowed: true,
        message: 'Check completed'
      }
    } finally {
      setIsChecking(false)
    }
  }

  return {
    checkBlacklist,
    isChecking
  }
}