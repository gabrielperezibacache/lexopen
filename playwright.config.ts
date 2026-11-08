import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    // CI runners often send Accept-Language: en-US; LexOpen negotiates locale
    // from that header when lexopen_locale is unset. Pin Spanish for e2e.
    locale: "es-CL",
    extraHTTPHeaders: {
      "Accept-Language": "es-CL,es;q=0.9",
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: "hearing-live-transcription.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-audio",
      testMatch: "hearing-live-transcription.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testMatch: ["browser-smoke.spec.ts", "writing-review.spec.ts", "offline-workspace.spec.ts", "offline-records.spec.ts", "offline-links.spec.ts", "offline-legal.spec.ts", "offline-memos.spec.ts", "offline-files.spec.ts", "offline-operations.spec.ts", "whatsapp-link.spec.ts"],
      use: { ...devices["Desktop Firefox"], launchOptions: { timeout: 30_000 } },
    },
    {
      name: "webkit",
      testMatch: ["browser-smoke.spec.ts", "writing-review.spec.ts", "offline-workspace.spec.ts", "offline-records.spec.ts", "offline-links.spec.ts", "offline-legal.spec.ts", "offline-memos.spec.ts", "offline-files.spec.ts", "offline-operations.spec.ts", "whatsapp-link.spec.ts"],
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
