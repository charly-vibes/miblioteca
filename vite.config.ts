import { defineConfig } from 'vitest/config'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'miblioteca',
        short_name: 'miblioteca',
        theme_color: '#101418',
        background_color: '#101418',
        display: 'standalone'
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    https: {},
    port: 4173
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts'
  }
})
