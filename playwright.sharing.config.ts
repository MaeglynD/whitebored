import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/sharing',
  outputDir: '.qa/sharing-results',
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8790',
    viewport: { width: 1440, height: 950 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'node node_modules/wrangler/bin/wrangler.js dev --ip 127.0.0.1 --port 8790 --persist-to .qa/sharing-emulator',
    url: 'http://127.0.0.1:8790',
    reuseExistingServer: true,
  },
})
