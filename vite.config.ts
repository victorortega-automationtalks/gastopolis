/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Privacidad por construcción: la app no puede hablar con ningún servidor. Solo carga lo suyo ('self') y, en
 * Windows, el canal interno de Tauri (ipc:). Se inyecta solo en el build: en desarrollo Vite necesita scripts en línea.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ipc: http://ipc.localhost",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const csp = (): Plugin => ({
  name: 'gastopolis-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
})

export default defineConfig({
  // Rutas relativas: el mismo build sirve para la web app y para la app de Windows (Tauri).
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    csp(),
    // Web app instalable (iPhone): todo precacheado, funciona sin conexión desde la primera visita.
    // El service worker se registra a mano y solo en el navegador (src/platform/pwa.ts), nunca en Tauri.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Gastópolis',
        short_name: 'Gastópolis',
        description: 'Tu dinero como una ciudad en 3D. Todo se queda en tu dispositivo.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#06070c',
        theme_color: '#06070c',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // La escena 3D es un trozo grande: también tiene que estar sin conexión.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
