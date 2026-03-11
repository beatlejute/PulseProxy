import { mockHelpers } from '../setup';
import { ProxyState } from '../../src/shared/constants';
import { Storage } from '../../src/shared/storage';
import type { Preset, ProxyServer } from '../../src/types';

let ProxyManager: typeof import('../../src/background/proxy-manager').ProxyManager;

const createPreset = (
    domains: string[],
    enabled = true,
    isDefault = false,
    id = 'test-preset',
    proxyId: string | null = null
): Preset => ({
    id,
    name: 'Test Preset',
    domains,
    enabled,
    isDefault,
    proxyId,
    order: 0,
    createdAt: 0,
    updatedAt: 0,
});

const createProxy = (
    host: string,
    port: number,
    type: string = 'http',
    isDefault = true,
    username?: string,
    password?: string
): ProxyServer => ({
    id: 'test-proxy',
    type: type as ProxyServer['type'],
    host,
    port,
    isDefault,
    username,
    password,
    name: 'Test Proxy',
    createdAt: 0,
    updatedAt: 0,
});

describe('Proxy Toggle Integration Tests', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        jest.useFakeTimers();

        const proxyManagerModule = await import('../../src/background/proxy-manager');
        ProxyManager = proxyManagerModule.ProxyManager;

        mockHelpers.setLocalStorageData({
            migrationCompleted: true,
            targetState: ProxyState.DISCONNECTED,
            currentState: ProxyState.DISCONNECTED,
            presets: [],
            proxies: [],
            proxyByDefault: true,
        });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('enable() full cycle', () => {
        it('should call Storage.getActivePresets() and generate PAC', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset(['example.com', 'test.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            expect(chrome.proxy.settings.set).toHaveBeenCalledWith(
                {
                    value: {
                        mode: 'pac_script',
                        pacScript: { data: expect.any(String) },
                    },
                    scope: 'regular',
                },
                expect.any(Function)
            );

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('example.com');
            expect(pacScript).toContain('test.com');
            expect(pacScript).toContain('PROXY 127.0.0.1:8080');
            expect(pacScript).toContain('function FindProxyForURL');
        });

        it('should set currentState to CONNECTED after successful enable', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('10.0.0.1', 3128)],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const callback = setCall[1];
            callback();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: ProxyState.CONNECTED },
                expect.any(Function)
            );
        });

        it('should use Storage.getDefaultProxy() for proxy configuration', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxies: [
                    { ...createProxy('192.168.1.1', 8080), id: 'proxy-1', isDefault: false },
                    { ...createProxy('10.0.0.1', 3128), id: 'proxy-2', isDefault: true },
                ],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('10.0.0.1:3128');
            expect(pacScript).not.toContain('192.168.1.1:8080');
        });
    });

    describe('disable() flow', () => {
        it('should call chrome.proxy.settings.clear()', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                currentState: ProxyState.CONNECTED,
            });

            await ProxyManager.disable();

            expect(chrome.proxy.settings.clear).toHaveBeenCalledWith(
                { scope: 'regular' },
                expect.any(Function)
            );
        });

        it('should set currentState to DISCONNECTED after successful disable', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxies: [],
                migrationCompleted: true,
                currentState: ProxyState.CONNECTED,
            });

            await ProxyManager.disable();

            const clearCall = (chrome.proxy.settings.clear as jest.Mock).mock.calls[0];
            const callback = clearCall[1];
            callback();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: ProxyState.DISCONNECTED },
                expect.any(Function)
            );
        });

        it('should handle error during disable gracefully', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxies: [],
                migrationCompleted: true,
                currentState: ProxyState.CONNECTED,
            });

            mockHelpers.setLastError('Failed to clear proxy');

            await ProxyManager.disable();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: ProxyState.ERROR },
                expect.any(Function)
            );
        });
    });

    describe('Toggle with PAC cache', () => {
        it('should use cached PAC on second enable() with same configuration', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset(['cached.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            const firstCallCount = (chrome.proxy.settings.set as jest.Mock).mock.calls.length;
            (chrome.proxy.settings.set as jest.Mock).mockClear();

            await ProxyManager.enable();

            expect(chrome.proxy.settings.set).toHaveBeenCalledTimes(1);

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;
            expect(pacScript).toContain('cached.com');
        });

        it('should regenerate PAC when configuration changes', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset(['initial.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            (chrome.proxy.settings.set as jest.Mock).mockClear();

            mockHelpers.setLocalStorageData({
                presets: [createPreset(['initial.com', 'changed.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            expect(chrome.proxy.settings.set).toHaveBeenCalledTimes(1);

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;
            expect(pacScript).toContain('changed.com');
        });

        it('should regenerate PAC when proxy changes', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            (chrome.proxy.settings.set as jest.Mock).mockClear();

            mockHelpers.setLocalStorageData({
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('192.168.1.1', 3128)],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            expect(chrome.proxy.settings.set).toHaveBeenCalledTimes(1);

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;
            expect(pacScript).toContain('192.168.1.1:3128');
            expect(pacScript).not.toContain('127.0.0.1:8080');
        });

        it('should regenerate PAC when proxyByDefault changes', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                proxyByDefault: false,
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            (chrome.proxy.settings.set as jest.Mock).mockClear();

            mockHelpers.setLocalStorageData({
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                proxyByDefault: true,
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            expect(chrome.proxy.settings.set).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error handling during enable()', () => {
        it('should set state to ERROR when no proxy configured', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxies: [],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: ProxyState.ERROR },
                expect.any(Function)
            );
        });

        it('should throw error and set state to ERROR for invalid proxy host', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('<script>alert(1)</script>', 8080)],
                migrationCompleted: true,
            });

            await expect(ProxyManager.enable()).rejects.toThrow('Invalid proxy host');

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: ProxyState.ERROR },
                expect.any(Function)
            );
        });

        it('should throw error and set state to ERROR for invalid proxy port', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('proxy.example.com', 0)],
                migrationCompleted: true,
            });

            await expect(ProxyManager.enable()).rejects.toThrow('Invalid proxy port');

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: ProxyState.ERROR },
                expect.any(Function)
            );
        });

        it('should handle chrome.runtime.lastError during enable', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
            });

            mockHelpers.setLastError('Proxy settings error');

            await ProxyManager.enable();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: ProxyState.ERROR },
                expect.any(Function)
            );
        });
    });

    describe('Toggle flow with presets and proxies interaction', () => {
        it('should correctly route domains based on presets', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset(['google.com', 'youtube.com'], true, false, 'preset-1'),
                    createPreset(['facebook.com'], true, false, 'preset-2'),
                ],
                proxies: [
                    { ...createProxy('proxy1.com', 8080), id: 'proxy-1' },
                    { ...createProxy('proxy2.com', 8081), id: 'proxy-2' },
                ],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('google.com');
            expect(pacScript).toContain('youtube.com');
            expect(pacScript).toContain('facebook.com');
        });

        it('should handle preset with proxyId correctly', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset(['custom.com'], true, false, 'preset-1', 'custom-proxy'),
                ],
                proxies: [
                    { ...createProxy('custom.proxy.com', 8888), id: 'custom-proxy' },
                    { ...createProxy('default.proxy.com', 8080), id: 'default-proxy', isDefault: true },
                ],
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('custom.proxy.com:8888');
        });

        it('should handle ignore list (isDefault preset) correctly', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset(['ignore.com'], true, true, 'ignore-preset'),
                    createPreset(['proxy.com'], true, false, 'proxy-preset'),
                ],
                proxies: [createProxy('127.0.0.1', 8080)],
                proxyByDefault: true,
                migrationCompleted: true,
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('ignore.com');
            expect(pacScript).toContain('DIRECT');
        });
    });

    describe('toggle() method', () => {
        it('should enable proxy when targetState is CONNECTED', async () => {
            mockHelpers.setLocalStorageData({
                targetState: ProxyState.CONNECTED,
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
            });

            await ProxyManager.toggle();

            expect(chrome.proxy.settings.set).toHaveBeenCalled();
        });

        it('should disable proxy when targetState is DISCONNECTED', async () => {
            mockHelpers.setLocalStorageData({
                targetState: ProxyState.DISCONNECTED,
                presets: [],
                proxies: [],
                migrationCompleted: true,
            });

            await ProxyManager.toggle();

            expect(chrome.proxy.settings.clear).toHaveBeenCalled();
        });
    });

    describe('init() method', () => {
        it('should load domains and credentials on init', async () => {
            mockHelpers.setLocalStorageData({
                targetState: ProxyState.DISCONNECTED,
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
            });

            await ProxyManager.init();

            expect(chrome.storage.local.get).toHaveBeenCalled();
        });

        it('should schedule toggle when targetState is CONNECTED', async () => {
            mockHelpers.setLocalStorageData({
                targetState: ProxyState.CONNECTED,
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
            });

            await ProxyManager.init();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: ProxyState.CONNECTING },
                expect.any(Function)
            );

            await jest.runAllTimersAsync();

            expect(chrome.proxy.settings.set).toHaveBeenCalled();
        });
    });
});
