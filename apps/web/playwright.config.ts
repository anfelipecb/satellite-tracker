import { defineConfig, devices } from '@playwright/test';

/**
 * `PLAYWRIGHT_BASE_URL` — local: http://127.0.0.1:3000, production: https://…vercel.app
 * Optional signed-in state: `PLAYWRIGHT_STORAGE_STATE=apps/web/e2e/.auth/user.json`
 * Create once: pnpm --filter web exec playwright codegen <url> --save-storage=apps/web/e2e/.auth/user.json
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const storageState = process.env.PLAYWRIGHT_STORAGE_STATE;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
    ...(storageState ? { storageState } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
