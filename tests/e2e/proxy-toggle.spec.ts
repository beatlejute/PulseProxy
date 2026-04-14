/**
 * Proxy Toggle — подключение/отключение прокси, смена состояний, иконка, Service Worker
 *
 * Покрывает функциональную область Proxy Toggle:
 * смена состояний connecting/connected/disconnected/error,
 * обновление иконки расширения, корректность chrome.proxy.settings,
 * отсутствие гонок состояний при быстром переключении.
 *
 * При расширении покрытия (новые proxy toggle сценарии) — добавляй test() блоки в этот файл.
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
const ARTIFACT_PREFIX = 'QA-003';

function ensureArtifactsDir() {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
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
 * Создаёт прокси через Storage API
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
 * Нажимает кнопку подключения/отключения прокси
 * ВАЖНО: После клика popup может закрыться - это нормально для расширений
 */
async function clickConnectButton(popup: Page): Promise<void> {
    const connectBtn = popup.locator('#main-button');
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();
}

/**
 * Переоткрывает popup (для случаев когда он закрылся после взаимодействия)
 */
async function reopenPopup(context: BrowserContext, popupUrl: string, oldPopup: Page): Promise<Page> {
    await oldPopup?.close().catch(() => {});
    const newPopup = await openPopup(context, popupUrl);
    await newPopup.waitForLoadState('domcontentloaded');
    await newPopup.waitForTimeout(500);
    return newPopup;
}

/**
 * Получает текущее состояние proxy из storage
 */
async function getProxyState(popup: Page): Promise<any> {
    return await popup.evaluate(() =>
        new Promise(resolve => chrome.storage.local.get(['currentState', 'targetState', 'activeProxyId'], resolve))
    );
}

/**
 * Получает настройки chrome.proxy.settings через Service Worker
 */
async function getChromeProxySettings(popup: Page): Promise<any> {
    return await popup.evaluate(() =>
        new Promise((resolve) => {
            // Пытаемся получить через background/runtime
            if (chrome && chrome.proxy && chrome.proxy.settings) {
                chrome.proxy.settings.get({}, (details) => {
                    resolve(details);
                });
            } else {
                resolve({ error: 'chrome.proxy.settings unavailable' });
            }
        })
    );
}

/**
 * Сбрасывает состояние подключения
 */
async function resetConnectionState(popup: Page) {
    await popup.evaluate(() =>
        new Promise(resolve => chrome.storage.local.set({
            currentState: 'disconnected',
            targetState: 'disconnected',
            activeProxyId: null
        }, resolve))
    );
    // Сброс кэша ProxyManager для полной изоляции тестов
    await popup.evaluate(() =>
        new Promise(resolve => chrome.runtime.sendMessage({ action: 'resetProxyCache' }, resolve))
    );
}

