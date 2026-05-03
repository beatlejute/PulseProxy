/**
 * Modal Overlay Scope — проверка применения класса modal-overlay--fullheight
 *
 * Покрывает критерий:
 * Класс modal-overlay--fullheight должен быть ТОЛЬКО на двух модальных окнах:
 * - public-proxies-modal (публичные прокси)
 * - preset-templates-modal (шаблоны пресетов)
 *
 * Все остальные модальные окна (add-proxy, edit-proxy) НЕ должны иметь этот класс.
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { launchExtension, openPopup } from './helpers/extension';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACTS_DIR = path.resolve(__dirname, '../../reports');
const ARTIFACT_PREFIX = 'QA-134';

function ensureArtifactsDir() {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
}

/**
 * Ждём пока JS инициализирует UI, затем перезагружаем для полной инициализации
 * Если показан welcome/onboarding экран — кликаем "Начать"
 */
async function waitForPopupReady(popup: Page): Promise<void> {
    await popup.locator('#main-button, .welcome-button').waitFor({ state: 'visible', timeout: 10000 });
    await popup.waitForTimeout(1000);

    // Если показан welcome экран — кликаем "Начать"
    const welcomeBtn = popup.locator('.welcome-button');
    if (await welcomeBtn.isVisible().catch(() => false)) {
        await welcomeBtn.click();
        await popup.waitForTimeout(1000);
    }

    // Перезагружаем для полной инициализации JS модулей
    await popup.reload();
    await popup.waitForLoadState('domcontentloaded');
    await popup.locator('#main-button').waitFor({ state: 'visible', timeout: 10000 });
    await popup.waitForTimeout(1000);

    // Ещё раз проверяем welcome экран после reload
    const welcomeBtnAfter = popup.locator('.welcome-button');
    if (await welcomeBtnAfter.isVisible().catch(() => false)) {
        await welcomeBtnAfter.click();
        await popup.waitForTimeout(1000);
    }
}

/**
 * Закрываем модалку если открыта
 */
async function dismissModalIfPresent(popup: Page): Promise<void> {
    const modalOverlay = popup.locator('.modal-overlay');
    if (await modalOverlay.isVisible().catch(() => false)) {
        await popup.keyboard.press('Escape');
        await popup.waitForTimeout(500);
    }
}

/**
 * Очищает все прокси из storage перед тестом
 */
async function clearProxies(popup: Page) {
    await popup.evaluate(() =>
        new Promise(resolve => chrome.storage.local.set({ proxies: [] }, resolve))
    );
}

/**
 * Открывает модальное окно выбора типа прокси (Custom / Public)
 * и кликает на "Select from Public"
 */
async function openPublicProxiesModal(popup: Page): Promise<void> {
    // Нажимаем кнопку "+" (Add proxy) в списке прокси
    const addProxyBtn = popup.locator('.add-proxy-btn');
    await expect(addProxyBtn).toBeVisible({ timeout: 10000 });
    await addProxyBtn.click();

    // Ждём появления модального окна выбора типа
    const modalOverlay = popup.locator('.modal-overlay');
    await expect(modalOverlay).toBeVisible({ timeout: 10000 });

    // Кликаем на "Select from Public" (data-type="public")
    const publicOption = popup.locator('.proxy-type-option[data-type="public"]');
    await expect(publicOption).toBeVisible({ timeout: 5000 });
    await publicOption.click();

    // Ждём появления модального окна публичных прокси
    const publicProxiesModal = popup.locator('.public-proxies-modal');
    await expect(publicProxiesModal).toBeVisible({ timeout: 15000 });
}

/**
 * Открывает модальное окно добавления прокси (кастомный прокси)
 */
async function openAddProxyModal(popup: Page): Promise<void> {
    // Нажимаем кнопку "+" (Add proxy) в списке прокси
    const addProxyBtn = popup.locator('.add-proxy-btn');
    await expect(addProxyBtn).toBeVisible({ timeout: 10000 });
    await addProxyBtn.click();

    // Ждём появления модального окна выбора типа
    const modalOverlay = popup.locator('.modal-overlay');
    await expect(modalOverlay).toBeVisible({ timeout: 10000 });

    // Кликаем на "Create Custom" (data-type="custom")
    const customOption = popup.locator('.proxy-type-option[data-type="custom"]');
    await expect(customOption).toBeVisible({ timeout: 5000 });
    await customOption.click();

    // Ждём появления формы добавления прокси
    const proxyFormModal = popup.locator('.proxy-form-modal');
    await expect(proxyFormModal).toBeVisible({ timeout: 10000 });
}

/**
 * Переключаемся на вкладку proxy
 */
async function switchTab(popup: Page, tabName: string): Promise<void> {
    const tab = popup.locator(`.segment[data-tab="${tabName}"]`);
    await expect(tab).toBeVisible({ timeout: 5000 });
    await tab.click();
    await popup.waitForTimeout(800);
}

