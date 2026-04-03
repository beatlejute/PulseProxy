const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, 'reports');

if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

async function takeScreenshot(page, name) {
    const screenshotPath = path.join(REPORTS_DIR, name);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
}

async function main() {
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--allow-file-access-from-files',
            '--allow-file-access'
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 400, height: 600 },
        ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (msg.type() === 'error' || text.includes('WARNING') || text.includes('i18n key')) {
            console.log(`[CONSOLE ${msg.type()}] ${text}`);
        }
    });
    page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`));

    try {
        const fileUrl = `file://${path.join(__dirname, 'test-popup.html')}`;
        console.log(`Opening ${fileUrl}`);
        await page.goto(fileUrl);
        await page.waitForSelector('.container');

        // ─── TC-5.1: Открыть модальное окно выбора типа прокси ───────────────
        console.log('\n=== TC-5.1: Open proxy type modal ===');
        await page.waitForSelector('.add-proxy-btn', { state: 'attached', timeout: 15000 });
        await takeScreenshot(page, 'QA-026-screenshot-TC-5.1-initial.png');

        await page.evaluate(() => {
            const btn = document.querySelector('.add-proxy-btn');
            if (btn) btn.click();
        });
        await page.waitForSelector('.proxy-type-option[data-type="public"]');
        await takeScreenshot(page, 'QA-026-screenshot-TC-5.1.png');
        console.log('TC-5.1: PASS - proxy type dialog opened');

        // ─── TC-5.2: Открыть модальное окно публичных прокси ─────────────────
        console.log('\n=== TC-5.2: Open public proxies modal ===');
        await page.click('.proxy-type-option[data-type="public"]');
        await page.waitForSelector('.public-proxies-modal');
        // Wait for proxies to load (they load from sources/proxys.json)
        await page.waitForSelector('.public-proxy-item', { timeout: 15000 });
        await takeScreenshot(page, 'QA-026-screenshot-TC-5.2.png');
        console.log('TC-5.2: PASS - public proxies modal opened with proxy list');

        // ─── TC-5.3: Поиск по IP:Port, выбор прокси, подтверждение ───────────
        console.log('\n=== TC-5.3: Search by IP:Port, add proxy ===');
        await page.fill('.public-proxy-search-input', '101.47.73.135:3128');
        await page.waitForTimeout(500);
        const proxyItems = await page.$$('.public-proxy-item');
        console.log(`Found ${proxyItems.length} proxy items for search`);
        await takeScreenshot(page, 'QA-026-screenshot-TC-5.3-search.png');

        if (proxyItems.length > 0) {
            await proxyItems[0].click();
            // Wait for confirmation dialog
            await page.waitForSelector('button.btn-save', { timeout: 5000 }).catch(async () => {
                // Try alternate selector for saveAnyway button
                await page.waitForSelector('button[data-action="saveAnyway"]', { timeout: 3000 }).catch(() => {});
            });
            await takeScreenshot(page, 'QA-026-screenshot-TC-5.3-confirm.png');

            // Check what buttons are available in the dialog
            const dialogButtons = await page.$$eval('button', btns =>
                btns.map(b => ({ text: b.textContent.trim(), className: b.className }))
            );
            console.log('Dialog buttons:', JSON.stringify(dialogButtons));

            // Click saveAnyway or equivalent confirmation button
            const saveBtn = await page.$('button.btn-save') ||
                           await page.$('button[class*="save"]') ||
                           await page.$('.confirm-dialog button:last-child') ||
                           await page.$('.modal-footer button:last-child');
            if (saveBtn) {
                const btnText = await saveBtn.textContent();
                console.log(`Clicking save button: "${btnText}"`);
                await saveBtn.click();
            } else {
                // Try clicking by text content
                const buttons = await page.$$('button');
                for (const btn of buttons) {
                    const text = await btn.textContent();
                    if (text.includes('save') || text.includes('Save') || text.includes('saveAnyway') || text.includes('Confirm')) {
                        console.log(`Clicking button: "${text}"`);
                        await btn.click();
                        break;
                    }
                }
            }
            await page.waitForTimeout(1500);

            // Navigate to proxy tab to show the list
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('.segment')).find(b => b.dataset.tab === 'proxy');
                if (btn) btn.click();
            });
            await page.waitForTimeout(500);
            await takeScreenshot(page, 'QA-026-screenshot-TC-5.3-after-save.png');

            // Check proxy list
            const proxyItemsInList = await page.$$('.proxy-item');
            console.log(`proxy-item count after add: ${proxyItemsInList.length}`);
            if (proxyItemsInList.length > 0) {
                console.log('TC-5.3: PASS - proxy added to list');
            } else {
                console.log('TC-5.3: FAIL or OBSERVATION - proxy not visible in list after adding');
            }
        } else {
            console.log('TC-5.3: BLOCKED - no proxy found for search term');
        }

        // ─── TC-5.4: Проверить отображение добавленного прокси ───────────────
        console.log('\n=== TC-5.4: Check added proxy display ===');
        await takeScreenshot(page, 'QA-026-screenshot-TC-5.4.png');
        const proxyListHtml = await page.$eval('#proxy-list-container', el => el.innerHTML).catch(() => '');
        console.log('Proxy list container HTML (first 500 chars):', proxyListHtml.substring(0, 500));

        // ─── TC-5.5: Поиск несуществующего IP ────────────────────────────────
        console.log('\n=== TC-5.5: Search non-existent IP ===');
        // Reopen public proxies modal
        await page.evaluate(() => {
            const btn = document.querySelector('.add-proxy-btn');
            if (btn) btn.click();
        });
        await page.waitForSelector('.proxy-type-option[data-type="public"]', { timeout: 5000 });
        await page.click('.proxy-type-option[data-type="public"]');
        await page.waitForSelector('.public-proxy-search-input', { timeout: 10000 });
        await page.waitForTimeout(1000);

        await page.fill('.public-proxy-search-input', '999.999.999.999:9999');
        await page.waitForTimeout(800);
        const noResultItems = await page.$$('.public-proxy-item');
        console.log(`Items for non-existent IP: ${noResultItems.length}`);

        // Check for empty state message
        const emptyMsg = await page.$('.public-proxies-empty');
        if (emptyMsg) {
            const emptyText = await emptyMsg.textContent();
            console.log(`Empty message: "${emptyText}"`);
        }
        await takeScreenshot(page, 'QA-026-screenshot-TC-5.5.png');

        if (noResultItems.length === 0) {
            console.log('TC-5.5: PASS - no results for non-existent IP');
        } else {
            console.log(`TC-5.5: FAIL - expected 0 results, got ${noResultItems.length}`);
        }

        // ─── TC-5.6: Поиск с невалидным форматом ─────────────────────────────
        console.log('\n=== TC-5.6: Search invalid format ===');
        await page.fill('.public-proxy-search-input', 'abc');
        await page.waitForTimeout(800);
        const invalidItems = await page.$$('.public-proxy-item');
        console.log(`Items for invalid format "abc": ${invalidItems.length}`);

        // Check for validation hint
        const validationHint = await page.$('.validation-hint, .search-hint, [class*="hint"], [class*="error"]');
        if (validationHint) {
            const hintText = await validationHint.textContent();
            const isVisible = await validationHint.isVisible();
            console.log(`Validation hint: visible=${isVisible}, text="${hintText}"`);
        } else {
            console.log('No validation hint element found');
        }
        await takeScreenshot(page, 'QA-026-screenshot-TC-5.6.png');

        // ─── Проверка i18n-ключей ──────────────────────────────────────────────
        console.log('\n=== i18n check ===');
        const i18nElements = await page.$$('[data-i18n]');
        const keysAsText = [];
        for (const el of i18nElements) {
            const text = await el.textContent();
            const key = await el.getAttribute('data-i18n');
            if (text && text.trim() === key) {
                keysAsText.push(key);
            }
        }
        console.log(`i18n keys shown as text (${keysAsText.length}):`, keysAsText.join(', '));

        console.log('\n=== Test completed ===');

    } catch (error) {
        console.error('Error during test:', error.message);
        await takeScreenshot(page, 'QA-026-screenshot-error.png').catch(() => {});
    } finally {
        await browser.close();
    }
}

main();