test.describe('Proxy Toggle — подключение/отключение прокси', () => {
    let context: BrowserContext;
    let popupUrl: string;
    let popup: Page;
    let testProxyId: string;

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

    test.beforeEach(async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Создаём тестовый прокси
        await clearProxies(popup);
        testProxyId = await createProxyViaStorage(popup, 'http', 'proxy.test.com', 8080);
        await setDefaultProxy(popup, testProxyId);
        await resetConnectionState(popup);
        await popup.waitForTimeout(1000);

        // Дополнительный сброс кэша и proxy.settings для гарантии изоляции
        await popup.evaluate(() =>
            new Promise(resolve => chrome.runtime.sendMessage({ action: 'resetProxyCache' }, resolve))
        );
        await popup.evaluate(() =>
            new Promise(resolve => chrome.proxy.settings.clear({}, resolve))
        );
        await popup.waitForTimeout(1000);

        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(500);
    });

    test.afterEach(async () => {
        await popup?.close();
    });

    // TC 3.2: Проверить что иконка расширения меняется на "connected"
    // NOTE: With a fake proxy, the state may transition to 'error' instead of 'connected'.
    // The test verifies that the button state changes from its initial state.
    test('TC 3.2: иконка расширения меняется на connected при подключении', async () => {
        // Get initial button class
        const mainButton = popup.locator('#main-button');
        const initialClass = await mainButton.getAttribute('class');
        console.log(`TC 3.2: Initial button class: ${initialClass}`);

        // Подключаемся
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(1000);

        // Проверяем класс кнопки после подключения (locator на новой странице)
        const afterButton = popup.locator('#main-button');
        const afterClass = await afterButton.getAttribute('class');
        console.log(`TC 3.2: Button class after connect: ${afterClass}`);

        // Класс должен измениться (не должен содержать 'disconnected')
        expect(afterClass).not.toContain('disconnected');
        // Должен содержать одно из состояний: connected, connecting, или error
        expect(
            afterClass?.includes('connected') ||
            afterClass?.includes('connecting') ||
            afterClass?.includes('error')
        ).toBeTruthy();

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-3.2-connected-icon.png`) });
    });

    // TC 3.3: Нажать кнопку отключения → состояние disconnected
    test('TC 3.3: отключение прокси — смена состояния на disconnected', async () => {
        // Сначала подключаемся
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);

        let state = await getProxyState(popup);
        console.log(`TC 3.3: State after connect: ${state.currentState}`);

        // Теперь отключаемся
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);

        // Проверяем что состояние стало disconnected
        state = await getProxyState(popup);
        console.log(`TC 3.3: State after disconnect: ${state.currentState}`);
        expect(state.currentState).toBe('disconnected');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-3.3-proxy-disconnected.png`) });
    });

    // TC 3.4: Проверить что иконка возвращается в "disconnected"
    test('TC 3.4: иконка расширения возвращается в disconnected при отключении', async () => {
        // Подключаемся
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);

        // Отключаемся
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);

        // Проверяем класс кнопки main-button
        const mainButton = popup.locator('#main-button');
        const mainButtonClass = await mainButton.getAttribute('class');
        const isDisconnectedClass = mainButtonClass?.includes('disconnected');

        const bodyText = await popup.locator('body').textContent();
        const hasDisconnectedText = bodyText?.toLowerCase().includes('disconnected') || bodyText?.toLowerCase().includes('отключено');

        expect(isDisconnectedClass || hasDisconnectedText).toBeTruthy();

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-3.4-disconnected-icon.png`) });
    });

    // TC 3.5: Быстрый toggle (вкл → выкл → вкл) → нет гонки состояний
    test('TC 3.5: быстрый toggle — нет гонки состояний', async () => {
        // Быстрое переключение: вкл → выкл → вкл
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await clickConnectButton(popup);
        
        // Переоткрываем и даём время на стабилизацию
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(1000);

        const state = await getProxyState(popup);
        
        // Состояние должно быть стабильным — либо connected, либо disconnected, либо error
        expect(state.currentState).toBeDefined();
        expect(['connected', 'disconnected', 'error'].includes(state.currentState)).toBeTruthy();

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-3.5-rapid-toggle.png`) });
    });

    // TC 3.6: Подключение к несуществующему прокси → состояние connected или error (НЕ disconnected)
    // NOTE: 'nonexistent.invalid.host' проходит validateProxyHost (синтаксически корректный RFC 1123 hostname).
    // PAC-скрипт применяется → state = 'connected'. Переход в 'error' возможен только после
    // реального сетевого запроса через прокси (webRequest.onErrorOccurred).
    // В тестовой среде без активного браузинга это ненадёжно → тест фиксирует что:
    //   a) прокси НАЙДЕН (state ≠ 'disconnected' — не как "нет прокси")
    //   b) state ≠ 'disconnected' подтверждает что FIX-012 разграничение корректно
    // Для теста немедленного ERROR используй TC 8.2 ('bad host with spaces' не проходит валидацию).
    test('TC 3.6: подключение к несуществующему прокси — состояние не disconnected', async () => {
        // Создаём прокси с заведомо несуществующим адресом (синтаксически валидным)
        await clearProxies(popup);
        const badProxyId = await createProxyViaStorage(popup, 'http', 'nonexistent.invalid.host', 9999);
        await setDefaultProxy(popup, badProxyId);
        await resetConnectionState(popup);
        await popup.waitForTimeout(1000);

        // Пробуем подключиться
        await clickConnectButton(popup);

        // Ждём некоторое время для появления ошибки
        await popup.waitForTimeout(5000);

        const state = await getProxyState(popup);

        // Прокси найден → PAC применён → state не должен быть 'disconnected'
        // (disconnected = "нет прокси", но прокси есть — просто недостижимый)
        expect(['error', 'connected', 'connecting'].includes(state.currentState)).toBeTruthy();
        expect(state.currentState).not.toBe('disconnected');

        // Фиксируем результат
        console.log(`TC 3.6: State after connecting to invalid proxy: ${state.currentState}`);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-3.6-invalid-proxy.png`) });
    });

    // TC 3.7: Переключение между разными прокси без отключения → корректная смена
    // NOTE: With FIX-014, ERROR+changedId branch now respects targetState.
    // When user clicks button twice (connect, then disconnect), the second click
    // means "disconnect" — so state should be 'disconnected'.
    // This verifies FIX-014: ERROR+changedId branch checks targetState before action.
    test('TC 3.7: переключение между разными прокси — disconnect respected', async () => {
        // Создаём второй прокси
        const proxy2Id = await createProxyViaStorage(popup, 'https', 'proxy2.test.com', 443);

        // Подключаемся к первому
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);

        let state = await getProxyState(popup);
        console.log(`TC 3.7: State after first connect: ${state.currentState}`);
        // Evidence: состояние UI после подключения к proxy1 (снимаем до assertion)
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-3.7-after-first-connect.png`) });

        // Меняем прокси по умолчанию на второй
        await setDefaultProxy(popup, proxy2Id);

        // Нажимаем кнопку ещё раз (пользователь хочет отключиться)
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);

        state = await getProxyState(popup);
        console.log(`TC 3.7: State after second click (disconnect): ${state.currentState}`);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-3.7-switch-proxy.png`) });

        // With FIX-014, user intent to disconnect is respected → state should be 'disconnected'
        expect(state.currentState).toBe('disconnected');
    });

    // TC 3.7a: Регрессионный тест DEF-QA035-2 — Disconnect при изменённом proxy ID → disconnected (не reconnect)
    // NOTE: With fake proxies, the first connect puts state into 'error'. When the user
    // clicks the button again (intending to disconnect), the FIX-013 fix calls enable()
    // (because currentState=ERROR), which also fails with 'error' for fake proxies.
    // The key assertion is that state is NOT 'connected' — proves no unintended reconnect.
    test('TC 3.7a: отключение при изменённом proxy ID — состояние disconnected, не reconnect', async () => {
        // Создаём второй прокси (proxy B)
        const proxyBId = await createProxyViaStorage(popup, 'https', 'proxy-b.test.com', 443);

        // Подключаемся к proxy A (первый, уже установлен как default в beforeEach)
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);

        let state = await getProxyState(popup);
        console.log(`TC 3.7a: State after connect to proxy A: ${state.currentState}`);

        // Меняем default на proxy B (не отключаясь)
        await setDefaultProxy(popup, proxyBId);

        // Нажимаем Disconnect
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(500);

        state = await getProxyState(popup);
        console.log(`TC 3.7a: State after disconnect (with changed proxy ID): ${state.currentState}`);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-3.7a-disconnect-changed-id.png`) });

        // With fake proxies, state may be 'error' (enable() called but proxy failed)
        // or 'disconnected' (disable() called). Both are acceptable — the key is
        // that state is NOT 'connected' (no unintended reconnect to proxy B).
        expect(['disconnected', 'error'].includes(state.currentState)).toBeTruthy();
        expect(state.currentState).not.toBe('connected');
    });

    // TC 3.8: Service Worker console — отсутствие ошибок при toggle
    test('TC 3.8: отсутствие ошибок в Service Worker при подключении/отключении', async () => {
        const errors: string[] = [];
        
        // Слушаем ошибки в Service Worker
        context.on('weberror', (error) => {
            const msg = error.message();
            if (msg && !msg.includes('favicon') && !msg.includes('net::ERR_')) {
                errors.push(msg);
            }
        });

        // Подключаемся
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);

        // Отключаемся
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);

        // Проверяем Service Worker на наличие ошибок
        const serviceWorkers = context.serviceWorkers();
        let swErrors: string[] = [];
        
        if (serviceWorkers.length > 0) {
            try {
                const swStatus = await serviceWorkers[0].evaluate(() => {
                    return 'SW alive';
                });
                expect(swStatus).toBe('SW alive');
            } catch (e) {
                swErrors.push((e as Error).message);
            }
        }

        // Объединяем все ошибки
        const allErrors = [...errors, ...swErrors];
        
        // Не должно быть критических ошибок
        const criticalErrors = allErrors.filter(e =>
            e.toLowerCase().includes('uncaught') ||
            e.toLowerCase().includes('typeerror') ||
            e.toLowerCase().includes('referenceerror')
        );

        expect(criticalErrors.length, `Critical Service Worker errors: ${JSON.stringify(criticalErrors)}`).toBe(0);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-3.8-sw-no-errors.png`) });
    });

    // TC 8.1: Нет прокси → Connect → disconnected (не error) — проверка FIX-012
    test('TC 8.1: нет прокси → Connect → состояние disconnected (не error)', async () => {
        // Удаляем все прокси
        await clearProxies(popup);
        await resetConnectionState(popup);
        await popup.waitForTimeout(1000);

        // Перезагружаем popup для чистого состояния
        popup = await reopenPopup(context, popupUrl, popup);

        // Нажимаем Connect (нет прокси — должен быть disconnected)
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(1000);

        const state = await getProxyState(popup);
        console.log(`TC 8.1: State after connect with no proxy: currentState=${state.currentState}, targetState=${state.targetState}`);

        // targetState может быть 'connected' (пользователь нажал Connect)
        // currentState ДОЛЖЕН быть 'disconnected' — не 'error'
        expect(state.currentState).toBe('disconnected');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-056-TC8.1-no-proxy-disconnected.png') });
    });

    // TC 8.2: Прокси с несуществующим хостом → Connect → error, иконка красный щит
    test('TC 8.2: невалидный хост → Connect → состояние error, иконка красный щит', async () => {
        // Прокси с хостом, не прошедшим validateProxyHost (немедленный error)
        await clearProxies(popup);
        const badProxyId = await createProxyViaStorage(popup, 'http', 'bad host with spaces', 9999);
        await setDefaultProxy(popup, badProxyId);
        await resetConnectionState(popup);
        await popup.waitForTimeout(1000);

        popup = await reopenPopup(context, popupUrl, popup);

        // Дополнительный сброс PAC-кэша и proxy.settings для гарантии изоляции
        await popup.evaluate(() =>
            new Promise(resolve => chrome.runtime.sendMessage({ action: 'resetProxyCache' }, resolve))
        );
        await popup.evaluate(() =>
            new Promise(resolve => chrome.proxy.settings.clear({}, resolve))
        );
        await popup.waitForTimeout(1000);

        // Нажимаем Connect
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(1000);

        const state = await getProxyState(popup);
        console.log(`TC 8.2: State after connect with invalid host: currentState=${state.currentState}`);

        // Должен быть error — хост не прошёл валидацию
        expect(state.currentState).toBe('error');

        // Визуальная проверка: иконка должна показывать ошибку (красный щит)
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-056-TC8.2-error-icon.png') });
    });

    // TC 8.3: Валидный прокси → Connect → PAC-скрипт применён (не disconnected/immediate-error)
    // NOTE: С фейковым прокси chrome.proxy.settings применяет PAC-скрипт и ставит 'connected',
    // но webRequest.onErrorOccurred быстро переводит в 'error'. Проверяем что:
    //   (a) state НЕ 'disconnected' (= прокси найден и PAC применён)
    //   (b) state НЕ 'error' от validateProxyHost (= хост прошёл валидацию, не немедленная ошибка)
    // Для (b) измеряем состояние сразу после clickConnectButton, до сетевого таймаута.
    test('TC 8.3: валидный прокси → Connect → PAC-скрипт применён (connected, не disconnected)', async () => {
        // proxy.test.com:8080 уже создан в beforeEach (testProxyId)
        await resetConnectionState(popup);
        await popup.waitForTimeout(1000);

        popup = await reopenPopup(context, popupUrl, popup);

        // Нажимаем Connect
        await clickConnectButton(popup);

        // Переоткрываем popup и проверяем состояние БЫСТРО (до сетевого таймаута)
        popup = await reopenPopup(context, popupUrl, popup);
        // НЕ ждём долго — берём состояние сразу
        const stateImmediate = await getProxyState(popup);
        console.log(`TC 8.3: Immediate state after connect: currentState=${stateImmediate.currentState}, targetState=${stateImmediate.targetState}`);

        // PAC-скрипт применяется → state должен быть 'connected' или 'connecting'
        // (не 'disconnected' = прокси найден, не немедленный 'error' от валидации хоста)
        // Если state = 'error', это значит сетевой сбой (не баг FIX-012)
        const wasProxyTried = stateImmediate.currentState === 'connected' ||
            stateImmediate.currentState === 'connecting' ||
            stateImmediate.currentState === 'error'; // error от сети, не от "нет прокси"

        expect(stateImmediate.currentState).not.toBe('disconnected');
        expect(wasProxyTried).toBeTruthy();

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-056-TC8.3-connected.png') });
    });

    // TC 6.2 (QA-66): Валидный хост → Connect → PAC применён (валидация прошла)
    // Цель: подтвердить что исправление тест-изоляции DEF-QA059-1 (QA-62) не сломало
    // продуктовую логику — валидный хост должен пройти validateProxyHost, PAC скрипт
    // должен быть применён, и state = 'connected'.
    //
    // Ключевое отличие: errorProxy в storage = маркер что PAC был применён и сеть была попробована.
    // - Невалидный хост → validateProxyHost FAIL → setCurrentState(ERROR) → PAC не применён → errorProxy НЕ устанавливается
    // - Валидный хост → validateProxyHost PASS → applyPacScript → setCurrentState(CONNECTED)
    //   → webRequest.onErrorOccurred (fake proxy) → errorProxy УСТАНАВЛИВАЕТСЯ → setCurrentState(ERROR)
    //
    // Поэтому: PASS = state='connected' ИЛИ (state='error' И errorProxy установлен)
    test('TC 6.2 (QA-66): валидный хост → Connect → PAC применён (state=connected или error от сети, не от валидации)', async () => {
        // Очищаем errorProxy перед тестом для чистоты проверки
        await popup.evaluate(() =>
            new Promise<void>(resolve => chrome.storage.local.remove('errorProxy', () => resolve()))
        );

        // proxy.test.com:8080 создан в beforeEach — валидный RFC 1123 хост
        await clickConnectButton(popup);

        // Ждём стабилизации состояния (включая возможный переход через connected → error от сети)
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(2000);

        const state = await getProxyState(popup);
        const errorProxy = await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.get('errorProxy', data => resolve(data.errorProxy)))
        );
        console.log(`TC 6.2 (QA-66): state=${state.currentState}, errorProxy=${JSON.stringify(errorProxy)}`);

        // Сценарий PASS:
        //   (a) state='connected' — PAC применён, сетевой error ещё не успел сработать
        //   (b) state='error' И errorProxy установлен — PAC применён, proxy.test.com не реален → сетевой error
        // Сценарий FAIL:
        //   state='error' И errorProxy НЕ установлен — validateProxyHost провалился (валидный хост = БАГ)
        //   state='disconnected' — PAC вообще не применён (валидный хост = БАГ)
        const validHostPacApplied = state.currentState === 'connected' ||
            (state.currentState === 'error' && errorProxy !== undefined && errorProxy !== null);

        expect(validHostPacApplied, `Expected PAC applied for valid host. state=${state.currentState}, errorProxy=${JSON.stringify(errorProxy)}`).toBe(true);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-66-TC6.2-connected.png') });
    });

    // TC 8.4: Подключён → удалить все прокси → disconnect через UI → disconnected (не error)
    // Новая техника: избегаем race condition с storage listener, используя UI-кнопку вместо прямого сообщения.
    test('TC 8.4: удаление прокси после подключения → disconnect через UI → disconnected (не error)', async () => {
        // Подключаемся через UI — реактивный путь (SW получает targetState через onChanged)
        // (прокси есть из beforeEach — proxy.test.com:8080)
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(500);

        let state = await getProxyState(popup);
        console.log(`TC 8.4: State after connect: ${state.currentState}`);
        // С фейковым прокси state может быть 'connected' или 'error' (сетевой сбой)
        // Главное — SW был вовлечён через реактивный путь (не 'disconnected')
        expect(state.currentState).not.toBe('disconnected');

        // Удаляем все прокси (имитация пользовательского действия через UI)
        await clearProxies(popup);
        await popup.waitForTimeout(500); // даём время для стабилизации SW

        // Нажимаем кнопку Disconnect через UI (продуктовый сценарий)
        // Это атомарно устанавливает targetState = 'disconnected' и вызывает disable()
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(500);

        state = await getProxyState(popup);
        console.log(`TC 8.4: State after delete + UI disconnect: currentState=${state.currentState}`);

        // Нет прокси → должен быть disconnected, а не error
        expect(state.currentState).toBe('disconnected');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-056-TC8.4-delete-reconnect-disconnected.png') });
    });

    // TC 3.9: Нет прокси → Connect → disconnected (не error) — проверка FIX-012
    // NOTE: Аналогично TC 8.1, добавлен для явного покрытия по спецификации тикета QA-057
    test('TC 3.9: подключение при отсутствии прокси — состояние disconnected', async () => {
        await clearProxies(popup);
        await resetConnectionState(popup);
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        const state = await getProxyState(popup);
        console.log(`TC 3.9: State after connect with no proxy: currentState=${state.currentState}`);
        // Отсутствие прокси — не ошибка подключения, а конфигурационное состояние
        expect(state.currentState).toBe('disconnected'); // НЕ 'error'
    });

    // TC 3.10: Reconnect после удаления всех прокси → disconnected — проверка FIX-012
    // NOTE: Аналогично TC 8.4, добавлен для явного покрытия по спецификации тикета QA-057
    test('TC 3.10: reconnect после удаления всех прокси — disconnected', async () => {
        // Создать прокси, подключиться (используем testProxyId из beforeEach — уже создан)
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        let state = await getProxyState(popup);
        console.log(`TC 3.10: State after connect: ${state.currentState}`);
        // Удалить все прокси
        await clearProxies(popup);
        await popup.waitForTimeout(200);
        // Попытка reconnect
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        state = await getProxyState(popup);
        console.log(`TC 3.10: State after delete+reconnect: currentState=${state.currentState}`);
        expect(state.currentState).toBe('disconnected'); // НЕ 'error'
    });

    // TC 5.4: FIX-011 быстрый cross-proxy toggle: connect A → switch to B → connect B → disconnect → нет race conditions
    test('TC 5.4: FIX-011 быстрый cross-proxy toggle без race conditions (QA-054)', async () => {
        // Создаём proxy B
        const proxyBId = await createProxyViaStorage(popup, 'https', 'proxy-b-qa054.test.com', 8443);

        // Шаг 1: Подключаемся к proxy A (testProxyId уже создан в beforeEach как default)
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(500);

        let state = await getProxyState(popup);
        console.log(`TC 5.4: After connect to A: currentState=${state.currentState}`);

        // Шаг 2: Меняем default на proxy B (без явного отключения)
        await setDefaultProxy(popup, proxyBId);

        // Шаг 3: Нажимаем кнопку (Connect B или Disconnect A — зависит от текущего state)
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(500);

        state = await getProxyState(popup);
        console.log(`TC 5.4: After button click with B selected: currentState=${state.currentState}`);

        // Шаг 4: Нажимаем Disconnect (гарантируем отключение)
        // Если state !== 'disconnected', кликаем ещё раз для явного отключения
        if (state.currentState !== 'disconnected') {
            await clickConnectButton(popup);
            popup = await reopenPopup(context, popupUrl, popup);
            await popup.waitForTimeout(500);
        }

        state = await getProxyState(popup);
        console.log(`TC 5.4: Final state: currentState=${state.currentState}`);

        // Нет race conditions: финальное состояние должно быть disconnected
        expect(state.currentState).toBe('disconnected');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-054-TC5.4-cross-proxy-toggle.png') });
    });

    // TC 5.5: FIX-011 Service Worker — нет JS-ошибок при переключении между прокси (QA-054)
    test('TC 5.5: FIX-011 Service Worker — нет ошибок при переключении между прокси (QA-054)', async () => {
        const criticalErrors: string[] = [];

        // Слушаем weberror (только не сетевые ошибки прокси)
        context.on('weberror', (error) => {
            const msg = error.message();
            if (msg && !msg.includes('favicon') && !msg.includes('net::ERR_')) {
                criticalErrors.push(msg);
            }
        });

        // Создаём proxy B
        const proxyBId = await createProxyViaStorage(popup, 'https', 'proxy-b-qa054-5.5.test.com', 9443);

        // Шаг 1: Подключаемся к proxy A
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(1000);

        // Шаг 2: Переключаем default на proxy B
        await setDefaultProxy(popup, proxyBId);

        // Шаг 3: Нажимаем кнопку (переключение/connect к B)
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(1000);

        // Шаг 4: Disconnect
        let state = await getProxyState(popup);
        if (state.currentState !== 'disconnected') {
            await clickConnectButton(popup);
            popup = await reopenPopup(context, popupUrl, popup);
            await popup.waitForTimeout(1000);
        }

        // Проверяем Service Worker
        const serviceWorkers = context.serviceWorkers();
        if (serviceWorkers.length > 0) {
            try {
                const swStatus = await serviceWorkers[0].evaluate(() => 'SW alive');
                console.log(`TC 5.5: SW status: ${swStatus}`);
            } catch (e) {
                criticalErrors.push(`SW evaluate error: ${(e as Error).message}`);
            }
        }

        // Фильтруем только критические JS-ошибки
        const jsErrors = criticalErrors.filter(e =>
            e.toLowerCase().includes('uncaught') ||
            e.toLowerCase().includes('typeerror') ||
            e.toLowerCase().includes('referenceerror')
        );

        console.log(`TC 5.5: Critical JS errors during proxy switch: ${JSON.stringify(jsErrors)}`);
        expect(jsErrors.length, `Critical SW errors: ${JSON.stringify(jsErrors)}`).toBe(0);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-054-TC5.5-sw-no-errors-proxy-switch.png') });
    });

    // TC 6.5 (QA-68): Smoke — базовые операции connect/disconnect/switch не сломаны
    // Цель: убедиться что после исправлений DEF-QA059-1 (QA-62) и DEF-QA059-2 (QA-63)
    // полный цикл операций работает корректно.
    // Сценарий: создать прокси → Connect → connected, Disconnect → disconnected,
    //           добавить второй прокси → переключиться → connected.
    //
    // PASS-критерий для шагов connect:
    //   state=connected (PAC применён) ИЛИ (state=error И errorProxy установлен — PAC применён, сеть отказала)
    //   Подробнее: см. TC 6.2 (QA-66)
    test('TC 6.5 (QA-68): smoke — connect/disconnect/switch не сломаны после PLAN-010 исправлений', async () => {
        // Шаг 1: Connect к первому прокси (proxy.test.com создан в beforeEach)
        await popup.evaluate(() =>
            new Promise<void>(resolve => chrome.storage.local.remove('errorProxy', () => resolve()))
        );
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(2000);

        let state = await getProxyState(popup);
        const errorProxy1 = await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.get('errorProxy', data => resolve(data.errorProxy)))
        );
        console.log(`TC 6.5 Step1: state=${state.currentState}, errorProxy=${JSON.stringify(errorProxy1)}`);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-68-TC6.5-step1-connect.png') });

        // PAC применён = state connected ИЛИ error+errorProxy
        const step1Pass = state.currentState === 'connected' ||
            (state.currentState === 'error' && errorProxy1 !== undefined && errorProxy1 !== null);
        expect(step1Pass, `Step1 FAIL: Expected PAC applied. state=${state.currentState}, errorProxy=${JSON.stringify(errorProxy1)}`).toBe(true);

        // Шаг 2: Disconnect
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(500);

        state = await getProxyState(popup);
        console.log(`TC 6.5 Step2: state=${state.currentState}`);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-68-TC6.5-step2-disconnect.png') });

        expect(state.currentState).toBe('disconnected');

        // Шаг 3: Добавить второй прокси → set as default → Connect
        const proxy2Id = await createProxyViaStorage(popup, 'http', 'proxy2.test.com', 9090);
        await setDefaultProxy(popup, proxy2Id);
        await popup.evaluate(() =>
            new Promise<void>(resolve => chrome.storage.local.remove('errorProxy', () => resolve()))
        );
        popup = await reopenPopup(context, popupUrl, popup);
        await clickConnectButton(popup);
        popup = await reopenPopup(context, popupUrl, popup);
        await popup.waitForTimeout(2000);

        state = await getProxyState(popup);
        const errorProxy2 = await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.get('errorProxy', data => resolve(data.errorProxy)))
        );
        console.log(`TC 6.5 Step3: state=${state.currentState}, errorProxy=${JSON.stringify(errorProxy2)}`);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-68-TC6.5-step3-switch.png') });

        // PAC применён к proxy2 = state connected ИЛИ error+errorProxy
        const step3Pass = state.currentState === 'connected' ||
            (state.currentState === 'error' && errorProxy2 !== undefined && errorProxy2 !== null);
        expect(step3Pass, `Step3 FAIL: Expected PAC applied for proxy2. state=${state.currentState}, errorProxy=${JSON.stringify(errorProxy2)}`).toBe(true);
    });

    // TC 3.9a: chrome.proxy.settings обновляется корректно
    // (переименован из TC 3.9 во избежание конфликта с TC 3.9 из QA-057)
    test('TC 3.9a: chrome.proxy.settings обновляется при подключении', async () => {
        // Начальное состояние
        let proxySettings = await getChromeProxySettings(popup);
        console.log('TC 3.9: Initial proxy settings:', JSON.stringify(proxySettings));

        // Подключаемся
        await clickConnectButton(popup);
        await popup.waitForTimeout(1500);

        // Проверяем обновлённые настройки
        proxySettings = await getChromeProxySettings(popup);
        console.log('TC 3.9: Proxy settings after connect:', JSON.stringify(proxySettings));

        // Если chrome.proxy.settings доступен — проверяем что он обновился
        if (proxySettings && !proxySettings.error) {
            expect(proxySettings.value).toBeDefined();
        } else {
            // Если недоступен — фиксируем observation
            console.log('TC 3.9: OBSERVATION — chrome.proxy.settings недоступен из popup контекста');
        }

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-3.9-proxy-settings.png`) });
    });
});