test.describe('Modal Overlay Scope — проверка класса modal-overlay--fullheight', () => {
    test.setTimeout(120000);

    let context: BrowserContext;
    let popupUrl: string;
    let popup: Page;

    test.beforeAll(async () => {
        test.setTimeout(120000);
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
        // Очищаем storage после каждого теста
        if (context) {
            const cleanupPopup = await openPopup(context, popupUrl);
            await clearProxies(cleanupPopup);
            await cleanupPopup.close();
        }
    });

    // TC 1.1: Открыть модалку публичных прокси → проверить modal-overlay--fullheight
    test('TC 1.1: публичные прокси имеют modal-overlay--fullheight', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        await openPublicProxiesModal(popup);

        // Проверяем что modal-overlay имеет класс modal-overlay--fullheight
        const modalOverlay = popup.locator('.modal-overlay');
        await expect(modalOverlay).toBeVisible();

        const hasFullheightClass = await modalOverlay.evaluate(el =>
            el.classList.contains('modal-overlay--fullheight')
        );
        expect(hasFullheightClass).toBe(true);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-1.1-public-proxies-fullheight.png`) });
    });

    // TC 1.2: Открыть модалку шаблонов пресетов → проверить modal-overlay--fullheight
    test('TC 1.2: шаблоны пресетов имеют modal-overlay--fullheight', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'presets');

        // Нажимаем "Add Preset"
        const addPresetBtn = popup.locator('#add-preset-button');
        await expect(addPresetBtn).toBeVisible({ timeout: 10000 });
        await addPresetBtn.click();

        // Ждём появления модального окна выбора типа пресета
        const modalOverlay = popup.locator('.modal-overlay');
        await expect(modalOverlay).toBeVisible({ timeout: 10000 });

        // Ищем второй вариант (Select Template)
        const allOptions = await popup.locator('.preset-type-option').all();
        await expect(allOptions[1]).toBeVisible({ timeout: 5000 });
        await allOptions[1].click();

        // Ждём появления модального окна с шаблонами
        const presetsModal = popup.locator('.preset-templates-modal');
        await expect(presetsModal).toBeVisible({ timeout: 15000 });

        // Проверяем что modal-overlay имеет класс modal-overlay--fullheight
        const overlayWithTemplate = popup.locator('.modal-overlay');
        await expect(overlayWithTemplate).toBeVisible();

        const hasFullheightClass = await overlayWithTemplate.evaluate(el =>
            el.classList.contains('modal-overlay--fullheight')
        );
        expect(hasFullheightClass).toBe(true);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-1.2-preset-templates-fullheight.png`) });
    });

    // TC 2.1: Открыть модалку добавления прокси → НЕ должна иметь modal-overlay--fullheight
    test('TC 2.1: модалка добавления прокси НЕ имеет modal-overlay--fullheight', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        await openAddProxyModal(popup);

        // Проверяем что modal-overlay НЕ имеет класс modal-overlay--fullheight
        const modalOverlay = popup.locator('.modal-overlay');
        await expect(modalOverlay).toBeVisible();

        const hasFullheightClass = await modalOverlay.evaluate(el =>
            el.classList.contains('modal-overlay--fullheight')
        );
        expect(hasFullheightClass).toBe(false);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.1-add-proxy-no-fullheight.png`) });
    });

    // TC 2.2: Открыть модалку редактирования прокси → НЕ должна иметь modal-overlay--fullheight
    test('TC 2.2: модалка редактирования прокси НЕ имеет modal-overlay--fullheight', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        // Сначала создаём прокси через storage, чтобы иметь его для редактирования
        await popup.evaluate(() =>
            new Promise(resolve => {
                const proxyData = {
                    proxies: [
                        {
                            id: 'test-proxy-1',
                            type: 'http',
                            host: '127.0.0.1',
                            port: 8080,
                            username: '',
                            password: '',
                            name: 'Test Proxy',
                            color: '#FF6B6B',
                            enabled: true
                        }
                    ]
                };
                chrome.storage.local.set(proxyData, resolve);
            })
        );

        // Закрываем текущий popup и создаём новый с обновленным storage
        await popup.close();
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        // Ждим, пока прокси отрендерится
        await popup.waitForTimeout(2000);

        // Кликаем на кнопку редактирования прокси
        const editProxyBtn = popup.locator('.edit-proxy-btn').first();
        await expect(editProxyBtn).toBeVisible({ timeout: 10000 });
        await editProxyBtn.click();

        // Ждём появления формы редактирования
        const proxyFormModal = popup.locator('.proxy-form-modal');
        await expect(proxyFormModal).toBeVisible({ timeout: 10000 });

        // Проверяем что modal-overlay НЕ имеет класс modal-overlay--fullheight
        const modalOverlay = popup.locator('.modal-overlay');
        await expect(modalOverlay).toBeVisible();

        const hasFullheightClass = await modalOverlay.evaluate(el =>
            el.classList.contains('modal-overlay--fullheight')
        );
        expect(hasFullheightClass).toBe(false);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.2-edit-proxy-no-fullheight.png`) });
    });
});
