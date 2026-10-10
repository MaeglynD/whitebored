import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  optimizeDeps: { exclude: ['@tldraw/assets'] },
  plugins: [
    react(),
    {
      name: 'production-csp',
      apply: 'build',
      transformIndexHtml() {
        return [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content:
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' blob: data: https: wss:; media-src 'self' data: blob: https:; frame-src https:; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self' blob:",
            },
            injectTo: 'head',
          },
        ]
      },
    },
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable.png',
      ],
      manifest: {
        name: 'Whitebored',
        short_name: 'Whitebored',
        description: 'A whiteboard app for pragmatists.',
        theme_color: '#f8f9fc',
        background_color: '#f8f9fc',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8790',
        ws: true,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (req) => req.setHeader('Origin', 'http://127.0.0.1:8790'))
          proxy.on('proxyReqWs', (req) => req.setHeader('Origin', 'http://127.0.0.1:8790'))
        },
      },
    },
  },
  build: { sourcemap: true },
})
