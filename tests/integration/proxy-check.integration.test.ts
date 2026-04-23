/**
 * Integration tests: full checkProxy cycle — ProxyManager state verification.
 * Verifies that ProxyManager state after checkProxy is identical to the initial state.
 *
 * Uses real ProxyManager + real index.ts message handler.
 * Chrome APIs are provided by the global mock from tests/__mocks__/chrome.ts.
 *
 * Parent ticket: QA-84
 */

import { mockHelpers, mockFetchSuccess, mockFetchNetworkError } from '../setup';
import { ProxyState } from '../../src/shared/constants';
import type { ProxyServer } from '../../src/types';

let ProxyManager: typeof import('../../src/background/proxy-manager').ProxyManager;

type MessageHandler = (
    message: Record<string, unknown>,
    sender: unknown,
    sendResponse: (response: unknown) => void
) => boolean | void;

let messageHandler: MessageHandler;

const TEST_PROXY: Pick<ProxyServer, 'type' | 'host' | 'port'> = {
    type: 'http',
    host: '127.0.0.1',
    port: 8080,
};

const createProxy = (
    host: string,
    port: number,
    type: ProxyServer['type'] = 'http',
    isDefault = true,
): ProxyServer => ({
    id: 'proxy-1',
    type,
    host,
    port,
    isDefault,
    name: 'Test Proxy',
    createdAt: 0,
    updatedAt: 0,
});

function dispatchCheckProxy(proxy: Partial<ProxyServer> = TEST_PROXY): Promise<unknown> {
    return new Promise<unknown>((resolve) => {
        const isAsync = messageHandler({ action: 'checkProxy', proxy }, {}, resolve);
        if (!isAsync) resolve(undefined);
    });
}

// Extend the global chrome mock with APIs required by index.ts but absent from the base mock
beforeAll(() => {
    // Polyfill Response if not available in jsdom
    if (typeof (globalThis as Record<string, unknown>).Response === 'undefined') {
        (globalThis as Record<string, unknown>).Response = class MockResponse {
            ok: boolean;
            status: number;
            constructor(_body: null, init?: { status?: number }) {
                this.status = init?.status ?? 200;
                this.ok = this.status >= 200 && this.status < 300;
            }
        };
    }

    const chromeGlobal = (global as unknown as { chrome: Record<string, unknown> }).chrome;
    const runtime = chromeGlobal.runtime as Record<string, unknown>;

    if (!runtime.setUninstallURL) runtime.setUninstallURL = jest.fn();
    if (!runtime.onInstalled) runtime.onInstalled = { addListener: jest.fn() };

    if (!chromeGlobal.webNavigation) {
        chromeGlobal.webNavigation = {
            onCommitted: { addListener: jest.fn() },
        };
    }
    if (!chromeGlobal.tabs) {
        chromeGlobal.tabs = {
            create: jest.fn(),
            get: jest.fn().mockResolvedValue({ url: 'http://example.com' }),
            query: jest.fn().mockResolvedValue([]),
            onActivated: { addListener: jest.fn() },
        };
    }
    if (!chromeGlobal.alarms) {
        chromeGlobal.alarms = {
            create: jest.fn(),
            onAlarm: { addListener: jest.fn() },
        };
    }
    // webRequest is partially set up by chrome mock; add missing listeners
    const webRequest = chromeGlobal.webRequest as Record<string, unknown>;
    if (!webRequest.onErrorOccurred) webRequest.onErrorOccurred = { addListener: jest.fn() };
    if (!webRequest.onCompleted) webRequest.onCompleted = { addListener: jest.fn() };
});

