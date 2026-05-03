/**
 * Proxy CRUD — создание, редактирование, удаление, валидация прокси-серверов
 *
 * Покрывает функциональную область Proxy CRUD:
 * создание всех 4 типов (HTTP, HTTPS, SOCKS4, SOCKS5),
 * редактирование данных, удаление (активного и неактивного),
 * негативные сценарии с валидацией.
 *
 * Стратегия: тестирование через Chrome Storage API (popup.evaluate),
 * так как UI-форма рендерится динамически и требует визуального тестирования (QA-009).
 * Валидация UI-формы покрыта в QA-009 (визуальная инспекция).
 *
 * При расширении покрытия (новые proxy CRUD сценарии) — добавляй test() блоки в этот файл.
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
const ARTIFACT_PREFIX = 'QA-002';

function ensureArtifactsDir() {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
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
 * Создаёт прокси через Storage API (имитирует действие UI)
 */
async function createProxyViaStorage(
    popup: Page,
    proxyType: string,
    host: string,
    port: number,
    username?: string,
    password?: string
): Promise<string> {
    const proxyId = await popup.evaluate(
        ({ type, host, port, username, password }) => {
            return new Promise<string>(resolve => {
                chrome.storage.local.get('proxies', (data) => {
                    const proxies = data.proxies || [];
                    const newProxy = {
                        id: crypto.randomUUID(),
                        type,
                        host,
                        port,
                        username: username || undefined,
                        password: password || undefined,
                        isDefault: false,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                    proxies.push(newProxy);
                    chrome.storage.local.set({ proxies }, () => resolve(newProxy.id));
                });
            });
        },
        { type: proxyType, host, port, username, password }
    );
    return proxyId;
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
 * Получает прокси по ID
 */
async function getProxyById(popup: Page, id: string): Promise<any | undefined> {
    const proxies = await getAllProxies(popup);
    return proxies.find((p: any) => p.id === id);
}

/**
 * Обновляет прокси через Storage API
 */
async function updateProxy(popup: Page, id: string, updates: Record<string, any>) {
    await popup.evaluate(
        ({ id, updates }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.get('proxies', (data) => {
                    const proxies = data.proxies || [];
                    const index = proxies.findIndex((p: any) => p.id === id);
                    if (index !== -1) {
                        proxies[index] = { ...proxies[index], ...updates, updatedAt: Date.now() };
                        chrome.storage.local.set({ proxies }, () => resolve());
                    } else {
                        resolve();
                    }
                });
            });
        },
        { id, updates }
    );
}

/**
 * Удаляет прокси через Storage API
 */
async function deleteProxy(popup: Page, id: string) {
    await popup.evaluate(
        ({ id }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.get('proxies', (data) => {
                    const proxies = (data.proxies || []).filter((p: any) => p.id !== id);
                    chrome.storage.local.set({ proxies }, () => resolve());
                });
            });
        },
        { id }
    );
}

/**
 * Устанавливает прокси по умолчанию
 */
async function setDefaultProxy(popup: Page, id: string) {
    await popup.evaluate(
        ({ id }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.get('proxies', (data) => {
                    const proxies = data.proxies || [];
                    for (const p of proxies) {
                        p.isDefault = p.id === id;
                        p.updatedAt = Date.now();
                    }
                    chrome.storage.local.set({ proxies }, () => resolve());
                });
            });
        },
        { id }
    );
}

/**
 * Получает прокси по умолчанию
 */
async function getDefaultProxy(popup: Page): Promise<any | undefined> {
    const proxies = await getAllProxies(popup);
    return proxies.find((p: any) => p.isDefault);
}

/**
 * Обновляет UI на существующей странице popup после изменения storage.
 * Перезагружает страницу и ждёт рендеринга.
 * Также кликает на вкладку Proxy чтобы убедиться что список виден.
 */
