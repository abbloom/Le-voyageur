// vite.config.js
// ─────────────────────────────────────────────────────────────────
// VOYAGEUR ✦ — Configuration Vite + PWA
//
// Prérequis :
//   npm install -D vite-plugin-pwa
// ─────────────────────────────────────────────────────────────────

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon-512.png'],

      // ── Manifest PWA ──────────────────────────────────────────
      manifest: {
        name: 'Voyageur — Planificateur de voyage',
        short_name: 'Voyageur',
        description: 'Planifiez, organisez et partagez vos voyages en équipe.',
        theme_color: '#C9A96E',
        background_color: '#090D13',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'fr',
        categories: ['travel', 'productivity', 'lifestyle'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
        shortcuts: [
          {
            name: 'Nouveau voyage',
            short_name: '＋ Voyage',
            description: 'Créer un nouveau voyage',
            url: '/?action=new',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
        ],
        screenshots: [],
      },

      // ── Service Worker (cache strategy) ───────────────────────
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache des polices Google
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache de l'app elle-même (offline first)
            urlPattern: /^https:\/\/.+\.(js|css|html)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        // L'app fonctionne entièrement hors ligne
        navigateFallback: '/index.html',
      },

      // ── Dev mode ──────────────────────────────────────────────
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],

  // ── Build optimisations ────────────────────────────────────────
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
    
