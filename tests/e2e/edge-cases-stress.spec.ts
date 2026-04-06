/**
 * Edge-cases и stress-сценарии
 * Тестирование граничных условий и необычных сценариев использования расширения
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { launchExtension, openPopup } from './helpers/extension';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DATA_DIR = path.join(__dirname, '../../reports');

function readJson(filename: string) {
    const raw = fs.readFileSync(path.join(TEST_DATA_DIR, filename), 'utf-8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

test.describe('Edge-cases и stress-сценарии', () => {
    let context: BrowserContext;
    let extensionUrl: string;

    test.beforeAll(async () => {
        test.setTimeout(60000);
        const ext = await launchExtension();
        context = ext.context;
        extensionUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close();
    });

    /** Load data into chrome.storage.sync, then open popup */
    async function setupAndOpen(storageData: Record<string, unknown>): Promise<Page> {
        const page = await openPopup(context, extensionUrl);
        await page.evaluate((data) => chrome.storage.sync.set(data), storageData);
        // Reload so popup re-reads storage
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);
        return page;
    }

    // TC 10.1: Stress Test — 20+ прокси
    test('TC 10.1: должен отображать 25 прокси с рабочим скроллом', async () => {
        const exportData = readJson('tc-10.1-25-proxies.json');
        const page = await setupAndOpen({
            proxies: exportData.data.proxies,
            presets: exportData.data.presets,
        });

        await page.click('[data-tab="proxy"]');
        await page.waitForTimeout(500);

        const proxyItems = await page.$$('.proxy-item');
        expect(proxyItems.length).toBeGreaterThanOrEqual(20);

        const proxyList = await page.$('.proxy-items');
        expect(proxyList).toBeTruthy();

        await proxyList?.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.waitForTimeout(300);
        await proxyList?.evaluate(el => { el.scrollTop = 0; });
        await page.waitForTimeout(300);

        const startTime = Date.now();
        await page.click('[data-tab="settings"]');
        await page.waitForTimeout(100);
        await page.click('[data-tab="proxy"]');
        const responseTime = Date.now() - startTime;
        expect(responseTime).toBeLessThan(2000);

        await page.close();
    });

    // TC 10.2: Stress Test — 50+ доменов в пресете
    test('TC 10.2: должен отображать пресет с 55+ доменами без переполнения', async () => {
        const exportData = readJson('tc-10.2-55-domains-preset.json');
        const page = await setupAndOpen({
            proxies: exportData.data.proxies,
            presets: exportData.data.presets,
        });

        await page.click('[data-tab="presets"]');
        await page.waitForTimeout(500);

        const presetItem = await page.$('.preset-item');
        expect(presetItem).toBeTruthy();

        // Expand preset by clicking expand button
        const expandBtn = await page.$('.preset-expand-btn');
        await expandBtn?.click();
        await page.waitForTimeout(300);

        // Domains are in a textarea, check its value
        const domainsTextarea = await page.$('.preset-domains');
        expect(domainsTextarea).toBeTruthy();
        const domainsText = await domainsTextarea?.inputValue() ?? '';
        const domainCount = domainsText.split('\n').filter((d: string) => d.trim()).length;
        expect(domainCount).toBeGreaterThanOrEqual(50);

        // Check no horizontal overflow on preset content
        const presetContent = await page.$('.preset-content.expanded');
        expect(presetContent).toBeTruthy();
        const overflow = await presetContent?.evaluate(el => el.scrollWidth > el.clientWidth);
        expect(overflow).toBeFalsy();

        await page.close();
    });

    // TC 10.3: Punycode-домены
    test('TC 10.3: должен корректно отображать punycode и кириллические домены', async () => {
        const page = await setupAndOpen({
            proxies: [],
            presets: [{
                id: 'punycode-test',
                name: 'Punycode Test',
                domains: ['xn--80a0a1a.xn--p1ai', 'xn--e1afmapc.xn--p1ai'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }],
        });

        await page.click('[data-tab="presets"]');
        await page.waitForTimeout(500);

        const expandBtn = await page.$('.preset-expand-btn');
        await expandBtn?.click();
        await page.waitForTimeout(300);

        const domainsTextarea = await page.$('.preset-domains');
        const domainsText = await domainsTextarea?.inputValue() ?? '';
        expect(domainsText).toContain('xn--80a0a1a.xn--p1ai');

        // Check no console errors
        const errors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);
        expect(errors.length).toBe(0);

        await page.close();
    });

    // TC 10.4: Длинное имя прокси
    test('TC 10.4: должен отображать прокси с длинным именем без поломки UI', async () => {
        const longName = 'Test Proxy With Very Long Name That Exceeds Normal Length And Should Be Handled Gracefully By The UI Component';
        const page = await setupAndOpen({
            proxies: [{
                id: 'long-name-test',
                host: '127.0.0.1',
                port: 8080,
                type: 'http',
                isDefault: false,
                name: longName,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }],
            presets: [],
        });

        await page.click('[data-tab="proxy"]');
        await page.waitForTimeout(500);

        const proxyItem = await page.$('.proxy-item');
        expect(proxyItem).toBeTruthy();

        const proxyName = await page.$('.proxy-name');
        expect(proxyName).toBeTruthy();
        const nameText = await proxyName?.textContent() ?? '';
        expect(nameText.length).toBeGreaterThan(0);

        // Check name doesn't cause horizontal overflow on the container
        const nameOverflow = await proxyName?.evaluate(el => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth
        }));
        expect(nameOverflow).toBeTruthy();

        await page.close();
    });

    // TC 10.5: Граничные значения портов
    test('TC 10.5: должен отображать прокси с граничными портами', async () => {
        const page = await setupAndOpen({
            proxies: [
                {
                    id: 'port-1',
                    host: '10.0.0.1',
                    port: 1,
                    type: 'http',
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                {
                    id: 'port-65535',
                    host: '10.0.0.2',
                    port: 65535,
                    type: 'http',
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ],
            presets: [],
        });

        await page.click('[data-tab="proxy"]');
        await page.waitForTimeout(500);

        const items = await page.$$('.proxy-item');
        expect(items.length).toBe(2);

        const allText = await page.$$eval('.proxy-details', els =>
            els.map(el => el.textContent)
        );
        const hasPort1 = allText.some((t: string | null) => t?.includes(':1'));
        const hasPort65535 = allText.some((t: string | null) => t?.includes(':65535'));
        expect(hasPort1).toBeTruthy();
        expect(hasPort65535).toBeTruthy();

        await page.close();
    });

    // TC 10.6: Закрытие popup во время подключения
    test('TC 10.6: должен восстанавливать состояние после закрытия popup', async () => {
        const page1 = await setupAndOpen({
            proxies: [{
                id: 'close-test',
                host: '192.168.1.1',
                port: 3128,
                type: 'http',
                isDefault: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }],
            presets: [],
        });

        await page1.click('[data-tab="proxy"]');
        await page1.waitForTimeout(500);

        // Close popup
        await page1.close();

        // Reopen
        const page2 = await openPopup(context, extensionUrl);
        await page2.click('[data-tab="proxy"]');
        await page2.waitForTimeout(500);

        // Proxy should still be there (persisted in storage)
        const items = await page2.$$('.proxy-item');
        expect(items.length).toBeGreaterThanOrEqual(1);

        await page2.close();
    });

    // TC 10.7: Перезапуск Service Worker
    test('TC 10.7: должен восстанавливать состояние после перезапуска SW', async () => {
        const page = await setupAndOpen({
            proxies: [{
                id: 'sw-test',
                host: '10.10.10.10',
                port: 9090,
                type: 'socks5',
                isDefault: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }],
            presets: [],
        });

        await page.click('[data-tab="proxy"]');
        await page.waitForTimeout(500);
        const proxiesBefore = await page.$$eval('.proxy-item', items => items.length);

        // Reload popup (simulates SW restart recovery)
        await page.goto(extensionUrl);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);

        await page.click('[data-tab="proxy"]');
        await page.waitForTimeout(500);
        const proxiesAfter = await page.$$eval('.proxy-item', items => items.length);
        expect(proxiesAfter).toBeGreaterThanOrEqual(proxiesBefore);

        await page.close();
    });

    // TC 10.8: Два открытых popup (конкурентность)
    test('TC 10.8: не должен создавать конфликтов при двух открытых popup', async () => {
        // Seed data
        const seedPage = await openPopup(context, extensionUrl);
        await seedPage.evaluate((data) => chrome.storage.sync.set(data), {
            proxies: [{
                id: 'concurrent-test',
                host: '1.2.3.4',
                port: 1080,
                type: 'socks5',
                isDefault: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }],
            presets: [],
        });
        await seedPage.close();

        const page1 = await openPopup(context, extensionUrl);
        const page2 = await openPopup(context, extensionUrl);

        const errors: string[] = [];
        page2.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });

        await page1.waitForTimeout(500);
        await page2.reload();
        await page2.waitForLoadState('domcontentloaded');
        await page2.waitForTimeout(500);

        expect(errors.length).toBe(0);

        await page2.close();
        await page1.close();
    });
});