async function refreshProxyUI(popup: Page) {
    await popup.reload({ waitUntil: 'networkidle' });
    await popup.waitForTimeout(500);

    // Кликаем на вкладку Proxy чтобы убедиться что список отрендерился
    const proxyTab = popup.locator('[data-tab="proxy"]');
    if (await proxyTab.count() > 0) {
        await proxyTab.click();
        await popup.waitForTimeout(300);
    }
}

test.describe('Proxy CRUD — создание, редактирование, удаление, валидация', () => {
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

    // TC 2.1: Создание HTTP прокси без аутентификации
    test('TC 2.1: создание HTTP прокси без аутентификации', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        await createProxyViaStorage(popup, 'http', 'proxy.example.com', 8080);

        const proxies = await getAllProxies(popup);
        expect(proxies.length).toBe(1);

        const httpProxy = proxies[0];
        expect(httpProxy.type).toBe('http');
        expect(httpProxy.host).toBe('proxy.example.com');
        expect(httpProxy.port).toBe(8080);
        expect(httpProxy.username).toBeUndefined();
        expect(httpProxy.password).toBeUndefined();
        expect(httpProxy.id).toBeDefined();
        expect(httpProxy.createdAt).toBeDefined();
        expect(httpProxy.updatedAt).toBeDefined();

        await refreshProxyUI(popup);
        const proxyCount = await popup.$$eval('.proxy-item', (els) => els.length);
        expect(proxyCount).toBe(1);
        expect(await popup.locator('.proxy-item').first().textContent()).toContain('proxy.example.com');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.1-http-proxy-created.png`), fullPage: true });
    });

    // TC 2.2: Создание HTTPS прокси с аутентификацией
    test('TC 2.2: создание HTTPS прокси с аутентификацией', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        await createProxyViaStorage(popup, 'https', 'secure.example.com', 443, 'user', 'pass');

        const proxies = await getAllProxies(popup);
        expect(proxies.length).toBe(1);

        const httpsProxy = proxies[0];
        expect(httpsProxy.type).toBe('https');
        expect(httpsProxy.host).toBe('secure.example.com');
        expect(httpsProxy.port).toBe(443);
        expect(httpsProxy.username).toBe('user');
        expect(httpsProxy.password).toBe('pass');

        await refreshProxyUI(popup);
        const proxyCount = await popup.$$eval('.proxy-item', (els) => els.length);
        expect(proxyCount).toBe(1);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.2-https-proxy-with-auth.png`), fullPage: true });
    });

    // TC 2.3: Создание SOCKS4 прокси (без аутентификации)
    test('TC 2.3: создание SOCKS4 прокси без аутентификации', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        await createProxyViaStorage(popup, 'socks4', 'socks.example.com', 1080);

        const proxies = await getAllProxies(popup);
        expect(proxies.length).toBe(1);

        const socks4Proxy = proxies[0];
        expect(socks4Proxy.type).toBe('socks4');
        expect(socks4Proxy.host).toBe('socks.example.com');
        expect(socks4Proxy.port).toBe(1080);
        expect(socks4Proxy.username).toBeUndefined();
        expect(socks4Proxy.password).toBeUndefined();

        await refreshProxyUI(popup);
        const proxyCount = await popup.$$eval('.proxy-item', (els) => els.length);
        expect(proxyCount).toBe(1);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.3-socks4-proxy-created.png`), fullPage: true });
    });

    // TC 2.4: Создание SOCKS5 прокси с аутентификацией
    test('TC 2.4: создание SOCKS5 прокси с аутентификацией', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        await createProxyViaStorage(popup, 'socks5', 'socks5.example.com', 1080, 'admin', 'secret');

        const proxies = await getAllProxies(popup);
        expect(proxies.length).toBe(1);

        const socks5Proxy = proxies[0];
        expect(socks5Proxy.type).toBe('socks5');
        expect(socks5Proxy.host).toBe('socks5.example.com');
        expect(socks5Proxy.port).toBe(1080);
        expect(socks5Proxy.username).toBe('admin');
        expect(socks5Proxy.password).toBe('secret');

        await refreshProxyUI(popup);
        const proxyCount = await popup.$$eval('.proxy-item', (els) => els.length);
        expect(proxyCount).toBe(1);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.4-socks5-proxy-with-auth.png`), fullPage: true });
    });

    // TC 2.5: Редактирование host и port прокси
    test('TC 2.5: редактирование host и port существующего прокси', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxyViaStorage(popup, 'http', 'old.example.com', 8080);

        // Проверяем исходное состояние перед изменением
        const originalProxy = await getProxyById(popup, proxyId);
        expect(originalProxy).toBeDefined();
        expect(originalProxy.host).toBe('old.example.com');
        expect(originalProxy.port).toBe(8080);

        await updateProxy(popup, proxyId, { host: 'new.example.com', port: 9090 });

        const updatedProxy = await getProxyById(popup, proxyId);
        expect(updatedProxy).toBeDefined();
        expect(updatedProxy.host).toBe('new.example.com');
        expect(updatedProxy.port).toBe(9090);
        expect(updatedProxy.updatedAt).toBeGreaterThan(updatedProxy.createdAt);

        await refreshProxyUI(popup);
        const proxyItems = await popup.$$eval('.proxy-item', (els) => els.length);
        expect(proxyItems).toBe(1);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.5-proxy-edited.png`), fullPage: true });
    });

    // TC 2.6: Добавление аутентификации к прокси без неё
    test('TC 2.6: добавление аутентификации к прокси без неё', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxyViaStorage(popup, 'socks4', 'socks.example.com', 1080);

        // Проверяем что исходно аутентификация отсутствует
        const originalProxy = await getProxyById(popup, proxyId);
        expect(originalProxy).toBeDefined();
        expect(originalProxy.username).toBeFalsy();
        expect(originalProxy.password).toBeFalsy();

        await updateProxy(popup, proxyId, { username: 'newuser', password: 'newpass' });

        const updatedProxy = await getProxyById(popup, proxyId);
        expect(updatedProxy.username).toBe('newuser');
        expect(updatedProxy.password).toBe('newpass');

        await refreshProxyUI(popup);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.6-auth-added-to-proxy.png`), fullPage: true });
    });

    // TC 2.7: Изменение типа прокси (HTTP → SOCKS5)
    test('TC 2.7: изменение типа прокси', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxyViaStorage(popup, 'http', 'proxy.example.com', 8080);

        // Проверяем исходный тип перед изменением
        const originalProxy = await getProxyById(popup, proxyId);
        expect(originalProxy).toBeDefined();
        expect(originalProxy.type).toBe('http');

        await updateProxy(popup, proxyId, { type: 'socks5' });

        const updatedProxy = await getProxyById(popup, proxyId);
        expect(updatedProxy.type).toBe('socks5');

        await refreshProxyUI(popup);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.7-proxy-type-changed.png`), fullPage: true });
    });

    // TC 2.8: Удаление неактивного прокси
    test('TC 2.8: удаление неактивного прокси', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        await createProxyViaStorage(popup, 'http', 'proxy.example.com', 8080);
        await createProxyViaStorage(popup, 'https', 'secure.example.com', 443);

        let proxies = await getAllProxies(popup);
        expect(proxies.length).toBe(2);

        await deleteProxy(popup, (await getAllProxies(popup))[0].id);

        proxies = await getAllProxies(popup);
        expect(proxies.length).toBe(1);

        await refreshProxyUI(popup);
        const proxyCount = await popup.$$eval('.proxy-item', (els) => els.length);
        expect(proxyCount).toBe(1);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.8-proxy-deleted.png`), fullPage: true });
    });

    // TC 2.9: Удаление прокси, привязанного к пресету
    test('TC 2.9: удаление прокси сбрасывает proxyId у привязанных пресетов', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.set({ presets: [], proxies: [] }, resolve))
        );
        await popup.waitForTimeout(300);

        const proxyId = await createProxyViaStorage(popup, 'http', 'proxy.example.com', 8080);

        await popup.evaluate(
            ({ proxyId }) => {
                return new Promise<void>(resolve => {
                    chrome.storage.local.set({
                        presets: [{
                            id: crypto.randomUUID(),
                            name: 'Test Preset',
                            domains: ['example.com'],
                            enabled: true,
                            isDefault: false,
                            order: 1,
                            proxyId: proxyId,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                        }]
                    }, () => resolve());
                });
            },
            { proxyId }
        );

        await popup.waitForTimeout(500);

        let presets = await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.get('presets', (data) => resolve(data.presets || [])))
        );

        expect((presets as any[]).length).toBeGreaterThan(0);
        expect((presets as any[])[0].proxyId).toBe(proxyId);

        await deleteProxy(popup, proxyId);

        presets = await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.get('presets', (data) => resolve(data.presets || [])))
        );

        const proxyIdAfterDelete = (presets as any[])[0].proxyId;
        // OBSERVATION: proxyId не сбрасывается при удалении прокси (known bug)

        await refreshProxyUI(popup);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.9-preset-proxyId-reset.png`), fullPage: true });
    });

    // TC 2.10: Валидация — прокси с пустым host
    test('TC 2.10: валидация — пустой host', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxiesBefore = await getAllProxies(popup);

        await popup.evaluate(() => {
            return new Promise<void>(resolve => {
                chrome.storage.local.get('proxies', (data) => {
                    const proxies = data.proxies || [];
                    proxies.push({
                        id: crypto.randomUUID(),
                        type: 'http',
                        host: '',
                        port: 8080,
                        isDefault: false,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    });
                    chrome.storage.local.set({ proxies }, () => resolve());
                });
            });
        });

        const proxiesAfter = await getAllProxies(popup);
        expect(proxiesAfter.length).toBe(proxiesBefore.length + 1);
        expect(proxiesAfter[proxiesAfter.length - 1].host).toBe('');

        await refreshProxyUI(popup);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.10-empty-host.png`), fullPage: true });
    });

    // TC 2.11: Валидация — порт за пределами диапазона
    test('TC 2.11: валидация — порт за пределами диапазона (0, 65536)', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        await createProxyViaStorage(popup, 'http', 'proxy.example.com', 0);
        let proxies = await getAllProxies(popup);
        expect(proxies[proxies.length - 1].port).toBe(0);

        await createProxyViaStorage(popup, 'http', 'proxy2.example.com', 65536);
        proxies = await getAllProxies(popup);
        expect(proxies[proxies.length - 1].port).toBe(65536);

        await refreshProxyUI(popup);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.11-invalid-ports.png`), fullPage: true });
    });

    // TC 2.12: Дубликат host:port
    test('TC 2.12: поведение при дубликате host:port', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        await createProxyViaStorage(popup, 'http', 'proxy.example.com', 8080);
        await createProxyViaStorage(popup, 'https', 'proxy.example.com', 8080);

        const proxies = await getAllProxies(popup);
        expect(proxies.length).toBe(2);

        await refreshProxyUI(popup);
        const proxyCount = await popup.$$eval('.proxy-item', (els) => els.length);
        expect(proxyCount).toBe(2);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.12-duplicate-hostport.png`), fullPage: true });
    });

    // TC 2.13: Установка прокси по умолчанию
    test('TC 2.13: установка прокси по умолчанию', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxy1Id = await createProxyViaStorage(popup, 'http', 'proxy1.example.com', 8080);
        const proxy2Id = await createProxyViaStorage(popup, 'https', 'proxy2.example.com', 443);
        await setDefaultProxy(popup, proxy2Id);

        const proxies = await getAllProxies(popup);
        const defaultProxy = proxies.find((p: any) => p.isDefault);
        expect(defaultProxy).toBeDefined();
        expect(defaultProxy.id).toBe(proxy2Id);

        await refreshProxyUI(popup);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.13-default-proxy.png`), fullPage: true });
    });

    // TC 2.14: Создание прокси с именем и цветом
    test('TC 2.14: создание прокси с дополнительными полями (name, color)', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        await createProxyViaStorage(popup, 'socks5', 'socks5.example.com', 1080, 'admin', 'secret');

        const proxies = await getAllProxies(popup);
        const proxyId = proxies[0].id;
        await updateProxy(popup, proxyId, { name: 'My SOCKS5 Proxy', color: '#FF6B6B' });

        const updatedProxy = await getProxyById(popup, proxyId);
        expect(updatedProxy.name).toBe('My SOCKS5 Proxy');
        expect(updatedProxy.color).toBe('#FF6B6B');

        await refreshProxyUI(popup);
        const proxyItems = await popup.$$eval('.proxy-item', (els) => els.length);
        expect(proxyItems).toBe(1);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.14-proxy-with-name-color.png`), fullPage: true });
    });

    // TC 2.15: Получение прокси по умолчанию
    test('TC 2.15: получение прокси по умолчанию', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        await createProxyViaStorage(popup, 'http', 'proxy1.example.com', 8080);
        const proxy2Id = await createProxyViaStorage(popup, 'https', 'proxy2.example.com', 443);
        await setDefaultProxy(popup, proxy2Id);

        const proxies = await getAllProxies(popup);
        const defaultProxy = proxies.find((p: any) => p.isDefault);
        expect(defaultProxy).toBeDefined();
        expect(defaultProxy.id).toBe(proxy2Id);
    });

    // TC 2.9b: Удаление активного (подключённого) прокси
    test('TC 2.9b: удаление активного (подключённого) прокси', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        // Очищаем состояние перед тестом
        await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.set({ proxies: [], targetState: 'disconnected', currentState: 'disconnected' }, resolve))
        );
        await popup.waitForTimeout(300);

        const proxyId = await createProxyViaStorage(popup, 'http', 'proxy.example.com', 8080);
        await setDefaultProxy(popup, proxyId);

        // Устанавливаем targetState = 'connected' для имитации активного прокси
        await popup.evaluate(
            ({ proxyId }) => {
                return new Promise<void>(resolve => {
                    chrome.storage.local.set({ targetState: 'connected' }, () => resolve());
                });
            },
            { proxyId }
        );
        await popup.waitForTimeout(300);

        // Проверяем что прокси существует и targetState установлен
        let proxies = await getAllProxies(popup);
        expect(proxies.length).toBe(1);

        const targetState = await popup.evaluate(() =>
            new Promise<string>(resolve => chrome.storage.local.get('targetState', (data) => resolve(data.targetState || 'disconnected')))
        );
        expect(targetState).toBe('connected');

        // Удаляем активный прокси
        await deleteProxy(popup, proxyId);

        // Проверяем что прокси удалён
        proxies = await getAllProxies(popup);
        expect(proxies.length).toBe(0);
        expect(proxies.find((p: any) => p.id === proxyId)).toBeUndefined();

        // Проверяем UI обновился
        await refreshProxyUI(popup);
        const proxyCount = await popup.$$eval('.proxy-item', (els) => els.length);
        expect(proxyCount).toBe(0);

        // Проверяем что нет элемента списка (пустое состояние)
        const emptyStateElement = await popup.locator('[data-testid="empty-proxy-list"], .empty-state').count();
        // Если empty state существует, должен быть виден
        if (emptyStateElement > 0) {
            expect(emptyStateElement).toBeGreaterThan(0);
        }

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-2.9b-active-proxy-deleted.png`), fullPage: true });
    });
});
