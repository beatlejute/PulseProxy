/**
 * Popup Layout Visual Regression — скриншот-тесты layout попапа
 *
 * Покрывает визуальную проверку layout попапа после перехода на flex-растяжку:
 * 3 вкладки и 2 fullheight-модалки.
 *
 * Базовые скриншоты фиксируются через --update-snapshots после первого зелёного прогона.
 *
 * Тестовые сценарии:
 * 1. tab-proxies — вкладка прокси с 5 элементами в списке
 * 2. tab-presets — вкладка пресетов с 5 пресетами
 * 3. tab-promo — промо-вкладка (promo-link)
 * 4. modal-public-proxies — модалка публичных проксей открыта
 * 5. modal-preset-templates — модалка шаблонов открыта
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { launchExtension, openPopup } from './helpers/extension';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOTS_DIR = path.resolve(__dirname, '../__screenshots__/popup-layout-visual');

function ensureScreenshotsDir() {
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }
}

/**
 * Ожидает рендеринга UI попапа
 */
async function waitForPopupReady(popup: Page): Promise<void> {
    await popup.locator('#main-button, .welcome-button').waitFor({ state: 'visible', timeout: 10000 });
    await popup.waitForTimeout(1000);

    const welcomeBtn = popup.locator('.welcome-button');
    if (await welcomeBtn.isVisible().catch(() => false)) {
        await welcomeBtn.click();
        await popup.waitForTimeout(1000);
    }

    await popup.reload();
    await popup.waitForLoadState('domcontentloaded');
    await popup.locator('#main-button').waitFor({ state: 'visible', timeout: 10000 });
    await popup.waitForTimeout(1000);

    const welcomeBtnAfter = popup.locator('.welcome-button');
    if (await welcomeBtnAfter.isVisible().catch(() => false)) {
        await welcomeBtnAfter.click();
        await popup.waitForTimeout(1000);
    }
}

/**
 * Закрывает модалку если открыта
 */
async function dismissModalIfPresent(popup: Page): Promise<void> {
    const modalOverlay = popup.locator('.modal-overlay');
    if (await modalOverlay.isVisible().catch(() => false)) {
        await popup.keyboard.press('Escape');
        await popup.waitForTimeout(500);
    }
}

/**
 * Очищает storage
 */
async function clearStorage(popup: Page) {
    await popup.evaluate(() =>
        new Promise<void>(resolve => {
            chrome.storage.local.set({ proxies: [], presets: [] }, () => resolve());
        })
    );
}

/**
 * Создаёт прокси через Storage API
 */
