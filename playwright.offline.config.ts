import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/offline',
  outputDir: '.qa/offline-results',
  timeout: 45000,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5188',
    viewport: { width: 1440, height: 950 },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --strictPort --port 5188 --host 127.0.0.1',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: false,
  },
})
