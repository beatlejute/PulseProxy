import { StorageKeys, ProxyState } from '../../src/shared/constants';
import { mockFetchSuccess, mockFetchNetworkError, mockFetchTimeout } from '../setup';

// Mock dependencies
const mockProxyManager = {
    init: jest.fn(),
    toggle: jest.fn(),
    enable: jest.fn().mockResolvedValue(undefined),
    disable: jest.fn().mockResolvedValue(undefined),
    restoreAfterCheck: jest.fn().mockResolvedValue(undefined),
    removeTemporaryCredentials: jest.fn().mockResolvedValue(undefined),
    addTemporaryCredentials: jest.fn().mockResolvedValue(undefined),
    generateCheckPacScript: jest.fn().mockReturnValue('function FindProxyForURL(url, host) { return "PROXY test"; }'),
};

const mockIconManager = {
    update: jest.fn(),
    setIcon: jest.fn()
};

const mockStorage = {
    init: jest.fn().mockResolvedValue(undefined),
    onChange: jest.fn(),
    getCurrentState: jest.fn(),
};

jest.mock('../../src/background/proxy-manager', () => ({
    ProxyManager: mockProxyManager
}));



jest.mock('../../src/background/icon-manager', () => ({
    IconManager: mockIconManager
}));

jest.mock('../../src/shared/storage', () => ({
    Storage: mockStorage
}));

// Import helper functions from the module under test
let resetIsChecking: () => void;
let getIsChecking: () => boolean;

// Mock chrome API
const mockMessageListeners: Array<(message: Record<string, unknown>, sender: unknown, sendResponse: unknown) => void> = [];

beforeAll(() => {
    (global as unknown as Record<string, unknown>).chrome = {
        runtime: {
            onMessage: {
                addListener: jest.fn((callback) => {
                    mockMessageListeners.push(callback);
                })
            }
        }
    };
});

