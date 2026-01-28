import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allows access on local network
  },
  preview: {
    port: 4173,
    host: true, // Listen on all addresses (0.0.0.0)
    allowedHosts: [
      'frontend-production-9cae.up.railway.app', // Your specific Railway domain
      '.railway.app' // Allow all Railway subdomains (easier for future)
    ]
  }
})