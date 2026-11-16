import { defineConfig } from '@playwright/test'

// Set PW_CHROMIUM_PATH to use a browser that is already installed instead of
// the one Playwright downloads (npx playwright install chromium).
const executablePath = process.env.PW_CHROMIUM_PATH || undefined

export default defineConfig({
  testDir: './e2e',
  // The tests share one local database, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // Owners use this on their phone.
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: 'off',
    launchOptions: { executablePath },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
