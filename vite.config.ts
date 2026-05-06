import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { loadDevHttpsConfig } from './src/dev/https'

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'miblioteca',
        short_name: 'miblioteca',
        theme_color: '#101418',
        background_color: '#101418',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
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
    setupFiles: './src/test/setup.ts'
  }
}))
