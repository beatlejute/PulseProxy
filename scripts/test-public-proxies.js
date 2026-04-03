import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const reportsDir = join(__dirname, '..', 'reports');
if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
}

async function main() {
    const browser = await chromium.launch({ headless: false }); // headless: false to see UI
    const context = await browser.newContext({
        viewport: { width: 800, height: 600 }
    });
    const page = await context.newPage();

    // Load popup.html
    const popupPath = join(__dirname, '..', 'popup.html');
    await page.goto(`file://${popupPath}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Inject mock chrome API
    await page.addScriptTag({
        content: `
            window.chrome = {
                storage: {
                    local: {
                        get: (keys, callback) => callback({}),
                        set: (items, callback) => callback(),
                        clear: (callback) => callback(),
                        remove: (keys, callback) => callback(),
                        onChanged: {
                            addListener: () => {}
                        }
                    },
                    sync: {
                        get: (keys, callback) => callback({}),
                        set: (items, callback) => callback()
                    }
                },
                tabs: {
                    create: (props) => console.log('chrome.tabs.create', props)
                },
                runtime: {
                    lastError: null,
                    getManifest: () => ({})
                }
            };
        `
    });

    // Wait for app initialization
    await page.waitForTimeout(1000);

    // Take screenshot of initial popup
    await page.screenshot({ path: join(reportsDir, 'QA-026-screenshot-initial.png') });

    // Find and click "Add proxy" button
    const addProxyButton = await page.$('.add-proxy-btn');
    if (!addProxyButton) {
        console.error('Add proxy button not found');
        await browser.close();
        process.exit(1);
    }
    await addProxyButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(reportsDir, 'QA-026-screenshot-add-proxy-dialog.png') });

    // Find and click "Select from Public" button
    const publicProxyButton = await page.$('[data-type="public"]');
    if (!publicProxyButton) {
        console.error('Public proxy button not found');
        await browser.close();
        process.exit(1);
    }
    await publicProxyButton.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(reportsDir, 'QA-026-screenshot-public-proxies-modal.png') });

    // Check modal presence
    const modal = await page.$('.public-proxies-modal');
    if (!modal) {
        console.error('Public proxies modal not found');
        await browser.close();
        process.exit(1);
    }

    // Test search input
    const searchInput = await page.$('.public-proxy-search-input');
    if (!searchInput) {
        console.error('Search input not found');
    } else {
        await searchInput.fill('1.2.3.4:8080');
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(reportsDir, 'QA-026-screenshot-search-filled.png') });
        // Check if validation hint appears
        const validationHint = await page.$('.validation-hint');
        const hintVisible = validationHint ? await validationHint.isVisible() : false;
        console.log('Validation hint visible:', hintVisible);
    }

    // Test invalid format
    await searchInput.fill('invalid');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(reportsDir, 'QA-026-screenshot-invalid-search.png') });

    // Close modal
    const closeButton = await page.$('.modal-close-button');
    if (closeButton) {
        await closeButton.click();
    } else {
        // Press Escape
        await page.keyboard.press('Escape');
    }

    await page.waitForTimeout(500);
    await browser.close();

    console.log('Test completed successfully');
    console.log('Screenshots saved in', reportsDir);
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});