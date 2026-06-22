import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/**
 * Playwright drives the REAL built artifact (via `vite preview`), not the dev
 * server, so the suite catches CSS/asset regressions that only surface after a
 * production build — exactly the class of layout bug the vitest DOM tests miss.
 * The API is stubbed per-test with a fixture, so no poller/api/gateway is
 * needed and the run is fully deterministic.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