describe('Background Script', () => {
    let storageChangeCallback: (changes: Record<string, unknown>, area: string) => void;

    beforeEach(() => {
        jest.clearAllMocks();
        mockMessageListeners.length = 0;
        
        // Capture the storage change callback
        mockStorage.onChange.mockImplementation((callback: (changes: Record<string, unknown>, area: string) => void) => {
            storageChangeCallback = callback;
        });
    });

    describe('Storage change handler', () => {
        beforeEach(() => {
            // Simulate registering the handler
            storageChangeCallback = mockStorage.onChange.mock.calls?.[0]?.[0] || ((changes: Record<string, unknown>, area: string) => {
                if (area === 'local') {
                    if (StorageKeys.TARGET_STATE in changes) {
                        mockProxyManager.toggle();
                    }
                    if (StorageKeys.CURRENT_STATE in changes) {
                        mockIconManager.update();
                    }
                }
                if (area === 'sync') {
                    if (StorageKeys.PRESETS in changes || StorageKeys.PROXIES in changes) {
                        mockProxyManager.init();
                    }
                }
            });
        });

        it('should toggle proxy when target state changes in local storage', () => {
            storageChangeCallback({
                [StorageKeys.TARGET_STATE]: {
                    newValue: 'connected',
                    oldValue: 'disconnected'
                }
            }, 'local');

            expect(mockProxyManager.toggle).toHaveBeenCalled();
        });

        it('should update icon when current state changes in local storage', () => {
            storageChangeCallback({
                [StorageKeys.CURRENT_STATE]: {
                    newValue: 'connected',
                    oldValue: 'disconnected'
                }
            }, 'local');

            expect(mockIconManager.update).toHaveBeenCalled();
        });

        it('should reinitialize proxy when presets change in sync storage', () => {
            storageChangeCallback({
                [StorageKeys.PRESETS]: {
                    newValue: [],
                    oldValue: []
                }
            }, 'sync');

            expect(mockProxyManager.init).toHaveBeenCalled();
        });

        it('should reinitialize proxy when proxies change in sync storage', () => {
            storageChangeCallback({
                [StorageKeys.PROXIES]: {
                    newValue: [],
                    oldValue: []
                }
            }, 'sync');

            expect(mockProxyManager.init).toHaveBeenCalled();
        });

        it('should not toggle proxy for local changes with unrelated keys', () => {
            storageChangeCallback({
                someOtherKey: {
                    newValue: 'value',
                    oldValue: 'oldValue'
                }
            }, 'local');

            expect(mockProxyManager.toggle).not.toHaveBeenCalled();
            expect(mockIconManager.update).not.toHaveBeenCalled();
        });

        it('should not react to sync changes with unrelated keys', () => {
            storageChangeCallback({
                someOtherKey: {
                    newValue: 'value',
                    oldValue: 'oldValue'
                }
            }, 'sync');

            expect(mockProxyManager.init).not.toHaveBeenCalled();
        });
    });

    describe('Message handler', () => {
        let messageHandler: (message: Record<string, unknown>, sender: unknown, sendResponse: unknown) => void;

        beforeEach(() => {
            // Create message handler matching the source code
            messageHandler = (message: Record<string, unknown>, _sender: unknown, _sendResponse: unknown) => {
                switch (message.action) {
                    case 'toggleProxy':
                        mockProxyManager.toggle();
                        break;
                    case 'updateIcon':
                        if (message.iconPath) {
                            mockIconManager.setIcon(message.iconPath);
                        }
                        break;
                }
            };
        });

        it('should toggle proxy on toggleProxy message', () => {
            messageHandler({ action: 'toggleProxy' }, {}, jest.fn());

            expect(mockProxyManager.toggle).toHaveBeenCalled();
        });

        it('should set icon on updateIcon message with iconPath', () => {
            messageHandler({ action: 'updateIcon', iconPath: '/path/to/icon.png' }, {}, jest.fn());

            expect(mockIconManager.setIcon).toHaveBeenCalledWith('/path/to/icon.png');
        });

        it('should not set icon on updateIcon message without iconPath', () => {
            messageHandler({ action: 'updateIcon' }, {}, jest.fn());

            expect(mockIconManager.setIcon).not.toHaveBeenCalled();
        });

        it('should handle unknown actions gracefully', () => {
            expect(() => {
                messageHandler({ action: 'unknownAction' }, {}, jest.fn());
            }).not.toThrow();
        });
    });

    describe('init function', () => {
        it('should initialize storage', async () => {
            await mockStorage.init();
            expect(mockStorage.init).toHaveBeenCalled();
        });

        it('should update icon after storage init', async () => {
            // Simulate init sequence
            await mockStorage.init();
            mockIconManager.update();
            
            expect(mockIconManager.update).toHaveBeenCalled();
        });

        it('should initialize proxy manager after storage init', async () => {
            // Simulate init sequence
            await mockStorage.init();
            mockProxyManager.init();

            expect(mockProxyManager.init).toHaveBeenCalled();
        });
    });

    // TDD: тесты написаны ДО реализации IMPL-40 → изначально RED
    // После IMPL-40 (рефакторинг checkProxy на fetch + методы ProxyManager) → GREEN
    describe('checkProxy() — восстановление состояния в finally (TDD: IMPL-40)', () => {
        let indexMessageHandler: (
            message: Record<string, unknown>,
            sender: unknown,
            sendResponse: (response: unknown) => void
        ) => boolean | void;

        const TEST_PROXY = { type: 'http', host: 'proxy.test', port: 8080 };

        beforeAll(async () => {
            // Полифилл Response (jsdom 28 не экспортирует его глобально, но mockFetchSuccess его использует)
            if (typeof (globalThis as Record<string, unknown>).Response === 'undefined') {
                (globalThis as Record<string, unknown>).Response = class MockResponse {
                    status: number;
                    ok: boolean;
                    constructor(_body: null, init?: { status?: number }) {
                        this.status = init?.status ?? 200;
                        this.ok = this.status >= 200 && this.status < 300;
                    }
                };
            }

            // Расширяем chrome-мок: добавляем API, необходимые для импорта src/background/index.ts
            const chromeGlobal = (global as unknown as { chrome: Record<string, unknown> }).chrome as Record<string, unknown>;
            const runtime = chromeGlobal.runtime as Record<string, unknown>;
            runtime.setUninstallURL = jest.fn();
            runtime.onInstalled = { addListener: jest.fn(), removeListener: jest.fn() };

            chromeGlobal.webNavigation = {
                onCommitted: { addListener: jest.fn(), removeListener: jest.fn() },
                onCompleted: { addListener: jest.fn(), removeListener: jest.fn() },
                onErrorOccurred: { addListener: jest.fn(), removeListener: jest.fn() },
            };
            chromeGlobal.tabs = {
                create: jest.fn((_opts: unknown, cb?: (tab: { id: number }) => void) => {
                    if (cb) cb({ id: 1 });
                }),
                remove: jest.fn().mockResolvedValue(undefined),
                get: jest.fn().mockResolvedValue({ url: 'http://example.com' }),
                query: jest.fn().mockResolvedValue([]),
                onActivated: { addListener: jest.fn(), removeListener: jest.fn() },
            };
            chromeGlobal.alarms = {
                create: jest.fn(),
                onAlarm: { addListener: jest.fn(), removeListener: jest.fn() },
            };
            chromeGlobal.webRequest = {
                onAuthRequired: { addListener: jest.fn(), removeListener: jest.fn() },
                onErrorOccurred: { addListener: jest.fn(), removeListener: jest.fn() },
                onCompleted: { addListener: jest.fn(), removeListener: jest.fn() },
            };
            chromeGlobal.proxy = {
                settings: {
                    set: jest.fn((_details: unknown, cb?: () => void) => { if (cb) cb(); }),
                    clear: jest.fn((_details: unknown, cb?: () => void) => { if (cb) cb(); }),
                },
            };

            // Импортируем реальный src/background/index.ts для захвата обработчика сообщений
            jest.resetModules();
            const indexModule = await import('../../src/background/index');
            resetIsChecking = indexModule.resetIsChecking;
            getIsChecking = indexModule.getIsChecking;

            // Захватываем зарегистрированный обработчик chrome.runtime.onMessage
            const onMsgAddListener = (runtime.onMessage as { addListener: jest.Mock }).addListener;
            const calls = onMsgAddListener.mock.calls;
            indexMessageHandler = calls[calls.length - 1]?.[0];
        });

        beforeEach(() => {
            jest.useFakeTimers();
            (mockProxyManager.restoreAfterCheck as jest.Mock).mockReset().mockResolvedValue(undefined);
            (mockProxyManager.removeTemporaryCredentials as jest.Mock).mockReset().mockResolvedValue(undefined);
            (mockStorage.getCurrentState as jest.Mock).mockReset();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        const dispatchCheckProxy = (proxy = TEST_PROXY): Promise<unknown> => {
            return new Promise<unknown>((resolve) => {
                const isAsync = indexMessageHandler({ action: 'checkProxy', proxy }, {}, resolve);
                if (!isAsync) resolve(undefined);
            });
        };

        it('TC1: restoreAfterCheck(true) вызван после успешной проверки при подключённом прокси', async () => {
            (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.CONNECTED);
            mockFetchSuccess();

            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            expect(mockProxyManager.restoreAfterCheck).toHaveBeenCalledWith(true);
            expect(mockProxyManager.restoreAfterCheck).toHaveBeenCalledTimes(1);
        });

        it('TC2: restoreAfterCheck(false) вызван после неудачной проверки при отключённом прокси', async () => {
            (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            mockFetchNetworkError();

            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            expect(mockProxyManager.restoreAfterCheck).toHaveBeenCalledWith(false);
            expect(mockProxyManager.restoreAfterCheck).toHaveBeenCalledTimes(1);
        });

        it('TC3: removeTemporaryCredentials и restoreAfterCheck вызваны в finally даже при неожиданном исключении fetch', async () => {
            (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('unexpected'));

            const checkDone = dispatchCheckProxy();
            await jest.runAllTimersAsync();
            await checkDone;

            expect(mockProxyManager.removeTemporaryCredentials).toHaveBeenCalled();
            expect(mockProxyManager.restoreAfterCheck).toHaveBeenCalled();
        });

        // TDD: тесты credentials lifecycle — изначально RED (IMPL-40 не реализован).
        // После IMPL-40 (рефакторинг checkProxy на addTemporaryCredentials/removeTemporaryCredentials) → GREEN
        describe('credentials lifecycle (TDD: IMPL-40)', () => {
            const PROXY_WITH_CREDENTIALS = { type: 'http', host: 'proxy.test', port: 8080, username: 'user', password: 'pass' };
            const PROXY_WITHOUT_CREDENTIALS = { type: 'http', host: 'proxy.test', port: 8080 };

            it('TC1: прокси с credentials → addTemporaryCredentials() вызван до fetch, removeTemporaryCredentials() вызван в finally даже если fetch упал', async () => {
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);

                const callOrder: string[] = [];

                (mockProxyManager.addTemporaryCredentials as jest.Mock).mockReset().mockImplementation(() => {
                    callOrder.push('addTemporaryCredentials');
                    return Promise.resolve();
                });
                (mockProxyManager.removeTemporaryCredentials as jest.Mock).mockReset().mockImplementation(() => {
                    callOrder.push('removeTemporaryCredentials');
                    return Promise.resolve();
                });
                (global.fetch as jest.Mock).mockImplementation(() => {
                    callOrder.push('fetch');
                    return Promise.reject(new TypeError('Failed to fetch'));
                });

                const checkDone = dispatchCheckProxy(PROXY_WITH_CREDENTIALS);
                await jest.runAllTimersAsync();
                await checkDone;

                expect(mockProxyManager.addTemporaryCredentials).toHaveBeenCalled();
                expect(mockProxyManager.removeTemporaryCredentials).toHaveBeenCalled();

                const addIdx = callOrder.indexOf('addTemporaryCredentials');
                const fetchIdx = callOrder.indexOf('fetch');
                const removeIdx = callOrder.indexOf('removeTemporaryCredentials');

                expect(addIdx).toBeGreaterThanOrEqual(0);
                expect(fetchIdx).toBeGreaterThan(addIdx);   // add BEFORE fetch
                expect(removeIdx).toBeGreaterThan(fetchIdx); // remove in finally (after fetch, even if failed)
            });

            it('TC2: прокси без credentials → addTemporaryCredentials() не вызван', async () => {
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
                (mockProxyManager.addTemporaryCredentials as jest.Mock).mockReset().mockResolvedValue(undefined);
                (global.fetch as jest.Mock).mockResolvedValueOnce(new Response(null, { status: 200 }));

                const checkDone = dispatchCheckProxy(PROXY_WITHOUT_CREDENTIALS);
                await jest.runAllTimersAsync();
                await checkDone;

                expect(mockProxyManager.addTemporaryCredentials).not.toHaveBeenCalled();
            });
        });

        // TDD: тесты return-value checkProxy — изначально RED (IMPL-40 не реализован).
        // После IMPL-40 (рефакторинг checkProxy на fetch) → GREEN
        describe('return value (TDD: IMPL-40)', () => {
            it('TC1: fetch ok → результат "ok"', async () => {
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.CONNECTED);
                mockFetchSuccess(200);

                const checkDone = dispatchCheckProxy();
                await jest.runAllTimersAsync();
                const result = await checkDone;

                expect(result).toBe('ok');
            });

            it('TC2: fetch network error (TypeError) → результат "error"', async () => {
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
                mockFetchNetworkError();

                const checkDone = dispatchCheckProxy();
                await jest.runAllTimersAsync();
                const result = await checkDone;

                expect(result).toBe('error');
            });

            it('TC3: fetch timeout (AbortError) → результат "timeout"', async () => {
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
                mockFetchTimeout();

                const checkDone = dispatchCheckProxy();
                await jest.runAllTimersAsync();
                const result = await checkDone;

                expect(result).toBe('timeout');
            });
        });

        // TDD: тесты PAC setup и callback order — изначально RED (IMPL-40 не реализован).
        // После IMPL-40 (рефакторинг checkProxy на generateCheckPacScript + fetch) → GREEN
        describe('PAC setup и callback order (TDD: IMPL-40)', () => {
            it('TC1: chrome.proxy.settings.set() вызван с результатом generateCheckPacScript()', async () => {
                const MOCK_PAC = 'function FindProxyForURL(url, host) { if (url.indexOf("_pulse_check=") !== -1) return "PROXY proxy.test:8080"; return "DIRECT"; }';
                // Мокаем generateCheckPacScript (метод будет добавлен в IMPL-36)
                (mockProxyManager as unknown as Record<string, jest.Mock>).generateCheckPacScript = jest
                    .fn()
                    .mockReturnValue(MOCK_PAC);
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
                mockFetchSuccess();

                const checkDone = dispatchCheckProxy();
                await jest.runAllTimersAsync();
                await checkDone;

                const proxySettingsSet = (
                    (
                        (global as unknown as { chrome: Record<string, unknown> }).chrome
                            .proxy as Record<string, unknown>
                    ).settings as { set: jest.Mock }
                ).set;

                // generateCheckPacScript должен быть вызван
                expect(
                    (mockProxyManager as unknown as Record<string, jest.Mock>).generateCheckPacScript
                ).toHaveBeenCalled();
                // chrome.proxy.settings.set должен получить PAC-скрипт от generateCheckPacScript
                expect(proxySettingsSet).toHaveBeenCalledWith(
                    expect.objectContaining({
                        value: expect.objectContaining({
                            mode: 'pac_script',
                            pacScript: expect.objectContaining({ data: MOCK_PAC }),
                        }),
                    }),
                    expect.any(Function)
                );
            });

            it('TC2: fetch вызван ПОСЛЕ callback от chrome.proxy.settings.set(), не раньше', async () => {
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);

                let pendingCallback: (() => void) | null = null;
                const proxySettingsSet = (
                    (
                        (global as unknown as { chrome: Record<string, unknown> }).chrome
                            .proxy as Record<string, unknown>
                    ).settings as { set: jest.Mock }
                ).set;
                // Перехватываем callback — НЕ вызываем его сразу (имитируем задержку применения PAC)
                proxySettingsSet.mockImplementationOnce((_details: unknown, cb?: () => void) => {
                    pendingCallback = cb ?? null;
                });

                // Запускаем checkProxy
                const checkDone = dispatchCheckProxy();

                // Даём асинхронному коду дойти до точки ожидания callback от proxy.settings.set
                await Promise.resolve();
                await Promise.resolve();
                await Promise.resolve();

                // fetch НЕ должен быть вызван до получения callback
                expect(global.fetch).not.toHaveBeenCalled();

                // Устанавливаем мок fetch ДО вызова callback (он будет вызван в микротаске после callback)
                mockFetchSuccess();
                // Вызываем callback — PAC "применён", checkProxy продолжает выполнение
                pendingCallback?.();

                await jest.runAllTimersAsync();
                await checkDone;

                // fetch ДОЛЖЕН быть вызван после callback
                expect(global.fetch).toHaveBeenCalled();
            });

            it('TC3: URL fetch-запроса содержит _pulse_check=<uuid>', async () => {
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
                mockFetchSuccess();

                const checkDone = dispatchCheckProxy();
                await jest.runAllTimersAsync();
                await checkDone;

                const fetchMock = global.fetch as jest.Mock;
                expect(fetchMock).toHaveBeenCalled();
                const fetchUrl = fetchMock.mock.calls[0]?.[0] as string;
                // URL должен содержать _pulse_check=<непустая строка>
                expect(fetchUrl).toMatch(/_pulse_check=[^&\s]+/);
                const uuidMatch = fetchUrl.match(/_pulse_check=([^&\s]+)/);
                expect(uuidMatch?.[1]).toBeTruthy();
            });
        });

        // TDD: тесты guard-флага isChecking — изначально RED (IMPL-41 не реализован).
        // После IMPL-41 (добавление guard-флага isChecking в checkProxy) → GREEN
        describe('isChecking guard (TDD: IMPL-41)', () => {
            beforeEach(() => {
                resetIsChecking();
            });

            afterEach(() => {
                resetIsChecking();
            });

            it('TC1: повторный вызов при isChecking === true → немедленно возвращает "error"', async () => {
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.CONNECTED);

                // Первый fetch никогда не резолвится — держим первый checkProxy «в полёте»
                (global.fetch as jest.Mock).mockReturnValueOnce(new Promise<Response>(() => {}));

                // Запускаем первый checkProxy (зависает ожидая fetch)
                dispatchCheckProxy();

                // Даём асинхронному коду продвинуться до вызова fetch()
                for (let i = 0; i < 8; i++) await Promise.resolve();

                // Второй fetch тоже зависает — чтобы различить «немедленная ошибка» и «обработана»
                (global.fetch as jest.Mock).mockReturnValueOnce(new Promise<Response>(() => {}));

                // Второй вызов при isChecking === true должен вернуть 'error' немедленно
                let secondResolved = false;
                const secondDone = dispatchCheckProxy().then(result => {
                    secondResolved = true;
                    return result;
                });

                // Продвигаем микрозадачи, НЕ запуская таймеры
                for (let i = 0; i < 8; i++) await Promise.resolve();

                // С guard-флагом: второй вызов уже завершён (secondResolved === true)
                // Без guard-флага: второй вызов ожидает fetch → secondResolved === false → RED
                expect(secondResolved).toBe(true);
                const secondResult = await secondDone;
                expect(secondResult).toBe('error');
            });

            it('TC2: после завершения первого checkProxy → isChecking сброшен, следующий вызов работает нормально', async () => {
                // Первый вызов успешно завершается
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.CONNECTED);
                mockFetchSuccess();

                const firstDone = dispatchCheckProxy();
                await jest.runAllTimersAsync();
                await firstDone;

                // После завершения первого — второй должен работать нормально
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.CONNECTED);
                mockFetchSuccess();

                const secondDone = dispatchCheckProxy();
                await jest.runAllTimersAsync();
                const secondResult = await secondDone;

                // Если isChecking не сброшен — второй вызов вернёт немедленный 'error'
                expect(secondResult).not.toBe('error');
            });

            it('TC3: isChecking сбрасывается даже при ошибке — в finally', async () => {
                // Первый вызов завершается с ошибкой fetch
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
                mockFetchNetworkError();

                const firstDone = dispatchCheckProxy();
                await jest.runAllTimersAsync();
                await firstDone;

                // Второй вызов — isChecking должен быть сброшен в finally первого вызова
                (mockStorage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.CONNECTED);
                mockFetchSuccess();

                const secondDone = dispatchCheckProxy();
                await jest.runAllTimersAsync();
                const secondResult = await secondDone;

                // Если isChecking не сбросился в finally → второй вызов немедленно вернёт 'error'
                expect(secondResult).not.toBe('error');
            });
        });
    });
});