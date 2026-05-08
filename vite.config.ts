import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import { loadDevHttpsConfig } from './src/dev/https'

const isProd = process.env.NODE_ENV === 'production'
const base = isProd ? '/miblioteca/' : '/'

export default defineConfig(({ command, mode }) => ({
  base,
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'miblioteca',
        short_name: 'miblioteca',
        start_url: base,
        theme_color: '#101418',
        background_color: '#101418',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    https:
      command === 'serve' && mode !== 'test'
        ? loadDevHttpsConfig((path) => readFileSync(path, 'utf8'))
        : undefined,
    port: 4173
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**']
  }
}))
