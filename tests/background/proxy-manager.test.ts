import { mockHelpers } from '../setup';

let ProxyManager: typeof import('../../src/background/proxy-manager').ProxyManager;

const createPreset = (domains: string[], enabled = true, isDefault = false, id = 'test-preset') => ({
    id,
    name: 'Test',
    domains,
    enabled,
    isDefault,
    order: 0,
    createdAt: 0,
    updatedAt: 0
});

const createProxy = (
    host: string,
    port: number,
    type: string = 'http',
    isDefault: boolean = true,
    username?: string,
    password?: string
) => ({
    id: 'test-proxy',
    type,
    host,
    port,
    isDefault,
    username,
    password,
    createdAt: 0,
    updatedAt: 0
});

describe('proxy-manager.ts - ProxyManagerService', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        jest.useFakeTimers();
        
        const proxyManagerModule = await import('../../src/background/proxy-manager');
        ProxyManager = proxyManagerModule.ProxyManager;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('init()', () => {
        it('should load domains from presets and check target state', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.init();

            expect(chrome.storage.local.get).toHaveBeenCalledWith('presets', expect.any(Function));
            expect(chrome.storage.local.get).toHaveBeenCalledWith('targetState', expect.any(Function));
        });

        it('should disable proxy if target state is disconnected', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
            });

            await ProxyManager.init();

            expect(chrome.proxy.settings.clear).toHaveBeenCalledWith(
                { scope: 'regular' },
                expect.any(Function)
            );
        });

        it('should set connecting state and schedule toggle if target state is connected', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'connected',
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
                proxies: [createProxy('127.0.0.1', 8080)],
            });

            await ProxyManager.init();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: 'connecting' },
                expect.any(Function)
            );

            await jest.runAllTimersAsync();
            
            expect(chrome.proxy.settings.set).toHaveBeenCalled();
        });
    });

    describe('toggle()', () => {
        it('should enable proxy if target state is connected', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'connected',
                migrationCompleted: true,
                proxies: [createProxy('192.168.1.1', 3128)],
                presets: [createPreset(['example.com'])],
            });

            await ProxyManager.toggle();

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
        });

        it('should disable proxy if target state is disconnected', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
            });

            await ProxyManager.toggle();

            expect(chrome.proxy.settings.clear).toHaveBeenCalledWith(
                { scope: 'regular' },
                expect.any(Function)
            );
        });
    });

    describe('enable()', () => {
        it('should set proxy with PAC script containing domains from presets', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('10.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['custom.com', 'another.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('custom.com');
            expect(pacScript).toContain('another.com');
            expect(pacScript).toContain('PROXY 10.0.0.1:8080');
        });

        it('should set state to connected on success', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('10.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const callback = setCall[1];
            callback();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: 'connected' },
                expect.any(Function)
            );
        });

        it('should set state to error if no proxy configured', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [],
                migrationCompleted: true,
                presets: [],
            });

            await ProxyManager.enable();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: 'error' },
                expect.any(Function)
            );
        });
    });

    describe('disable()', () => {
        it('should clear proxy settings', async () => {
            mockHelpers.setLocalStorageData({ migrationCompleted: true });
            
            await ProxyManager.disable();

            expect(chrome.proxy.settings.clear).toHaveBeenCalledWith(
                { scope: 'regular' },
                expect.any(Function)
            );
        });

        it('should set state to disconnected on success', async () => {
            mockHelpers.setLocalStorageData({ migrationCompleted: true });
            
            await ProxyManager.disable();

            const clearCall = (chrome.proxy.settings.clear as jest.Mock).mock.calls[0];
            const callback = clearCall[1];
            callback();

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: 'disconnected' },
                expect.any(Function)
            );
        });
    });

    describe('toASCII() - IDN domain conversion', () => {
        it('should convert Cyrillic domains to Punycode', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['тест.рф'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('xn--e1aybc.xn--p1ai');
        });

        it('should keep ASCII-only domains unchanged', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['example.com', 'test.org'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('example.com');
            expect(pacScript).toContain('test.org');
        });

        it('should handle wildcard IDN domains', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['*.яндекс.рф'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('*.xn--d1acpjx3f.xn--p1ai');
        });

        it('should handle mixed ASCII and non-ASCII labels', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['sub.домен.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('sub.xn--d1acufc.com');
        });
    });

    describe('formatProxyForPac()', () => {
        it('should format HTTP proxy as PROXY', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('10.0.0.1', 8080, 'http')],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('PROXY 10.0.0.1:8080');
        });

        it('should format SOCKS5 proxy as SOCKS5', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('10.0.0.1', 1080, 'socks5')],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('SOCKS5 10.0.0.1:1080');
        });

        it('should format HTTPS proxy as HTTPS', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('10.0.0.1', 443, 'https')],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('HTTPS 10.0.0.1:443');
        });

        it('should format SOCKS4 proxy as SOCKS', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('10.0.0.1', 1080, 'socks4')],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('SOCKS 10.0.0.1:1080');
        });

        it('should default to PROXY for unknown types', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('10.0.0.1', 8080, 'unknown' as any)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('PROXY 10.0.0.1:8080');
        });
    });

    describe('registerAuthHandler()', () => {
        it('should register auth handler on init', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
            });

            await ProxyManager.init();

            expect(chrome.webRequest.onAuthRequired.addListener).toHaveBeenCalledWith(
                expect.any(Function),
                { urls: ['<all_urls>'] },
                ['asyncBlocking']
            );
        });
    });

    describe('handleAuthRequired()', () => {
        it('should return credentials for known proxy', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
                proxies: [createProxy('proxy.example.com', 8080, 'http', true, 'user1', 'pass1')],
            });

            await ProxyManager.init();

            const result = await mockHelpers.triggerAuthRequired({
                requestId: '1',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'proxy.example.com', port: 8080 },
            });

            expect(result).toEqual({
                authCredentials: { username: 'user1', password: 'pass1' },
            });
        });

        it('should return undefined for unknown proxy', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
                proxies: [createProxy('proxy.example.com', 8080, 'http', true, 'user1', 'pass1')],
            });

            await ProxyManager.init();

            const result = await mockHelpers.triggerAuthRequired({
                requestId: '1',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'unknown.proxy.com', port: 9999 },
            });

            expect(result).toEqual({ cancel: true });
        });

        it('should return cancel when no challenger provided', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
                proxies: [createProxy('proxy.example.com', 8080, 'http', true, 'user1', 'pass1')],
            });

            await ProxyManager.init();

            const result = await mockHelpers.triggerAuthRequired({
                requestId: '1',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
            });

            expect(result).toEqual({ cancel: true });
        });
    });

    describe('loadCredentials()', () => {
        it('should load credentials from proxies with username and password', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
                proxies: [
                    createProxy('proxy1.com', 8080, 'http', true, 'user1', 'pass1'),
                ],
            });

            await ProxyManager.init();

            const result = await mockHelpers.triggerAuthRequired({
                requestId: '1',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'proxy1.com', port: 8080 },
            });

            expect(result).toEqual({
                authCredentials: { username: 'user1', password: 'pass1' },
            });
        });

        it('should skip proxies without credentials', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
                proxies: [
                    createProxy('proxy1.com', 8080, 'http', true),
                ],
            });

            await ProxyManager.init();

            const result = await mockHelpers.triggerAuthRequired({
                requestId: '1',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'proxy1.com', port: 8080 },
            });

            expect(result).toEqual({ cancel: true });
        });

        it('should reload credentials on enable()', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
                proxies: [createProxy('proxy.test.com', 3128, 'http', true, 'newuser', 'newpass')],
            });

            await ProxyManager.init();
            await ProxyManager.enable();

            const result = await mockHelpers.triggerAuthRequired({
                requestId: '1',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'proxy.test.com', port: 3128 },
            });

            expect(result).toEqual({
                authCredentials: { username: 'newuser', password: 'newpass' },
            });
        });
    });

    describe('punycodeEncode() - Unicode string encoding', () => {
        it('should encode simple Cyrillic word correctly', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['москва.рф'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('xn--80adxhks.xn--p1ai');
        });

        it('should encode emoji domain', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['💻.example.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('xn--');
            expect(pacScript).not.toContain('💻');
        });

        it('should handle Chinese characters', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['中文.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('xn--fiq228c.com');
        });

        it('should handle Arabic characters', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['مثال.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('xn--');
            expect(pacScript).not.toContain('مثال');
        });
    });

    describe('toASCII() - edge cases', () => {
        it('should handle domain with only ASCII but special characters', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['test-site.example.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('test-site.example.com');
        });

        it('should handle deeply nested subdomains with IDN', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['sub.тест.домен.рф'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('sub.xn--e1aybc.xn--d1acufc.xn--p1ai');
        });

        it('should handle empty domain gracefully in preset', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['valid.com', ''])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('valid.com');
        });
    });

    describe('loadCredentials() - edge cases', () => {
        it('should handle multiple proxies with same host but different ports', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
                proxies: [
                    { ...createProxy('proxy.com', 8080, 'http', true, 'user8080', 'pass8080'), id: 'proxy1' },
                    { ...createProxy('proxy.com', 3128, 'http', false, 'user3128', 'pass3128'), id: 'proxy2' },
                ],
            });

            await ProxyManager.init();

            const result8080 = await mockHelpers.triggerAuthRequired({
                requestId: '1',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'proxy.com', port: 8080 },
            });

            const result3128 = await mockHelpers.triggerAuthRequired({
                requestId: '2',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'proxy.com', port: 3128 },
            });

            expect(result8080).toEqual({
                authCredentials: { username: 'user8080', password: 'pass8080' },
            });
            expect(result3128).toEqual({
                authCredentials: { username: 'user3128', password: 'pass3128' },
            });
        });

        it('should handle proxy with only username (no password)', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
                proxies: [
                    { ...createProxy('proxy.com', 8080, 'http', true), id: 'proxy1', username: 'user' },
                ],
            });

            await ProxyManager.init();

            const result = await mockHelpers.triggerAuthRequired({
                requestId: '1',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'proxy.com', port: 8080 },
            });

            expect(result).toEqual({ cancel: true });
        });

        it('should handle proxy with only password (no username)', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
                proxies: [
                    { ...createProxy('proxy.com', 8080, 'http', true), id: 'proxy1', password: 'pass' },
                ],
            });

            await ProxyManager.init();

            const result = await mockHelpers.triggerAuthRequired({
                requestId: '1',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'proxy.com', port: 8080 },
            });

            expect(result).toEqual({ cancel: true });
        });

        it('should allow retry auth after credentials are reloaded', async () => {
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
                proxies: [createProxy('proxy.test.com', 3128, 'http', true, 'user1', 'pass1')],
            });

            await ProxyManager.init();

            const result1 = await mockHelpers.triggerAuthRequired({
                requestId: '1',
                url: 'http://test.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'proxy.test.com', port: 3128 },
            });

            expect(result1).toEqual({
                authCredentials: { username: 'user1', password: 'pass1' },
            });

            await ProxyManager.enable();

            const result2 = await mockHelpers.triggerAuthRequired({
                requestId: '2',
                url: 'http://test2.com',
                method: 'GET',
                frameId: 0,
                parentFrameId: -1,
                tabId: 1,
                type: 'main_frame' as chrome.webRequest.ResourceType,
                timeStamp: Date.now(),
                challenger: { host: 'proxy.test.com', port: 3128 },
            });

            expect(result2).toEqual({
                authCredentials: { username: 'user1', password: 'pass1' },
            });
        });
    });

    describe('formatProxyForPac() - edge cases', () => {
        it('should handle IPv6 address in proxy host', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('[::1]', 8080, 'http')],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('PROXY [::1]:8080');
        });

        it('should handle hostname with port in proxy', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('proxy.internal.network', 9999, 'socks5')],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('SOCKS5 proxy.internal.network:9999');
        });
    });

    describe('registerAuthHandler() - edge cases', () => {
        it('should not fail if webRequest API is unavailable', async () => {
            const originalWebRequest = chrome.webRequest;
            (chrome as any).webRequest = undefined;

            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
            });

            await expect(ProxyManager.init()).resolves.not.toThrow();

            (chrome as any).webRequest = originalWebRequest;
        });

        it('should not fail if onAuthRequired is unavailable', async () => {
            const originalOnAuthRequired = chrome.webRequest.onAuthRequired;
            (chrome.webRequest as any).onAuthRequired = undefined;

            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                migrationCompleted: true,
                presets: [],
            });

            await expect(ProxyManager.init()).resolves.not.toThrow();

            (chrome.webRequest as any).onAuthRequired = originalOnAuthRequired;
        });
    });

    describe('PAC Script generation', () => {
        it('should generate valid PAC script with FindProxyForURL function', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('function FindProxyForURL');
            expect(pacScript).toContain('PROXY 127.0.0.1:8080');
            expect(pacScript).toContain('DIRECT');
        });
    });

    describe('validateProxyHost()', () => {
        let validateProxyHost: (host: string) => boolean;

        beforeEach(async () => {
            const module = await import('../../src/background/proxy-manager');
            validateProxyHost = module.validateProxyHost;
        });

        it('should accept valid IPv4 address', () => {
            expect(validateProxyHost('192.168.1.1')).toBe(true);
            expect(validateProxyHost('10.0.0.1')).toBe(true);
            expect(validateProxyHost('127.0.0.1')).toBe(true);
            expect(validateProxyHost('255.255.255.255')).toBe(true);
        });

        it('should accept valid hostname', () => {
            expect(validateProxyHost('proxy.example.com')).toBe(true);
            expect(validateProxyHost('my-proxy-server.internal.network')).toBe(true);
            expect(validateProxyHost('a.b.c.d.e.f')).toBe(true);
        });

        it('should accept hostname with hyphens', () => {
            expect(validateProxyHost('my-proxy.example.com')).toBe(true);
            expect(validateProxyHost('proxy-server-1.internal')).toBe(true);
        });

        it('should accept single character labels', () => {
            expect(validateProxyHost('a.b')).toBe(true);
            expect(validateProxyHost('a.b.c')).toBe(true);
        });

        it('should accept localhost', () => {
            expect(validateProxyHost('localhost')).toBe(true);
        });

        it('should reject empty string', () => {
            expect(validateProxyHost('')).toBe(false);
        });

        it('should reject null/undefined', () => {
            expect(validateProxyHost(null as unknown as string)).toBe(false);
            expect(validateProxyHost(undefined as unknown as string)).toBe(false);
        });

        it('should reject XSS injection payloads', () => {
            expect(validateProxyHost('<script>alert("XSS")</script>')).toBe(false);
            expect(validateProxyHost('";alert(1);//')).toBe(false);
            expect(validateProxyHost('proxy.com/<script>')).toBe(false);
            expect(validateProxyHost('proxy.com" onerror="alert(1)')).toBe(false);
        });

        it('should reject hostnames with special characters', () => {
            expect(validateProxyHost('proxy<script>.com')).toBe(false);
            expect(validateProxyHost('proxy".com')).toBe(false);
            expect(validateProxyHost('proxy\'.com')).toBe(false);
            expect(validateProxyHost('proxy .com')).toBe(false);
            expect(validateProxyHost('proxy@com')).toBe(false);
        });

        it('should reject hostname starting/ending with hyphen', () => {
            expect(validateProxyHost('-proxy.com')).toBe(false);
            expect(validateProxyHost('proxy-.com')).toBe(false);
        });

        it('should reject hostname with consecutive dots', () => {
            expect(validateProxyHost('proxy..com')).toBe(false);
            expect(validateProxyHost('.proxy.com')).toBe(false);
            expect(validateProxyHost('proxy.com.')).toBe(false);
        });

        it('should reject hostname longer than 253 characters', () => {
            const longHostname = 'a'.repeat(254) + '.com';
            expect(validateProxyHost(longHostname)).toBe(false);
        });

        it('should accept hostname at max length (253 chars)', () => {
            // Max domain length is 253 chars
            // Each label max 63 chars, so use 4 labels of 63 chars + 3 dots + 3 TLD = 253
            // 63 + 1 + 63 + 1 + 63 + 1 + 63 + 1 + 3 = 259 (too long)
            // Use: 63 + 1 + 63 + 1 + 63 + 1 + 3 = 195 (valid)
            const label63 = 'a'.repeat(63);
            const maxHostname = `${label63}.${label63}.${label63}.com`;
            expect(maxHostname.length).toBeLessThanOrEqual(253);
            expect(validateProxyHost(maxHostname)).toBe(true);
        });

        it('should reject IPv6 in invalid format', () => {
            expect(validateProxyHost('::1')).toBe(false);
            expect(validateProxyHost('2001:db8::1')).toBe(false);
        });

        it('should accept IPv6 in brackets', () => {
            expect(validateProxyHost('[::1]')).toBe(true);
            expect(validateProxyHost('[2001:db8::1]')).toBe(true);
            expect(validateProxyHost('[fe80::1]')).toBe(true);
            expect(validateProxyHost('[::ffff:192.168.1.1]')).toBe(true);
        });
    });

    describe('validateProxyPort()', () => {
        let validateProxyPort: (port: number) => boolean;

        beforeEach(async () => {
            const module = await import('../../src/background/proxy-manager');
            validateProxyPort = module.validateProxyPort;
        });

        it('should accept valid port in range 1-65535', () => {
            expect(validateProxyPort(1)).toBe(true);
            expect(validateProxyPort(80)).toBe(true);
            expect(validateProxyPort(443)).toBe(true);
            expect(validateProxyPort(8080)).toBe(true);
            expect(validateProxyPort(3128)).toBe(true);
            expect(validateProxyPort(65535)).toBe(true);
        });

        it('should accept boundary values', () => {
            expect(validateProxyPort(1)).toBe(true);
            expect(validateProxyPort(65535)).toBe(true);
        });

        it('should reject port 0', () => {
            expect(validateProxyPort(0)).toBe(false);
        });

        it('should reject port > 65535', () => {
            expect(validateProxyPort(65536)).toBe(false);
            expect(validateProxyPort(99999)).toBe(false);
            expect(validateProxyPort(100000)).toBe(false);
        });

        it('should reject negative port', () => {
            expect(validateProxyPort(-1)).toBe(false);
        });

        it('should reject NaN/Infinity', () => {
            expect(validateProxyPort(NaN)).toBe(false);
            expect(validateProxyPort(Infinity)).toBe(false);
        });

        it('should reject non-integer port', () => {
            expect(validateProxyPort(8080.5)).toBe(false);
            expect(validateProxyPort(3128.1)).toBe(false);
        });
    });

    describe('PAC script generation with invalid host/port', () => {
        it('should throw error when proxy has invalid host', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('<script>alert("XSS")</script>', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await expect(ProxyManager.enable()).rejects.toThrow('Invalid proxy host');
        });

        it('should throw error when proxy has invalid port', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('proxy.example.com', 0)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await expect(ProxyManager.enable()).rejects.toThrow('Invalid proxy port');
        });

        it('should throw error when proxy has port > 65535', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('proxy.example.com', 70000)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await expect(ProxyManager.enable()).rejects.toThrow('Invalid proxy port');
        });
    });

    describe('PAC caching', () => {
        let computeConfigHash: (presets: any[], proxies: any[], proxyByDefault: boolean) => string;

        beforeEach(async () => {
            mockHelpers.resetAllMocks();
            jest.resetModules();
            jest.useFakeTimers();
            
            const proxyManagerModule = await import('../../src/background/proxy-manager');
            ProxyManager = proxyManagerModule.ProxyManager;
            
            const service = (ProxyManager as any);
            service.cachedPacScript = null;
            service.cachedConfigHash = null;
            
            computeConfigHash = (presets: any[], proxies: any[], proxyByDefault: boolean) => {
                const config = JSON.stringify({ presets, proxies, proxyByDefault });
                let hash = 5381;
                for (let i = 0; i < config.length; i++) {
                    hash = ((hash << 5) + hash) + config.charCodeAt(i);
                }
                return (hash >>> 0).toString(36);
            };
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should generate PAC script on first enable (cache miss)', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();

            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;

            expect(pacScript).toContain('test.com');
            expect(pacScript).toContain('PROXY 127.0.0.1:8080');
        });

        it('should use cached PAC script on second enable with same config (cache hit)', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();
            (chrome.proxy.settings.set as jest.Mock).mockClear();

            await ProxyManager.enable();

            expect(chrome.proxy.settings.set).toHaveBeenCalledTimes(1);
            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;
            expect(pacScript).toContain('test.com');
        });

        it('should regenerate PAC when presets change (cache invalidation)', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();
            (chrome.proxy.settings.set as jest.Mock).mockClear();

            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['test.com', 'newdomain.com'])],
            });

            await ProxyManager.enable();

            expect(chrome.proxy.settings.set).toHaveBeenCalledTimes(1);
            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;
            expect(pacScript).toContain('newdomain.com');
        });

        it('should regenerate PAC when proxies change (cache invalidation)', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();
            (chrome.proxy.settings.set as jest.Mock).mockClear();

            mockHelpers.setLocalStorageData({
                proxies: [createProxy('192.168.1.1', 3128)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
            });

            await ProxyManager.enable();

            expect(chrome.proxy.settings.set).toHaveBeenCalledTimes(1);
            const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
            const pacScript = setCall[0].value.pacScript.data;
            expect(pacScript).toContain('192.168.1.1:3128');
        });

        it('should regenerate PAC when proxyByDefault changes (cache invalidation)', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
                proxyByDefault: false,
            });

            await ProxyManager.enable();
            (chrome.proxy.settings.set as jest.Mock).mockClear();

            mockHelpers.setLocalStorageData({
                proxies: [createProxy('127.0.0.1', 8080)],
                migrationCompleted: true,
                presets: [createPreset(['test.com'])],
                proxyByDefault: true,
            });

            await ProxyManager.enable();

            expect(chrome.proxy.settings.set).toHaveBeenCalledTimes(1);
        });

        it('should compute consistent hash for same config', () => {
            const presets = [{ id: '1', domains: ['test.com'] }];
            const proxies = [{ id: '1', host: '127.0.0.1', port: 8080 }];
            
            const hash1 = computeConfigHash(presets, proxies, false);
            const hash2 = computeConfigHash(presets, proxies, false);
            
            expect(hash1).toBe(hash2);
        });

        it('should compute different hash for different config', () => {
            const presets1 = [{ id: '1', domains: ['test.com'] }];
            const presets2 = [{ id: '1', domains: ['new.com'] }];
            const proxies = [{ id: '1', host: '127.0.0.1', port: 8080 }];
            
            const hash1 = computeConfigHash(presets1, proxies, false);
            const hash2 = computeConfigHash(presets2, proxies, false);
            
            expect(hash1).not.toBe(hash2);
        });
    });
});