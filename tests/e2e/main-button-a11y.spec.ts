/**
 * Main Button A11y — тесты accessibility атрибутов role="switch" и aria-pressed
 *
 * Покрывает функциональную область Accessibility (a11y) главной кнопки подключения:
 * проверка role="switch" как статического атрибута,
 * проверка aria-pressed в всех 4 состояниях приложения (connected, disconnected, connecting, error).
 *
 * При расширении покрытия (новые a11y сценарии) — добавляй test() блоки в этот файл.
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
const ARTIFACT_PREFIX_126 = 'QA-126';
const ARTIFACT_PREFIX_127 = 'QA-127';

function ensureArtifactsDir() {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
}

/**
 * Устанавливает состояние currentState через Storage API
 */
async function setProxyState(popup: Page, state: 'connected' | 'disconnected' | 'connecting' | 'error') {
    await popup.evaluate(
        ({ state }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.set({ currentState: state }, () => resolve());
            });
        },
        { state }
    );
}

/**
 * Устанавливает язык интерфейса через Storage API
 */
async function setLanguage(popup: Page, language: string) {
    await popup.evaluate(
        ({ language }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.set({ language }, () => resolve());
            });
        },
        { language }
    );
}

test.describe('Main Button A11y — role=switch и aria-pressed', () => {
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
        await context?.close().catch(() => {
            // Context may already be closed
        });
    });

    test.afterEach(async () => {
        await popup?.close().catch(() => {});
    });

    // TC 126.1: Проверить что #main-button имеет атрибут role="switch"
    test('TC 126.1: #main-button имеет атрибут role="switch"', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const roleAttr = await mainButton.getAttribute('role');

        expect(roleAttr).toBe('switch');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_126}-126.1-role-switch.png`) });
    });

    // TC 126.2: aria-pressed="true" при состоянии connected
    test('TC 126.2: aria-pressed="true" при состоянии connected', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние connected
        await setProxyState(popup, 'connected');
        await popup.waitForTimeout(500);

        // Обновляем страницу чтобы aria-pressed обновился
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaPressedAttr = await mainButton.getAttribute('aria-pressed');

        expect(ariaPressedAttr).toBe('true');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_126}-126.2-aria-pressed-connected.png`) });
    });

    // TC 126.3: aria-pressed="false" при состоянии disconnected
    test('TC 126.3: aria-pressed="false" при состоянии disconnected', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние disconnected (начальное состояние)
        await setProxyState(popup, 'disconnected');
        await popup.waitForTimeout(500);

        // Обновляем страницу
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaPressedAttr = await mainButton.getAttribute('aria-pressed');

        expect(ariaPressedAttr).toBe('false');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_126}-126.3-aria-pressed-disconnected.png`) });
    });

    // TC 126.4: aria-pressed="false" при состоянии connecting
    test('TC 126.4: aria-pressed="false" при состоянии connecting', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние connecting
        await setProxyState(popup, 'connecting');
        await popup.waitForTimeout(500);

        // Обновляем страницу
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaPressedAttr = await mainButton.getAttribute('aria-pressed');

        expect(ariaPressedAttr).toBe('false');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_126}-126.4-aria-pressed-connecting.png`) });
    });

    // TC 126.5: aria-pressed="false" при состоянии error
    test('TC 126.5: aria-pressed="false" при состоянии error', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние error
        await setProxyState(popup, 'error');
        await popup.waitForTimeout(500);

        // Обновляем страницу
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaPressedAttr = await mainButton.getAttribute('aria-pressed');

        expect(ariaPressedAttr).toBe('false');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_126}-126.5-aria-pressed-error.png`) });
    });
});

test.describe('Main Button A11y — aria-label локализация', () => {
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
        await context?.close().catch(() => {
            // Context may already be closed
        });
    });

    test.afterEach(async () => {
        await popup?.close().catch(() => {});
    });

    // TC 127.1-127.4: aria-label для язык en (English)
    test('TC 127.1: aria-label="Proxy on" при language=en и состоянии connected', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'en');
        await setProxyState(popup, 'connected');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Proxy on');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.1-aria-label-en-connected.png`) });
    });

    test('TC 127.2: aria-label="Proxy off" при language=en и состоянии disconnected', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'en');
        await setProxyState(popup, 'disconnected');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Proxy off');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.2-aria-label-en-disconnected.png`) });
    });

    test('TC 127.3: aria-label="Connecting" при language=en и состоянии connecting', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'en');
        await setProxyState(popup, 'connecting');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Connecting');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.3-aria-label-en-connecting.png`) });
    });

    test('TC 127.4: aria-label="Connection error" при language=en и состоянии error', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'en');
        await setProxyState(popup, 'error');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Connection error');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.4-aria-label-en-error.png`) });
    });

    // TC 127.5-127.8: aria-label для язык ru (Русский)
    test('TC 127.5: aria-label="Прокси включён" при language=ru и состоянии connected', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'ru');
        await setProxyState(popup, 'connected');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Прокси включён');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.5-aria-label-ru-connected.png`) });
    });

    test('TC 127.6: aria-label="Прокси выключен" при language=ru и состоянии disconnected', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'ru');
        await setProxyState(popup, 'disconnected');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Прокси выключен');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.6-aria-label-ru-disconnected.png`) });
    });

    test('TC 127.7: aria-label="Подключение" при language=ru и состоянии connecting', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'ru');
        await setProxyState(popup, 'connecting');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Подключение');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.7-aria-label-ru-connecting.png`) });
    });

    test('TC 127.8: aria-label="Ошибка подключения" при language=ru и состоянии error', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'ru');
        await setProxyState(popup, 'error');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Ошибка подключения');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.8-aria-label-ru-error.png`) });
    });

    // TC 127.9-127.12: aria-label для язык de (Немецкий — fallback на английский)
    test('TC 127.9: aria-label="Proxy on" при language=de и состоянии connected (fallback)', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'de');
        await setProxyState(popup, 'connected');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        // Ожидаем fallback на английский (заглушку из messages.json)
        expect(ariaLabel).toBe('Proxy on');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.9-aria-label-de-connected.png`) });
    });

    test('TC 127.10: aria-label="Proxy off" при language=de и состоянии disconnected (fallback)', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'de');
        await setProxyState(popup, 'disconnected');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Proxy off');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.10-aria-label-de-disconnected.png`) });
    });

    test('TC 127.11: aria-label="Connecting" при language=de и состоянии connecting (fallback)', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'de');
        await setProxyState(popup, 'connecting');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Connecting');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.11-aria-label-de-connecting.png`) });
    });

    test('TC 127.12: aria-label="Connection error" при language=de и состоянии error (fallback)', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        await setLanguage(popup, 'de');
        await setProxyState(popup, 'error');
        await popup.waitForTimeout(500);
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const mainButton = popup.locator('#main-button');
        const ariaLabel = await mainButton.getAttribute('aria-label');

        expect(ariaLabel).toBe('Connection error');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX_127}-127.12-aria-label-de-error.png`) });
    });
});

test.describe('Main Button A11y — динамическая смена языка', () => {
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
        await context?.close().catch(() => {
            // Context may already be closed
        });
    });

    test.afterEach(async () => {
        await popup?.close().catch(() => {});
    });

    // TC 128.1: aria-label обновляется при смене языка через UI (en -> ru) БЕЗ перезагрузки
    test('TC 128.1: aria-label обновляется en->ru через UI без перезагрузки попапа', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // 1. Устанавливаем начальное состояние: en, disconnected
        await setLanguage(popup, 'en');
        await setProxyState(popup, 'disconnected');
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // 2. Проверяем aria-label на английском
        const mainButton = popup.locator('#main-button');
        let ariaLabel = await mainButton.getAttribute('aria-label');
        expect(ariaLabel).toBe('Proxy off');

        // 3. Открываем Settings вкладку
        const settingsButton = popup.locator('button[data-tab="settings"]');
        await settingsButton.click();
        await popup.waitForTimeout(300); // Даём вкладке загрузиться

        // 4. Меняем язык через UI (selectOption), БЕЗ перезагрузки
        const languageSelect = popup.locator('#language-select');
        await languageSelect.selectOption('ru');
        await popup.waitForTimeout(1000); // Даём UI время обновиться

        // 5. Проверяем что aria-label обновился на русском БЕЗ перезагрузки
        ariaLabel = await mainButton.getAttribute('aria-label');
        expect(ariaLabel).toBe('Прокси выключен');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `QA-128-128.1-dynamic-lang-switch.png`) });
    });

    // TC 128.2: aria-label обновляется при смене языка через UI (ru -> en) БЕЗ перезагрузки
    test('TC 128.2: aria-label обновляется ru->en через UI без перезагрузки попапа', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // 1. Устанавливаем начальное состояние: ru, connected
        await setLanguage(popup, 'ru');
        await setProxyState(popup, 'connected');
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // 2. Проверяем aria-label на русском
        const mainButton = popup.locator('#main-button');
        let ariaLabel = await mainButton.getAttribute('aria-label');
        expect(ariaLabel).toBe('Прокси включён');

        // 3. Открываем Settings вкладку
        const settingsButton = popup.locator('button[data-tab="settings"]');
        await settingsButton.click();
        await popup.waitForTimeout(300); // Даём вкладке загрузиться

        // 4. Меняем язык через UI (selectOption), БЕЗ перезагрузки
        const languageSelect = popup.locator('#language-select');
        await languageSelect.selectOption('en');
        await popup.waitForTimeout(1000); // Даём UI время обновиться

        // 5. Проверяем что aria-label обновился на английском БЕЗ перезагрузки
        ariaLabel = await mainButton.getAttribute('aria-label');
        expect(ariaLabel).toBe('Proxy on');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `QA-128-128.2-dynamic-lang-switch-reverse.png`) });
    });
});
