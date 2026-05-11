import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import sitemap from 'vite-plugin-sitemap'

export default defineConfig({
  plugins: [
    react(),
    sitemap({
      hostname: 'https://resumeblast.ai',
      dynamicRoutes: [
        '/',
        '/employer-network',
        '/recruiter',
        '/contact',
        '/privacy',
        '/terms',
        '/refund',
      ],
    }),
  ],
})