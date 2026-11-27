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
    injectRegister: false,
    devOptions: {
      enabled: true,
    },
    includeAssets: [
      'favicon.svg',
      'apple-touch-icon.png',
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-maskable-512.png',
    ],
    workbox: {
      skipWaiting: true,
      clientsClaim: true,
      cleanupOutdatedCaches: true,
      navigateFallback: null,
      globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      runtimeCaching: [
        {
          urlPattern: ({ request }) =>
            request.mode === 'navigate' || request.destination === 'document',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'html-navigation-cache',
            networkTimeoutSeconds: 4,
            matchOptions: {
              ignoreSearch: true,
            },
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 7,
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
        {
          urlPattern: /\.wasm$/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'wasm-runtime-cache',
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 90,
            },
            cacheableResponse: {
              statuses: [0, 200],
            },
          },
        },
      ],
    },
    manifest: {
      name: 'Content Creator',
      short_name: 'Content Creator',
      description: 'Social Link & QR, Photo & Poster, and Voice & Video Creator Studio',
      start_url: './',
      scope: './',
      theme_color: '#141414',
      background_color: '#141414',
      display: 'standalone',
      orientation: 'portrait',
      icons: [
        {
          src: 'icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: 'icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: 'icons/icon-maskable-512.png',
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