async function createProxy(popup: Page, index: number): Promise<void> {
    await popup.evaluate(
        ({ index }) => {
            return new Promise<void>((resolve) => {
                chrome.storage.local.get('proxies', (data) => {
                    const proxies = data.proxies || [];
                    const newProxy = {
                        id: crypto.randomUUID(),
                        type: 'http',
                        host: `proxy${index}.example.com`,
                        port: 8080 + index,
                        isDefault: index === 0,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                    proxies.push(newProxy);
                    chrome.storage.local.set({ proxies }, () => resolve());
                });
            });
        },
        { index }
    );
}

/**
 * Создаёт пресет через Storage API
 */
async function createPreset(popup: Page, index: number): Promise<void> {
    await popup.evaluate(
        ({ index }) => {
            return new Promise<void>((resolve) => {
                chrome.storage.local.get('presets', (data) => {
                    const presets = data.presets || [];
                    const newPreset = {
                        id: crypto.randomUUID(),
                        name: `Preset ${index}`,
                        domains: [`example${index}.com`],
                        enabled: true,
                        isDefault: false,
                        order: index,
                        proxyId: null,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                    presets.push(newPreset);
                    chrome.storage.local.set({ presets }, () => resolve());
                });
            });
        },
        { index }
    );
}

/**
 * Переключает вкладку
 */
async function switchTab(popup: Page, tabName: string): Promise<void> {
    const tab = popup.locator(`[data-tab="${tabName}"]`);
    await expect(tab).toBeVisible({ timeout: 5000 });
    await tab.click();
    await popup.waitForTimeout(800);
}

/**
 * Открывает модалку публичных проксей
 */
async function openPublicProxiesModal(popup: Page): Promise<void> {
    const addProxyBtn = popup.locator('.add-proxy-btn');
    await expect(addProxyBtn).toBeVisible({ timeout: 10000 });
    await addProxyBtn.click();

    const modalOverlay = popup.locator('.modal-overlay');
    await expect(modalOverlay).toBeVisible({ timeout: 10000 });

    const publicOption = popup.locator('.proxy-type-option[data-type="public"]');
    await expect(publicOption).toBeVisible({ timeout: 5000 });
    await publicOption.click();

    const publicProxiesModal = popup.locator('.public-proxies-modal');
    await expect(publicProxiesModal).toBeVisible({ timeout: 15000 });
}

/**
 * Открывает модалку шаблонов пресетов
 */
async function openPresetTemplatesModal(popup: Page): Promise<void> {
    const addPresetBtn = popup.locator('#add-preset-button');
    await expect(addPresetBtn).toBeVisible({ timeout: 10000 });
    await addPresetBtn.click();

    const modalOverlay = popup.locator('.modal-overlay');
    await expect(modalOverlay).toBeVisible({ timeout: 10000 });

    const allOptions = await popup.locator('.preset-type-option').all();
    await expect(allOptions[1]).toBeVisible({ timeout: 5000 });
    await allOptions[1].click();

    const presetsModal = popup.locator('.preset-templates-modal');
    await expect(presetsModal).toBeVisible({ timeout: 15000 });
}

test.describe('Popup Layout Visual Regression — 3 tabs + 2 modals', () => {
    let context: BrowserContext;
    let popupUrl: string;
    let popup: Page;

    test.beforeAll(async () => {
        test.setTimeout(120000);
        ensureScreenshotsDir();
        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close().catch(() => {});
    });

    test.afterEach(async () => {
        await popup?.close().catch(() => {});
    });

    test('TC 135.1: tab-proxies — вкладка прокси с 5 элементами', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await clearStorage(popup);

        for (let i = 1; i <= 5; i++) {
            await createProxy(popup, i);
        }
        await popup.waitForTimeout(1000);

        await switchTab(popup, 'proxy');
        await popup.waitForTimeout(1000);

        const screenshot = await popup.screenshot();
        expect(screenshot).toMatchSnapshot('tab-proxies.png', { maxDiffPixelRatio: 0.02 });
    });

    test('TC 135.2: tab-presets — вкладка пресетов с 5 пресетами', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await clearStorage(popup);

        for (let i = 1; i <= 5; i++) {
            await createPreset(popup, i);
        }
        await popup.waitForTimeout(1000);

        await switchTab(popup, 'presets');
        await popup.waitForTimeout(1000);

        const screenshot = await popup.screenshot();
        expect(screenshot).toMatchSnapshot('tab-presets.png', { maxDiffPixelRatio: 0.02 });
    });

    test('TC 135.3: tab-promo — промо-вкладка', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);

        await switchTab(popup, 'settings');
        await popup.waitForTimeout(1000);

        const screenshot = await popup.screenshot();
        expect(screenshot).toMatchSnapshot('tab-promo.png', { maxDiffPixelRatio: 0.02 });
    });

    test('TC 135.4: modal-public-proxies — модалка публичных проксей', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        await openPublicProxiesModal(popup);
        await popup.waitForTimeout(1000);

        const screenshot = await popup.screenshot();
        expect(screenshot).toMatchSnapshot('modal-public-proxies.png', { maxDiffPixelRatio: 0.02 });
    });

    test('TC 135.5: modal-preset-templates — модалка шаблонов', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'presets');

        await openPresetTemplatesModal(popup);
        await popup.waitForTimeout(1000);

        const screenshot = await popup.screenshot();
        expect(screenshot).toMatchSnapshot('modal-preset-templates.png', { maxDiffPixelRatio: 0.02 });
    });
});
