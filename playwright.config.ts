import { defineConfig, devices } from '@playwright/test';

/**
 * La demo local: hace falta el stack (`npx supabase start`) y `npm run seed:demo`.
 * `webServer` arranca Angular; no arranca Supabase.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4200',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm start -- --host 127.0.0.1 --port 4200',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