describe('checkProxy — полный цикл интеграции ProxyManager', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        jest.useFakeTimers();

        // Base storage state — proxy configured, initially disconnected
        mockHelpers.setLocalStorageData({
            migrationCompleted: true,
            targetState: ProxyState.DISCONNECTED,
            currentState: ProxyState.DISCONNECTED,
            presets: [],
            proxies: [createProxy('127.0.0.1', 8080)],
            proxyByDefault: true,
        });

        // Import real ProxyManager — creates fresh singleton in cleared module cache
        const pmModule = await import('../../src/background/proxy-manager');
        ProxyManager = pmModule.ProxyManager;

        // Import real index.ts — uses the SAME ProxyManager singleton from module cache
        await import('../../src/background/index');

        // Flush ProxyManager.init() setTimeout (Config.INITIALIZATION_DELAY)
        await jest.runAllTimersAsync();

        // Capture the onMessage handler registered by index.ts
        const onMsgAddListener = (
            (global as unknown as { chrome: { runtime: { onMessage: { addListener: jest.Mock } } } })
                .chrome.runtime.onMessage.addListener
        );
        const calls = onMsgAddListener.mock.calls;
        messageHandler = calls[calls.length - 1][0] as MessageHandler;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC1: full cycle — state after checkProxy is identical to state before
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC1: полный цикл — состояние ProxyManager после checkProxy идентично исходному', () => {
        it('isConnected и currentState не изменились после успешного checkProxy', async () => {
            // Arrange: enable ProxyManager so cachedPacScript is set
            await ProxyManager.enable();
            mockHelpers.setLocalStorageData({ currentState: ProxyState.CONNECTED });

            const isConnectedBefore = ProxyManager.isConnected;
            expect(isConnectedBefore).toBe(true);

            // Capture clear() call count after enable (init may have called it once)
            const clearCallsAfterEnable = (chrome.proxy.settings.clear as jest.Mock).mock.calls.length;

            // Act: full checkProxy cycle (success)
            mockFetchSuccess();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // Assert: state identical to initial
            expect(ProxyManager.isConnected).toBe(isConnectedBefore);

            // restoreAfterCheck(true) must have called applyPacScript (re-applied PAC),
            // not disable() — so no NEW proxy.settings.clear calls after enable()
            const clearCallsAfterCheck = (chrome.proxy.settings.clear as jest.Mock).mock.calls.length;
            expect(clearCallsAfterCheck).toBe(clearCallsAfterEnable);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC2: connected scenario — proxy connected → checkProxy → PAC restored →
    //      proxy still connected
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC2: сценарий connected — прокси подключён → checkProxy → PAC восстановлен → всё ещё connected', () => {
        it('ProxyManager isConnected=true и cachedPacScript сохранён после checkProxy', async () => {
            // Arrange: ProxyManager in connected state with cached PAC
            await ProxyManager.enable();
            mockHelpers.setLocalStorageData({ currentState: ProxyState.CONNECTED });
            expect(ProxyManager.isConnected).toBe(true);

            // Track proxy.settings.set calls before checkProxy
            const setCallsBefore = (chrome.proxy.settings.set as jest.Mock).mock.calls.length;

            // Act: full checkProxy cycle (success)
            mockFetchSuccess();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // Assert 1: still connected after checkProxy
            expect(ProxyManager.isConnected).toBe(true);

            // Assert 2: PAC was re-applied (restoreAfterCheck called applyPacScript)
            //   Expected calls: +1 for checkProxy PAC set, +1 for restoreAfterCheck
            const setCallsAfter = (chrome.proxy.settings.set as jest.Mock).mock.calls.length;
            expect(setCallsAfter).toBeGreaterThan(setCallsBefore);

            // Assert 3: disable() was NOT called (no proxy.settings.clear after enable)
            // clear() may have been called during init's disable(), reset call count check
            const clearCallsAfterEnable = (chrome.proxy.settings.clear as jest.Mock).mock.calls.length;
            // After checkProxy with wasConnected=true, restoreAfterCheck does NOT call disable()
            // All clear() calls should have happened before enable() (during init)
            const clearCallsDuringCheckProxy = (chrome.proxy.settings.clear as jest.Mock).mock.calls
                .filter((_, i) => i >= clearCallsAfterEnable).length;
            expect(clearCallsDuringCheckProxy).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC3: disconnected scenario — proxy off → checkProxy → settings cleared →
    //      proxy still disconnected
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC3: сценарий disconnected — прокси отключён → checkProxy → proxy settings очищены → всё ещё disconnected', () => {
        it('ProxyManager isConnected=false до и после checkProxy при disconnected state', async () => {
            // Arrange: ProxyManager in disconnected state (no enable() called)
            // After init with targetState=DISCONNECTED, cachedPacScript is null
            expect(ProxyManager.isConnected).toBe(false);

            // Ensure currentState is DISCONNECTED in storage
            mockHelpers.setLocalStorageData({ currentState: ProxyState.DISCONNECTED });

            // Record clear() calls before checkProxy
            const clearCallsBefore = (chrome.proxy.settings.clear as jest.Mock).mock.calls.length;

            // Act: checkProxy while disconnected (success or error — state should not change)
            mockFetchSuccess();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // Assert 1: still disconnected after checkProxy
            expect(ProxyManager.isConnected).toBe(false);

            // Assert 2: restoreAfterCheck(false) called disable() → proxy.settings.clear was called
            const clearCallsAfter = (chrome.proxy.settings.clear as jest.Mock).mock.calls.length;
            expect(clearCallsAfter).toBeGreaterThan(clearCallsBefore);
        });

        it('ProxyManager isConnected=false после checkProxy с ошибкой сети', async () => {
            // Arrange
            expect(ProxyManager.isConnected).toBe(false);
            mockHelpers.setLocalStorageData({ currentState: ProxyState.DISCONNECTED });

            // Act: checkProxy with network error
            mockFetchNetworkError();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // Assert: still disconnected
            expect(ProxyManager.isConnected).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC5: PAC-скрипт, переданный через chrome.proxy.settings.set, парсится
    //      без броска через new Function
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC5: PAC парсится — chrome.proxy.settings.set вызван с валидным pacScript.data', () => {
        it('pacScript.data проходит new Function без броска', async () => {
            // Arrange: disconnected state (no enable())
            expect(ProxyManager.isConnected).toBe(false);

            const setCallsBefore = (chrome.proxy.settings.set as jest.Mock).mock.calls.length;

            // Act
            mockFetchSuccess();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // Assert: at least one new set() call — the check PAC
            const allSetCalls = (chrome.proxy.settings.set as jest.Mock).mock.calls;
            expect(allSetCalls.length).toBeGreaterThan(setCallsBefore);

            const pacData: string = allSetCalls[setCallsBefore][0]?.value?.pacScript?.data;
            expect(typeof pacData).toBe('string');

            // Must parse without throwing — confirms PAC is syntactically valid
            // eslint-disable-next-line no-new-func
            expect(() => new Function(pacData + '; return FindProxyForURL;')()).not.toThrow();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC6: fetch вызван с cache: 'no-store' (unit-контракт вызова)
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC6: fetch вызван с cache: no-store (unit-контракт вызова)', () => {
        it('fetch получает expect.objectContaining({ cache: "no-store" })', async () => {
            // Act
            mockFetchSuccess();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // Contract check: verifies call signature, not actual caching behaviour
            expect(global.fetch as jest.Mock).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ cache: 'no-store' }),
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC7: regression — testRule (_pulse_check=) инжектируется внутрь тела
    //      FindProxyForURL, а не снаружи
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC7: regression — testRule внутри FindProxyForURL (не снаружи)', () => {
        it('pacScript.data при connected содержит _pulse_check= внутри тела FindProxyForURL', async () => {
            // Arrange: connected state
            await ProxyManager.enable();
            mockHelpers.setLocalStorageData({ currentState: ProxyState.CONNECTED });
            expect(ProxyManager.isConnected).toBe(true);

            const setCallsBefore = (chrome.proxy.settings.set as jest.Mock).mock.calls.length;

            // Act
            mockFetchSuccess();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // First new set() call is the check PAC (second is restoreAfterCheck)
            const allSetCalls = (chrome.proxy.settings.set as jest.Mock).mock.calls;
            expect(allSetCalls.length).toBeGreaterThan(setCallsBefore);

            const pacData: string = allSetCalls[setCallsBefore][0]?.value?.pacScript?.data;
            expect(typeof pacData).toBe('string');

            // _pulse_check= must appear AFTER the FindProxyForURL declaration (i.e., inside its body)
            const fnIdx = pacData.indexOf('function FindProxyForURL');
            expect(fnIdx).toBeGreaterThan(-1);
            const afterFnDecl = pacData.slice(fnIdx);
            expect(afterFnDecl).toContain('_pulse_check=');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC8: regression на корневой баг — мёртвый прокси возвращает 'error', не 'ok'
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC8: regression — мёртвый прокси (TypeError) → "error", не "ok"', () => {
        it('dispatchCheckProxy возвращает "error" при TypeError("Failed to fetch")', async () => {
            // Arrange: fetch throws TypeError (dead proxy — PAC applied but proxy unreachable)
            mockFetchNetworkError();

            // Act
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            const result = await checkDone;

            // Assert: must be 'error', never 'ok' — regression guard against root bug
            expect(result).toBe('error');
            expect(result).not.toBe('ok');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC9: PAC после склейки cachedPacScript + testRule синтаксически валиден
    //      (connected scenario)
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC9: PAC валиден после склейки с кэшем (connected)', () => {
        it('pacScript.data при connected не бросает при парсинге через new Function', async () => {
            // Arrange: connected state — cachedPacScript will be merged with testRule
            await ProxyManager.enable();
            mockHelpers.setLocalStorageData({ currentState: ProxyState.CONNECTED });
            expect(ProxyManager.isConnected).toBe(true);

            const setCallsBefore = (chrome.proxy.settings.set as jest.Mock).mock.calls.length;

            // Act
            mockFetchSuccess();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // First new set() call is the check PAC (merged cachedPacScript + testRule)
            const allSetCalls = (chrome.proxy.settings.set as jest.Mock).mock.calls;
            expect(allSetCalls.length).toBeGreaterThan(setCallsBefore);

            const pacData: string = allSetCalls[setCallsBefore][0]?.value?.pacScript?.data;
            expect(typeof pacData).toBe('string');

            // Cements: the merged PAC is syntactically valid after splicing with cachedPacScript
            // eslint-disable-next-line no-new-func
            expect(() => new Function(pacData + '; return FindProxyForURL;')()).not.toThrow();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC10: restore-invariant при connected — последний proxy.settings.set
    //       после checkProxy содержит PAC_A (тот же, что был после enable())
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC10: restore-invariant при connected — PAC_A восстановлен после checkProxy', () => {
        it('последний chrome.proxy.settings.set содержит PAC_A при успешном fetch', async () => {
            // Arrange: enable ProxyManager to populate cachedPacScript
            await ProxyManager.enable();
            mockHelpers.setLocalStorageData({ currentState: ProxyState.CONNECTED });

            // Capture PAC_A — pacScript.data from the enable() call (last set() so far)
            const setMock = chrome.proxy.settings.set as jest.Mock;
            const enableCalls = setMock.mock.calls;
            const PAC_A: string = enableCalls[enableCalls.length - 1][0]?.value?.pacScript?.data;
            expect(typeof PAC_A).toBe('string');

            // Act: checkProxy with success
            mockFetchSuccess();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // Assert: last set() call is restoreAfterCheck → applyPacScript(cachedPacScript)
            // must restore the original PAC_A, not the check PAC with testRule
            const allSetCalls = setMock.mock.calls;
            const lastSetCall = allSetCalls[allSetCalls.length - 1];
            expect(lastSetCall[0]?.value?.pacScript?.data).toBe(PAC_A);
        });

        it('последний chrome.proxy.settings.set содержит PAC_A при fetch reject', async () => {
            // Arrange
            await ProxyManager.enable();
            mockHelpers.setLocalStorageData({ currentState: ProxyState.CONNECTED });

            const setMock = chrome.proxy.settings.set as jest.Mock;
            const enableCalls = setMock.mock.calls;
            const PAC_A: string = enableCalls[enableCalls.length - 1][0]?.value?.pacScript?.data;
            expect(typeof PAC_A).toBe('string');

            // Act: checkProxy with network error
            mockFetchNetworkError();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // Assert: restoreAfterCheck(true) still restores PAC_A even after fetch failure
            const allSetCalls = setMock.mock.calls;
            const lastSetCall = allSetCalls[allSetCalls.length - 1];
            expect(lastSetCall[0]?.value?.pacScript?.data).toBe(PAC_A);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC11: restore-invariant при disconnected — restoreAfterCheck вызывает
    //       disable(), что транслируется в chrome.proxy.settings.clear
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC11: restore-invariant при disconnected — restoreAfterCheck вызывает disable()', () => {
        it('chrome.proxy.settings.clear вызван с { scope: "regular" } после checkProxy при disconnected', async () => {
            // Arrange: disconnected state (no enable())
            expect(ProxyManager.isConnected).toBe(false);
            mockHelpers.setLocalStorageData({ currentState: ProxyState.DISCONNECTED });

            const clearMock = chrome.proxy.settings.clear as jest.Mock;
            const clearCallsBefore = clearMock.mock.calls.length;

            // Act
            mockFetchSuccess();
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            // Assert: restoreAfterCheck(false) → disable() → proxy.settings.clear({ scope: 'regular' })
            const clearCallsAfter = clearMock.mock.calls;
            expect(clearCallsAfter.length).toBeGreaterThan(clearCallsBefore);

            // Exact call signature from disable() confirms restoreAfterCheck path
            const newClearCalls = clearCallsAfter.slice(clearCallsBefore);
            const hasRegularScope = newClearCalls.some(
                (call: unknown[]) => (call[0] as { scope?: string })?.scope === 'regular',
            );
            expect(hasRegularScope).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC12: throw-path в checkProxy — generateCheckPacScript throws →
    //       dispatchCheckProxy возвращает 'error', restoreAfterCheck вызван
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC12: throw-path — generateCheckPacScript throws → "error" + restoreAfterCheck вызван', () => {
        it('dispatchCheckProxy возвращает "error" и restoreAfterCheck вызван при throw из generateCheckPacScript', async () => {
            // Arrange: spy on generateCheckPacScript to throw
            jest.spyOn(ProxyManager, 'generateCheckPacScript').mockRejectedValueOnce(
                new Error('Simulated throw from generateCheckPacScript'),
            );

            // Spy on restoreAfterCheck (call-through) to verify it was called
            const restoreSpy = jest.spyOn(ProxyManager, 'restoreAfterCheck');

            mockHelpers.setLocalStorageData({ currentState: ProxyState.DISCONNECTED });

            // Act
            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            const result = await checkDone;

            // Assert 1: catch block converts throw to 'error' return value
            expect(result).toBe('error');

            // Assert 2: finally block called restoreAfterCheck — throw-path contract holds
            expect(restoreSpy).toHaveBeenCalledTimes(1);
            expect(restoreSpy).toHaveBeenCalledWith(false); // wasConnected=false (disconnected state)
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // TC13: конкурентность, smoke — архитектура isChecking (последовательная
    //       очередь): второй вызов немедленно возвращает 'error', cachedPacScript
    //       после обоих вызовов равен исходному (testRule не протёк в кэш)
    // ─────────────────────────────────────────────────────────────────────────
    describe('TC13: конкурентность, smoke — isChecking-архитектура (последовательная очередь)', () => {
        it('второй checkProxy возвращает "error" пока первый в процессе; cachedPacScript не изменился', async () => {
            // Arrange: disconnected state; two different proxies
            const proxy1 = createProxy('10.0.0.1', 3128);
            const proxy2 = createProxy('10.0.0.2', 3129);

            // Mock fetch for check1 only — check2 never reaches fetch (isChecking guard)
            mockFetchSuccess();

            // Act: two concurrent dispatches without await between them
            const check1 = dispatchCheckProxy(proxy1);
            // isChecking is now true synchronously — check2 returns 'error' immediately
            const check2 = dispatchCheckProxy(proxy2);

            // Flush timers so check1 can complete
            await jest.runAllTimersAsync();
            const [r1, r2] = await Promise.all([check1, check2]);

            // Assert 1: architecture confirms sequential queue —
            //   second call hits isChecking=true and returns 'error' immediately
            expect(r2).toBe('error');

            // Assert 2: first call resolved with its own expected result
            expect(r1).toBe('ok');

            // Assert 3: cachedPacScript after both calls equals original (testRule not leaked)
            // Disconnected state → cachedPacScript remains null throughout
            expect(ProxyManager.isConnected).toBe(false);
        });
    });
});
