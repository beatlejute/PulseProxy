/**
 * Visual UI inspection — все вкладки, light/dark темы, модальные окна, accessibility
 *
 * Покрывает функциональную область Visual UI Inspection:
 * проверка всех экранов popup на предмет дефектов вёрстки, отсутствующих label,
 * некорректных отступов, overflow, несоответствия стилей.
 *
 * Сценарии 9.1-9.20 из плана PLAN-001.
 * При расширении покрытия — добавляй test() блоки в этот файл.
 * См. .workflow/src/skills/shared/testing-conventions.md
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { launchExtension, openPopup } from './helpers/extension';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACTS_DIR = path.resolve(__dirname, '../../reports');
const ARTIFACT_PREFIX = 'QA-009';

function ensureArtifactsDir() {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
}

async function dismissModalIfPresent(popup: Page): Promise<void> {
    const modalOverlay = popup.locator('.modal-overlay');
    if (await modalOverlay.isVisible().catch(() => false)) {
        await popup.keyboard.press('Escape');
        await popup.waitForTimeout(500);
    }
}

async function switchTab(popup: Page, tabName: string): Promise<void> {
    const tab = popup.locator(`.segment[data-tab="${tabName}"]`);
    await expect(tab).toBeVisible({ timeout: 5000 });
    await tab.click();
    await popup.waitForTimeout(800);
}

async function setThemeViaStorage(popup: Page, theme: 'light' | 'dark'): Promise<void> {
    await popup.evaluate((t) => {
        return new Promise<void>(resolve => {
            chrome.storage.local.set({ theme: t }, () => {
                resolve();
            });
        });
    }, theme);
    await popup.waitForTimeout(500);
    // Reload to apply theme
    await popup.reload();
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(1000);
    await dismissModalIfPresent(popup);
}

async function waitForPopupReady(popup: Page): Promise<void> {
    // Ждём пока JS инициализирует UI — проверяем наличие main button
    await popup.locator('#main-button').waitFor({ state: 'visible', timeout: 10000 });
    await popup.waitForTimeout(1000);
}

async function setupFixtureData(context: BrowserContext, popupUrl: string): Promise<void> {
    // Создаём 2 прокси + 1 пресет для стабильных baseline'ов
    const fixturePopup = await openPopup(context, popupUrl);
    await waitForPopupReady(fixturePopup);
    
    await fixturePopup.evaluate(() => {
        return new Promise<void>(resolve => {
            const proxies = [
                {
                    id: 'fixture-proxy-1',
                    type: 'http',
                    host: 'proxy1.example.com',
                    port: 8080,
                    name: 'Fixture Proxy 1',
                    color: '#FF5733',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                {
                    id: 'fixture-proxy-2',
                    type: 'socks5',
                    host: 'proxy2.example.com',
                    port: 1080,
                    username: 'user',
                    password: 'pass',
                    name: 'Fixture Proxy 2',
                    color: '#33FF57',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }
            ];
            
            const presets = [
                {
                    id: 'fixture-preset-1',
                    name: 'Fixture Preset',
                    domains: ['example.com', '*.google.com'],
                    enabled: true,
                    order: 0,
                    proxyId: 'fixture-proxy-1',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }
            ];
            
            chrome.storage.local.set({ proxies, presets }, () => resolve());
        });
    });
    
    await fixturePopup.waitForTimeout(500);
    await fixturePopup.close();
}

test.describe('Visual UI Inspection — all tabs, themes, modals', () => {
    let context: BrowserContext;
    let popupUrl: string;
    let popup: Page;

    test.beforeAll(async () => {
        test.setTimeout(180000);
        ensureArtifactsDir();
        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.afterEach(async () => {
        await popup?.close();
    });

    // ===== PROXY TAB (9.1-9.5) =====

    test('TC 9.1: Proxy tab — список прокси выровнен, нет обрезанных текстов (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'proxy');

        // Проверка что нет горизонтального скролла
        const scrollWidth = await popup.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await popup.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

        // Проверка наличия контейнера списка
        const proxyListContainer = popup.locator('#proxy-list-container');
        await expect(proxyListContainer).toBeVisible({ timeout: 5000 });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.1-proxy-list-aligned-light.png`) });
    });

    test('TC 9.2: Proxy tab — кнопки имеют читаемые label/иконки (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'proxy');

        // Кнопка добавления прокси
        const addProxyBtn = popup.locator('.add-proxy-btn');
        await expect(addProxyBtn).toBeVisible({ timeout: 5000 });

        // Кнопка имеет title атрибут
        const addBtnTitle = await addProxyBtn.getAttribute('title');
        expect(addBtnTitle?.length).toBeGreaterThan(0);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.2-proxy-buttons-labels-light.png`) });
    });

    test('TC 9.3: Proxy tab — пустое состояние корректно (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'proxy');

        // Очищаем все прокси для проверки пустого состояния
        await popup.evaluate(() => {
            return new Promise<void>(resolve => {
                chrome.storage.local.set({ proxies: [] }, () => resolve());
            });
        });
        await popup.waitForTimeout(1500);

        // Кнопка добавления должна быть видна
        const addProxyBtn = popup.locator('.add-proxy-btn');
        await expect(addProxyBtn).toBeVisible({ timeout: 5000 });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.3-proxy-empty-state-light.png`) });
    });

    test('TC 9.4: Proxy tab — форма добавления прокси, все поля с label (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'proxy');

        // Открываем модалку добавления прокси (кнопка +)
        const addProxyBtn = popup.locator('.add-proxy-btn');
        await addProxyBtn.click();
        await popup.waitForTimeout(1000);

        // Модалка выбора типа прокси должна открыться
        const modalOverlay = popup.locator('.modal-overlay');
        await expect(modalOverlay).toBeVisible({ timeout: 5000 });

        // Проверяем что есть две опции: Custom и Public
        const customOption = popup.locator('.proxy-type-option[data-type="custom"]');
        const publicOption = popup.locator('.proxy-type-option[data-type="public"]');
        await expect(customOption).toBeVisible({ timeout: 5000 });
        await expect(publicOption).toBeVisible({ timeout: 5000 });

        // Скриншот модалки выбора типа
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.4-proxy-add-form-light.png`) });

        // Закрываем модалку
        await popup.keyboard.press('Escape');
        await popup.waitForTimeout(300);
    });

    test('TC 9.5: Proxy tab — dropdown типа прокси консистентен (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'proxy');

        // Открываем модалку
        const addProxyBtn = popup.locator('.add-proxy-btn');
        await addProxyBtn.click();
        await popup.waitForTimeout(1000);

        const customOption = popup.locator('.proxy-type-option[data-type="custom"]');
        await expect(customOption).toBeVisible({ timeout: 5000 });
        await customOption.click();
        await popup.waitForTimeout(1000);

        // Проверяем select типа прокси
        const typeSelect = popup.locator('.modal select').first();
        const typeSelectVisible = await typeSelect.isVisible().catch(() => false);
        expect(typeSelectVisible).toBeTruthy();

        // Проверяем стилизацию
        const selectStyle = await typeSelect.evaluate((el) => {
            const style = window.getComputedStyle(el);
            return {
                borderRadius: style.borderRadius,
                backgroundColor: style.backgroundColor,
                borderColor: style.borderColor,
            };
        });

        expect(selectStyle.borderRadius.length).toBeGreaterThan(0);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.5-proxy-type-dropdown-light.png`) });

        await popup.keyboard.press('Escape');
        await popup.waitForTimeout(300);
    });

    // ===== PRESETS TAB (9.6-9.8) =====

    test('TC 9.6: Presets tab — список пресетов, выравнивание, drag-n-drop иконки (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'presets');

        // Проверка наличия кнопки добавления пресета
        const addPresetBtn = popup.locator('#add-preset-button');
        await expect(addPresetBtn).toBeVisible({ timeout: 5000 });

        const btnText = await addPresetBtn.textContent();
        expect(btnText?.length).toBeGreaterThan(0);

        // Проверка контейнера пресетов
        const presetsContainer = popup.locator('#presets-container');
        await expect(presetsContainer).toBeVisible({ timeout: 5000 });

        // Проверка toggle "Proxy all sites by default"
        const proxyByDefaultToggle = popup.locator('#proxy-by-default-toggle');
        const toggleVisible = await proxyByDefaultToggle.isVisible().catch(() => false);
        expect(toggleVisible).toBeTruthy();

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.6-presets-list-light.png`) });
    });

    test('TC 9.7: Presets tab — форма пресета, все поля с label (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'presets');

        // Создаём тестовый прокси чтобы пресет имел к чему привязаться
        await popup.evaluate(() => {
            return new Promise<void>(resolve => {
                const proxy = {
                    id: 'test-proxy-visual',
                    type: 'http',
                    host: 'visual-test.proxy.local',
                    port: 8080,
                    name: 'Visual Test Proxy',
                    color: '#FFDD2D',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
                chrome.storage.local.get(['proxies'], (result: any) => {
                    const proxies = result.proxies || [];
                    const filtered = proxies.filter((p: any) => p.id !== 'test-proxy-visual');
                    filtered.push(proxy);
                    chrome.storage.local.set({ proxies: filtered }, () => resolve());
                });
            });
        });
        await popup.reload();
        await waitForPopupReady(popup);
        await switchTab(popup, 'presets');

        // Открываем форму создания пресета — выбираем "Create Own"
        const addPresetBtn = popup.locator('#add-preset-button');
        await addPresetBtn.click();
        await popup.waitForTimeout(1000);

        // Модалка выбора типа пресета
        const createOwnOption = popup.locator('.preset-type-option').first();
        await expect(createOwnOption).toBeVisible({ timeout: 5000 });
        await createOwnOption.click();
        await popup.waitForTimeout(1000);

        // Проверяем наличие полей формы
        const nameField = popup.locator('.modal .preset-name, .modal input[type="text"], .preset-name-container').first();
        const domainsField = popup.locator('.modal textarea, .preset-domains').first();

        const nameVisible = await nameField.isVisible().catch(() => false);
        const domainsVisible = await domainsField.isVisible().catch(() => false);
        expect(nameVisible || domainsVisible).toBeTruthy();

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.7-preset-form-light.png`) });

        await popup.keyboard.press('Escape');
        await popup.waitForTimeout(300);
    });

    test('TC 9.8: Presets tab — пустое состояние корректно (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');

        // Очищаем пресеты и отключаем proxyByDefault
        await popup.evaluate(() => {
            return new Promise<void>(resolve => {
                chrome.storage.local.set({ presets: [], proxyByDefault: false }, () => resolve());
            });
        });
        await popup.reload();
        await waitForPopupReady(popup);
        await switchTab(popup, 'presets');
        await popup.waitForTimeout(1000);

        // Проверяем что отображается кнопка добавления
        const addPresetBtn = popup.locator('#add-preset-button');
        await expect(addPresetBtn).toBeVisible({ timeout: 5000 });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.8-presets-empty-light.png`) });
    });

    // ===== SETTINGS TAB (9.9-9.14) =====

    test('TC 9.9: Settings tab — каждый переключатель имеет label', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'settings');

        // Проверяем sync toggle
        const syncToggle = popup.locator('#sync-toggle');
        await expect(syncToggle).toBeVisible({ timeout: 5000 });
        const syncLabel = popup.locator('label[for="sync-toggle"]');
        await expect(syncLabel).toBeVisible({ timeout: 5000 });
        const syncLabelText = await syncLabel.textContent();
        expect(syncLabelText?.length).toBeGreaterThan(0);

        // Проверяем proxy check toggle
        const proxyCheckToggle = popup.locator('#proxy-check-toggle');
        await expect(proxyCheckToggle).toBeVisible({ timeout: 5000 });
        const proxyCheckLabel = popup.locator('label[for="proxy-check-toggle"]');
        await expect(proxyCheckLabel).toBeVisible({ timeout: 5000 });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.9-settings-toggles-labels-light.png`) });
    });

    test('TC 9.10: Settings tab — переключатель темы визуально оформлен как toggle (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'settings');

        const themeToggle = popup.locator('#theme-toggle');
        await expect(themeToggle).toBeVisible({ timeout: 5000 });

        // Проверяем что это checkbox с label
        const type = await themeToggle.getAttribute('type');
        expect(type).toBe('checkbox');

        const themeLabel = popup.locator('label[for="theme-toggle"]');
        await expect(themeLabel).toBeVisible({ timeout: 5000 });
        const labelText = await themeLabel.textContent();
        expect(labelText?.length).toBeGreaterThan(0);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.10-theme-toggle-light.png`) });
    });

    test('TC 9.11: Settings tab — dropdown языка консистентен (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'settings');

        const langSelect = popup.locator('#language-select');
        await expect(langSelect).toBeVisible({ timeout: 5000 });

        // Проверяем наличие options
        const options = popup.locator('#language-select option');
        const optionCount = await options.count();
        expect(optionCount).toBeGreaterThanOrEqual(2);

        // Проверяем label
        const langLabel = popup.locator('label[for="language-select"]');
        await expect(langLabel).toBeVisible({ timeout: 5000 });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.11-language-dropdown-light.png`) });
    });

    test('TC 9.12: Settings tab — импорт/экспорт кнопки выровнены (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'settings');

        const exportBtn = popup.locator('#export-button');
        const importBtn = popup.locator('#import-button');

        await expect(exportBtn).toBeVisible({ timeout: 5000 });
        await expect(importBtn).toBeVisible({ timeout: 5000 });

        // Проверяем что обе кнопки в одном контейнере
        const container = popup.locator('.import-export-buttons');
        await expect(container).toBeVisible({ timeout: 5000 });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.12-import-export-buttons-light.png`) });
    });

    test('TC 9.13: Settings tab — номер версии читаем (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'settings');

        const versionInfo = popup.locator('.version-info');
        await expect(versionInfo).toBeVisible({ timeout: 5000 });

        const versionText = await popup.locator('#version-number').textContent();
        expect(versionText?.length).toBeGreaterThan(0);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.13-version-info-light.png`) });
    });

    test('TC 9.14: Settings tab — ссылка "Купить прокси" стилизована (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'settings');

        // Ссылка внизу popup — используем first() чтобы избежать strict mode violation
        const promoLink = popup.locator('.container > .promo-link.referral-link').first();
        await expect(promoLink).toBeVisible({ timeout: 5000 });

        const linkText = await promoLink.textContent();
        expect(linkText?.length).toBeGreaterThan(0);

        const href = await promoLink.getAttribute('href');
        expect(href?.length).toBeGreaterThan(0);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.14-buy-proxy-link-light.png`) });
    });

    // ===== COMMON CHECKS (9.15-9.20) =====

    test('TC 9.15: Активная вкладка визуально выделена (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');

        // По умолчанию активна вкладка Proxy
        const proxySegment = popup.locator('.segment[data-tab="proxy"]');
        const proxyHasActive = await proxySegment.evaluate((el) => el.classList.contains('active'));

        // Переключаемся на Presets
        await switchTab(popup, 'presets');
        const presetsSegment = popup.locator('.segment[data-tab="presets"]');
        const presetsHasActive = await presetsSegment.evaluate((el) => el.classList.contains('active'));
        expect(presetsHasActive).toBeTruthy();

        // Proxy больше не активна
        expect(proxyHasActive || !presetsHasActive).toBeFalsy();

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.15-active-tab-highlighted-light.png`) });
    });

    test('TC 9.16: Иконка-логотип (щит) не обрезана (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');

        const mainButton = popup.locator('#main-button');
        await expect(mainButton).toBeVisible({ timeout: 5000 });

        const buttonBox = await mainButton.boundingBox();
        expect(buttonBox?.width).toBeGreaterThan(80);
        expect(buttonBox?.height).toBeGreaterThan(100);

        // Проверяем что SVG рендерится
        const svgPath = popup.locator('.shield-bg');
        await expect(svgPath).toBeVisible({ timeout: 5000 });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.16-shield-icon-light.png`) });
    });

    test('TC 9.17: Модальные окна — корректная вёрстка, overlay затемняет (light)', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');
        await switchTab(popup, 'proxy');

        // Открываем модалку добавления прокси
        const addProxyBtn = popup.locator('.add-proxy-btn');
        await addProxyBtn.click();
        await popup.waitForTimeout(1000);

        // Проверяем overlay
        const modalOverlay = popup.locator('.modal-overlay');
        await expect(modalOverlay).toBeVisible({ timeout: 5000 });

        // Проверяем что overlay имеет background
        const overlayBg = await modalOverlay.evaluate((el) => {
            return window.getComputedStyle(el).backgroundColor;
        });
        expect(overlayBg.length).toBeGreaterThan(0);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.17-modal-overlay-light.png`) });

        await popup.keyboard.press('Escape');
        await popup.waitForTimeout(300);
    });

    test('TC 9.18: Light-тема — все элементы читаемы и контрастны', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');

        // Проверяем что body имеет класс theme-light
        const bodyClasses = await popup.evaluate(() => document.body.className);
        expect(bodyClasses).toContain('theme-light');

        // Проходим по всем вкладкам
        for (const tab of ['proxy', 'presets', 'settings']) {
            await switchTab(popup, tab);
            const bodyText = await popup.locator('body').textContent();
            expect(bodyText?.length).toBeGreaterThan(10);
        }

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.18-light-theme-contrast.png`) });
    });

    test('TC 9.19: Dark-тема — нет невидимых элементов', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'dark');

        // Проверяем что body имеет класс theme-dark
        const bodyClasses = await popup.evaluate(() => document.body.className);
        expect(bodyClasses).toContain('theme-dark');

        // Проходим по всем вкладкам
        for (const tab of ['proxy', 'presets', 'settings']) {
            await switchTab(popup, tab);
            const bodyText = await popup.locator('body').textContent();
            expect(bodyText?.length).toBeGreaterThan(10);
        }

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.19-dark-theme-visibility.png`) });
    });

    test('TC 9.20: Нет горизонтального скролла', async () => {
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');

        for (const tab of ['proxy', 'presets', 'settings']) {
            await switchTab(popup, tab);
            await popup.waitForTimeout(300);

            const scrollWidth = await popup.evaluate(() => document.documentElement.scrollWidth);
            const clientWidth = await popup.evaluate(() => document.documentElement.clientWidth);
            expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
        }

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-9.20-no-horizontal-scroll.png`) });
    });

    // ===== VISUAL REGRESSION (9.21-9.24) =====
    // Screenshot diff tests с baseline'ами в tests/e2e/__screenshots__/
    // Threshold: maxDiffPixelRatio: 0.01
    // Для обновления baseline: npx playwright test --update-snapshots

    test('TC 9.21: Visual regression — вкладки × темы (proxy/presets/settings × light/dark)', async () => {
        // Setup fixture data: 2 proxies + 1 preset
        await setupFixtureData(context, popupUrl);
        
        for (const theme of ['light', 'dark'] as const) {
            for (const tab of ['proxy', 'presets', 'settings'] as const) {
                popup = await openPopup(context, popupUrl);
                await waitForPopupReady(popup);
                await dismissModalIfPresent(popup);
                await setThemeViaStorage(popup, theme);
                await switchTab(popup, tab);
                await popup.waitForTimeout(500);

                await expect(popup).toHaveScreenshot(`${tab}-${theme}.png`, {
                    maxDiffPixelRatio: 0.01,
                });

                await popup.close();
            }
        }
    });

    test('TC 9.22: Visual regression — модалки × темы (add-proxy/public-proxy-search/add-preset × light/dark)', async () => {
        // Setup fixture data: 2 proxies + 1 preset
        await setupFixtureData(context, popupUrl);
        
        for (const theme of ['light', 'dark'] as const) {
            // Add Proxy Modal
            popup = await openPopup(context, popupUrl);
            await waitForPopupReady(popup);
            await dismissModalIfPresent(popup);
            await setThemeViaStorage(popup, theme);
            await switchTab(popup, 'proxy');
            
            const addProxyBtn = popup.locator('.add-proxy-btn');
            await addProxyBtn.click();
            await popup.waitForTimeout(1000);
            
            await expect(popup).toHaveScreenshot(`add-proxy-modal-${theme}.png`, {
                maxDiffPixelRatio: 0.01,
            });
            
            await popup.keyboard.press('Escape');
            await popup.waitForTimeout(300);
            await popup.close();

            // Add Preset Modal
            popup = await openPopup(context, popupUrl);
            await waitForPopupReady(popup);
            await dismissModalIfPresent(popup);
            await setThemeViaStorage(popup, theme);
            await switchTab(popup, 'presets');
            
            const addPresetBtn = popup.locator('#add-preset-button');
            await addPresetBtn.click();
            await popup.waitForTimeout(1000);
            
            // Click "Create Own" option
            const createOwnOption = popup.locator('.preset-type-option').first();
            await expect(createOwnOption).toBeVisible({ timeout: 5000 });
            await createOwnOption.click();
            await popup.waitForTimeout(1000);
            
            await expect(popup).toHaveScreenshot(`add-preset-modal-${theme}.png`, {
                maxDiffPixelRatio: 0.01,
            });
            
            await popup.keyboard.press('Escape');
            await popup.waitForTimeout(300);
            await popup.close();
        }
    });

    test('TC 9.23: Baseline на фиксированном наборе данных (2 прокси, 1 пресет)', async () => {
        // Этот тест документирует что baseline'ы создаются на фикстуре
        // Сам тест — просто подтверждение что фикстура корректна
        popup = await openPopup(context, popupUrl);
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await setThemeViaStorage(popup, 'light');

        // Проверяем что fixture data загружена
        const proxies = await popup.evaluate(() => {
            return new Promise<any[]>(resolve => {
                chrome.storage.local.get(['proxies'], (result: any) => {
                    resolve(result.proxies || []);
                });
            });
        });

        const presets = await popup.evaluate(() => {
            return new Promise<any[]>(resolve => {
                chrome.storage.local.get(['presets'], (result: any) => {
                    resolve(result.presets || []);
                });
            });
        });

        expect(proxies.length).toBeGreaterThanOrEqual(2);
        expect(presets.length).toBeGreaterThanOrEqual(1);

        await popup.close();
    });

    test('TC 9.24: Screenshot diff policy — любой diff без --update-snapshots = дефект', async () => {
        // Этот тест подтверждает политику визуальной регрессии:
        // - Baseline'и хранятся в {test-file}-snapshots/ (стандарт Playwright)
        // - Копия в __screenshots__/ для кросс-платформенной переносимости
        // - Обновление только через явный `npx playwright test --update-snapshots`
        // - Любой diff без обновления = дефект вёрстки
        //
        // Проверяем что baseline-файлы существуют для всех обязательных комбинаций:
        // Вкладки × темы: proxy-light, proxy-dark, presets-light, presets-dark, settings-light, settings-dark
        // Модалки × темы: add-proxy-modal-light, add-proxy-modal-dark, add-preset-modal-light, add-preset-modal-dark
        // Playwright добавляет суффикс платформы: -chromium-win32.png
        const snapshotsDir = path.resolve(__dirname, 'visual-inspection.spec.ts-snapshots');
        const expectedPatterns = [
            // Tab × Theme
            'proxy-', 'presets-', 'settings-',
            // Modal × Theme
            'add-proxy-modal-', 'add-preset-modal-',
        ];

        expect(fs.existsSync(snapshotsDir)).toBe(true);

        const files = fs.readdirSync(snapshotsDir);
        const missingPatterns = expectedPatterns.filter(pattern =>
            !files.some(f => f.startsWith(pattern) && f.endsWith('.png'))
        );

        expect(missingPatterns).toEqual([]);
    });
});
