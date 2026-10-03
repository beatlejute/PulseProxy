import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['list'],
        ['json', { outputFile: 'reports/qa-031-test-results.json' }]
    ],
    use: {
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        // Без окна; окно для отладки — HEADED=1 (или флаг --headed).
        channel: 'chromium',
        headless: process.env.HEADED !== '1',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],
    outputDir: 'reports/playwright-results',
});
