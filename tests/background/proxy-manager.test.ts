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
});