import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'https://localhost:6173',
    ignoreHTTPSErrors: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['camera'],
      },
    },
  ],
  webServer: {
    command: 'npx vite --port 6173',
    url: 'https://localhost:6173',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
  },
})
