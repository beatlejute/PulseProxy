import { mockHelpers } from '../setup';

let ProxyManager: typeof import('../../src/background/proxy-manager').ProxyManager;

const createPreset = (
    domains: string[],
    enabled = true,
    isDefault = false,
    id = 'test-preset',
    extra: Record<string, unknown> = {}
) => ({
    id,
    name: 'Test',
    domains,
    enabled,
    isDefault,
    order: 0,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
});

const createProxy = (host: string, port: number, type: string = 'http') => ({
    id: 'test-proxy',
    type,
    host,
    port,
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
});

describe('proxy-route-pool.ts - ProxyManager pool routing', () => {
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

    describe('getRouteForUrl() with pool preset', () => {
        it('should return pool route with preset id and pool rule for matching domain wildcard', async () => {
            const proxy1 = { protocol: 'socks5' as const, ip: '1.2.3.4', port: 1080, score: 5, connectionType: 'residential' as const, country: 'US' };
            const proxy2 = { protocol: 'socks5' as const, ip: '5.6.7.8', port: 1081, score: 4, connectionType: 'residential' as const, country: 'US' };

            mockHelpers.setLocalStorageData({
                migrationCompleted: true,
                proxies: [createProxy('10.0.0.1', 8080)],
                presets: [{
                    ...createPreset(['*.example.com'], true, false, 'pool-preset-1'),
                    proxyId: null,
                    publicPool: { protocols: ['socks5'] },
                }],
                publicProxyCatalog: {
                    fetchedAt: Date.now(),
                    proxies: [proxy1, proxy2],
                },
                publicProxyCheckResults: {
                    'socks5://1.2.3.4:1080': { status: 'alive', checkedAt: Date.now() },
                    'socks5://5.6.7.8:1081': { status: 'alive', checkedAt: Date.now() },
                },
            });

            await ProxyManager.enable();

            const route = ProxyManager.getRouteForUrl('http://a.example.com/path');

            expect(route).not.toBeNull();
            expect(route?.kind).toBe('pool');
            expect(route?.presetId).toBe('pool-preset-1');
            expect(route?.poolRule).toBe('*.example.com');
            expect(route?.server).toBeNull();
        });

        it('should return pool route with correct pool members from PAC', async () => {
            const proxy1 = { protocol: 'socks5' as const, ip: '1.2.3.4', port: 1080, score: 5, connectionType: 'residential' as const, country: 'US' };
            const proxy2 = { protocol: 'socks5' as const, ip: '5.6.7.8', port: 1081, score: 4, connectionType: 'residential' as const, country: 'US' };
            const proxy3 = { protocol: 'socks5' as const, ip: '9.10.11.12', port: 1082, score: 3, connectionType: 'residential' as const, country: 'US' };

            mockHelpers.setLocalStorageData({
                migrationCompleted: true,
                proxies: [createProxy('10.0.0.1', 8080)],
                presets: [{
                    ...createPreset(['pool-site.com'], true, false, 'pool-preset-2'),
                    proxyId: null,
                    publicPool: { protocols: ['socks5'] },
                }],
                publicProxyCatalog: {
                    fetchedAt: Date.now(),
                    proxies: [proxy1, proxy2, proxy3],
                },
                publicProxyCheckResults: {
                    'socks5://1.2.3.4:1080': { status: 'alive', checkedAt: Date.now() },
                    'socks5://5.6.7.8:1081': { status: 'alive', checkedAt: Date.now() },
                    'socks5://9.10.11.12:1082': { status: 'alive', checkedAt: Date.now() },
                },
            });

            await ProxyManager.enable();

            const route = ProxyManager.getRouteForUrl('http://pool-site.com/');

            expect(route).not.toBeNull();
            expect(route?.kind).toBe('pool');
            expect(route?.poolMembers).toBeDefined();
            expect(route?.poolMembers?.length).toBeGreaterThan(0);
            route?.poolMembers?.forEach(member => {
                expect(member.key).toBeDefined();
                expect(member.ip).toBeDefined();
                expect(member.pac).toBeDefined();
            });
        });

        it('should return null for domain in ignore list', async () => {
            mockHelpers.setLocalStorageData({
                migrationCompleted: true,
                proxies: [createProxy('10.0.0.1', 8080)],
                presets: [
                    createPreset(['ignored.com'], true, true, 'default-preset'),
                    createPreset(['*.example.com'], true, false, 'test-preset'),
                ],
            });

            await ProxyManager.enable();

            const route = ProxyManager.getRouteForUrl('http://ignored.com/path');

            expect(route).toBeNull();
        });

        it('should return own route without pool fields for own proxy preset', async () => {
            mockHelpers.setLocalStorageData({
                migrationCompleted: true,
                proxies: [createProxy('10.0.0.1', 8080)],
                presets: [createPreset(['own-site.com'], true, false, 'own-preset')],
            });

            await ProxyManager.enable();

            const route = ProxyManager.getRouteForUrl('http://own-site.com/');

            expect(route).not.toBeNull();
            expect(route?.kind).toBe('own');
            expect(route?.presetId).toBeUndefined();
            expect(route?.poolRule).toBeUndefined();
            expect(route?.poolMembers).toBeUndefined();
            expect(route?.server).not.toBeNull();
        });
    });
});
