import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    devOptions: {
      enabled: true,
    },
    includeAssets: [
      'favicon.svg',
      'apple-touch-icon.png',
      'pwa-192x192.png',
      'pwa-512x512.png',
      'icons/icon-192x192.png',
      'icons/icon-512x512.png',
    ],
    workbox: {
      skipWaiting: true,
      clientsClaim: true,
      maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
    },
    manifest: {
      name: 'Content Creator Studio',
      short_name: 'Creator Studio',
      description: 'Content Creator Studio Web App',
      start_url: '/C-C/',
      scope: '/C-C/',
      theme_color: '#0f172a',
      background_color: '#0f172a',
      display: 'standalone',
      orientation: 'portrait',
      icons: [
        {
          src: 'icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: 'icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: 'icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: 'icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
  })],
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src'),
    },
  },
})
