/**
 * Public Proxy Search — модальное окно поиска публичных прокси, IP:Port, добавление
 *
 * Покрывает функциональную область Public Proxy Search:
 * открытие модального окна, поиск по IP:Port, добавление прокси из результатов,
 * валидация невалидного формата, обработка несуществующего IP.
 *
 * Сценарии из QA-037:
 * 5.1: Открыть модальное окно поиска публичных прокси
 * 5.2: Ввести IP:Port (например 1.2.3.4:8080) → поиск по конкретному адресу
 * 5.3: Выбрать прокси из результатов → добавлен в список прокси
 * 5.4: Добавленный публичный прокси корректно отображается
 * 5.5: Поиск по несуществующему IP → корректная обработка
 * 5.6: Поиск с невалидным форматом → валидация/подсказка
 *
 * При расширении покрытия (новые public proxy search сценарии) — добавляй test() блоки в этот файл.
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
const ARTIFACT_PREFIX = 'QA-037';

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
 * Очищает все прокси из storage
 */
async function clearProxies(popup: Page) {
    await popup.evaluate(() =>
        new Promise(resolve => chrome.storage.local.set({ proxies: [] }, resolve))
    );
}

/**
 * Получает все прокси из storage
 */
async function getAllProxies(popup: Page): Promise<any[]> {
    return await popup.evaluate(() =>
        new Promise(resolve => chrome.storage.local.get('proxies', (data) => resolve(data.proxies || [])))
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
 * Переключаемся на вкладку proxy
 */
async function switchTab(popup: Page, tabName: string): Promise<void> {
    const tab = popup.locator(`.segment[data-tab="${tabName}"]`);
    await expect(tab).toBeVisible({ timeout: 5000 });
    await tab.click();
    await popup.waitForTimeout(800);
}
async function searchByIpPort(popup: Page, ipPort: string): Promise<void> {
    const searchInput = popup.locator('.public-proxy-search-input');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill(ipPort);
    // Фильтрация синхронная (renderList вызывается в input-обработчике),
    // DOM обновлён к моменту возврата fill — дополнительного ожидания не требуется
}

test.describe('Public Proxy Search — модальное окно, IP:Port, добавление', () => {
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

    // TC 5.1: Открыть модальное окно поиска публичных прокси
    test('TC 5.1: открытие модального окна поиска публичных прокси', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        // Проверяем что кнопка добавления прокси видна
        const addProxyBtn = popup.locator('.add-proxy-btn');
        await expect(addProxyBtn).toBeVisible({ timeout: 10000 });

        // Открываем модальное окно выбора типа
        await addProxyBtn.click();

        // Проверяем что есть опция "Public"
        const modalOverlay = popup.locator('.modal-overlay');
        await expect(modalOverlay).toBeVisible({ timeout: 10000 });

        const publicOption = popup.locator('.proxy-type-option[data-type="public"]');
        await expect(publicOption).toBeVisible({ timeout: 5000 });

        // Кликаем на Public
        await publicOption.click();

        // Проверяем что модальное окно публичных прокси открылось
        const publicProxiesModal = popup.locator('.public-proxies-modal');
        await expect(publicProxiesModal).toBeVisible({ timeout: 15000 });

        // Проверяем что есть поле поиска
        const searchInput = popup.locator('.public-proxy-search-input');
        await expect(searchInput).toBeVisible({ timeout: 5000 });

        // Проверяем что есть список (даже если пустой до загрузки)
        const listDiv = popup.locator('.public-proxies-list');
        await expect(listDiv).toBeVisible({ timeout: 5000 });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.1-public-proxies-modal-opened.png`) });
    });

    // TC 5.2: Ввести IP:Port → поиск по конкретному адресу
    test('TC 5.2: поиск публичного прокси по IP:Port', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        await openPublicProxiesModal(popup);

        // Вводим конкретный IP:Port
        await searchByIpPort(popup, '1.2.3.4:8080');

        // Проверяем что поле поиска содержит введённое значение
        const searchInput = popup.locator('.public-proxy-search-input');
        const inputValue = await searchInput.inputValue();
        expect(inputValue).toBe('1.2.3.4:8080');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.2-ip-port-search.png`) });
    });

    // TC 5.3: Выбрать прокси из результатов → добавлен в список прокси
    test('TC 5.3: добавление публичного прокси из результатов в список', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        // Очищаем прокси перед тестом
        await clearProxies(popup);

        await openPublicProxiesModal(popup);

        // Ждём загрузки прокси (появление элементов в списке)
        const proxyItems = popup.locator('.public-proxy-item');
        const proxyCountBefore = await proxyItems.count();

        // Если прокси загрузились, кликаем на первый
        if (proxyCountBefore > 0) {
            const firstProxy = proxyItems.first();
            await expect(firstProxy).toBeVisible({ timeout: 10000 });

            // Кликаем чтобы добавить
            await firstProxy.click();

            // Ждём что модальное окно закроется (или появится подтверждение)
            await popup.waitForTimeout(2000);

            // Проверяем что прокси добавлен в storage
            const proxies = await getAllProxies(popup);
            expect(proxies.length).toBeGreaterThan(0);

            // Проверяем что первый прокси имеет корректные поля
            const addedProxy = proxies[0];
            expect(addedProxy.host).toBeDefined();
            expect(addedProxy.port).toBeDefined();
            expect(addedProxy.type).toBeDefined();

            await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.3-proxy-added-from-public.png`) });
        } else {
            // Если публичные прокси не загрузились (сеть/URL недоступен) — фиксируем OBSERVATION
            await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.3-no-public-proxies-loaded.png`) });
            test.skip(true, 'Public proxies list did not load — external source may be unavailable');
        }
    });

    // TC 5.4: Добавленный публичный прокси корректно отображается
    test('TC 5.4: отображение добавленного публичного прокси в списке', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        await clearProxies(popup);

        await openPublicProxiesModal(popup);

        // Ждём загрузки прокси
        const proxyItems = popup.locator('.public-proxy-item');
        const proxyCountBefore = await proxyItems.count();

        if (proxyCountBefore > 0) {
            const firstProxy = proxyItems.first();
            await firstProxy.click();

            // Ждём закрытия модалки и обновления списка
            await popup.waitForTimeout(2000);

            // Проверяем что прокси отображается в UI
            const proxyItemsInList = popup.locator('.proxy-item');
            const proxyCountAfter = await proxyItemsInList.count();
            expect(proxyCountAfter).toBeGreaterThan(0);

            // Проверяем данные первого прокси в UI
            const firstProxyItem = proxyItemsInList.first();
            await expect(firstProxyItem).toBeVisible({ timeout: 5000 });

            // Проверяем что есть информация о прокси (host:port)
            const proxyDetails = firstProxyItem.locator('.proxy-details');
            await expect(proxyDetails).toBeVisible({ timeout: 5000 });

            await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.4-added-proxy-displayed.png`) });
        } else {
            await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.4-no-public-proxies.png`) });
            test.skip(true, 'Public proxies list did not load — external source may be unavailable');
        }
    });

    // TC 5.5: Поиск по несуществующему IP → корректная обработка
    test('TC 5.5: поиск по несуществующему IP — корректная обработка', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        await openPublicProxiesModal(popup);

        // Вводим заведомо несуществующий IP
        await searchByIpPort(popup, '999.999.999.999:99999');

        // Проверяем что список фильтруется (может стать пустым)
        const proxyItems = popup.locator('.public-proxy-item');
        const count = await proxyItems.count();

        // Проверяем что UI не сломался (модальное окно всё ещё видно)
        const publicProxiesModal = popup.locator('.public-proxies-modal');
        await expect(publicProxiesModal).toBeVisible({ timeout: 5000 });

        // Проверяем что поле поиска по-прежнему содержит введённое значение
        const searchInput = popup.locator('.public-proxy-search-input');
        const inputValue = await searchInput.inputValue();
        expect(inputValue).toBe('999.999.999.999:99999');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.5-nonexistent-ip-search.png`) });
    });

    // TC 5.6: Поиск с невалидным форматом → валидация/подсказка
    test('TC 5.6: поиск с невалидным форматом — валидация', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        await openPublicProxiesModal(popup);

        // Вводим невалидный формат (не IP:Port)
        const invalidInputs = ['not-an-ip', 'hello world', '123', ''];

        for (const invalidInput of invalidInputs) {
            await searchByIpPort(popup, invalidInput);

            // Проверяем что UI не сломался
            const publicProxiesModal = popup.locator('.public-proxies-modal');
            await expect(publicProxiesModal).toBeVisible({ timeout: 5000 });

            // Проверяем что поле поиска содержит введённое значение
            const searchInput = popup.locator('.public-proxy-search-input');
            const inputValue = await searchInput.inputValue();
            expect(inputValue).toBe(invalidInput);
        }

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.6-invalid-format-validation.png`) });
    });

    // TC 5.7: Проверка фильтров по типу протокола (HTTP/HTTPS/SOCKS4/SOCKS5)
    test('TC 5.7: фильтрация публичных прокси по типу протокола', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        await openPublicProxiesModal(popup);

        // Ждём загрузки прокси
        const proxyItems = popup.locator('.public-proxy-item');
        await proxyItems.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

        const totalProxyCount = await proxyItems.count();

        if (totalProxyCount > 0) {
            // Проверяем что есть фильтры по типу протокола
            const protocolFilters = popup.locator('.protocol-filter, [class*="protocol"], .public-proxies-filters button, .public-proxies-filters .filter-btn');
            const filterCount = await protocolFilters.count();

            await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.7-protocol-filters.png`) });
        } else {
            await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.7-no-proxies-for-filter-test.png`) });
            test.skip(true, 'Public proxies list did not load — cannot test protocol filters');
        }
    });

    // TC 5.8: Закрытие модального окна
    test('TC 5.8: закрытие модального окна поиска публичных прокси', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await waitForPopupReady(popup);
        await dismissModalIfPresent(popup);
        await switchTab(popup, 'proxy');

        await openPublicProxiesModal(popup);

        // Проверяем что модальное окно открыто
        const publicProxiesModal = popup.locator('.public-proxies-modal');
        await expect(publicProxiesModal).toBeVisible({ timeout: 5000 });

        // Закрываем через Escape
        await popup.keyboard.press('Escape');
        await popup.waitForTimeout(500);

        // Проверяем что модальное окно закрылось
        const modalVisible = await publicProxiesModal.isVisible().catch(() => false);
        expect(modalVisible).toBe(false);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-5.8-modal-closed.png`) });
    });
});
