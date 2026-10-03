import { mockHelpers } from '../setup';

let PublicProxyCatalog: typeof import('../../src/shared/public-proxy-catalog').PublicProxyCatalog;
let PUBLIC_PROXIES_PRIMARY_URL: string;
let PUBLIC_PROXIES_FALLBACK_URL: string;
let Storage: typeof import('../../src/shared/storage').Storage;

describe('PublicProxyCatalog.get()', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        (global.fetch as jest.Mock).mockReset();
        jest.resetModules();

        const catalogModule = await import('../../src/shared/public-proxy-catalog');
        PublicProxyCatalog = catalogModule.PublicProxyCatalog;
        PUBLIC_PROXIES_PRIMARY_URL = catalogModule.PUBLIC_PROXIES_PRIMARY_URL;
        PUBLIC_PROXIES_FALLBACK_URL = catalogModule.PUBLIC_PROXIES_FALLBACK_URL;

        const storageModule = await import('../../src/shared/storage');
        Storage = storageModule.Storage;

        // Clear cache between tests
        mockHelpers.setLocalStorageData({});
    });

    it('returns cached proxies without fetch when TTL not expired', async () => {
        const cachedProxies = [
            { protocol: 'http' as const, ip: '1.1.1.1', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' }
        ];
        const now = Date.now();
        const cache = { fetchedAt: now - 60000, proxies: cachedProxies };

        mockHelpers.setLocalStorageData({ publicProxyCatalog: cache });

        const result = await PublicProxyCatalog.get({ ttlMs: 3600000 });

        expect(result).toEqual(cachedProxies);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fetches and stores fresh catalog after TTL expires', async () => {
        const oldProxies = [
            { protocol: 'http' as const, ip: '1.1.1.1', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' }
        ];
        const now = Date.now();
        const oldCache = { fetchedAt: now - 7200000, proxies: oldProxies };

        mockHelpers.setLocalStorageData({ publicProxyCatalog: oldCache });

        const freshData = {
            http: [{ ip: '2.2.2.2:9090', score: 150, type: 'Datacenter', country: 'US' }],
            https: [],
            socks4: [],
            socks5: []
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue(freshData)
        } as unknown as Response);

        const result = await PublicProxyCatalog.get({ ttlMs: 3600000 });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ protocol: 'http', ip: '2.2.2.2', port: 9090 });
        expect(global.fetch).toHaveBeenCalled();

        const stored = await Storage.getPublicProxyCatalog();
        expect(stored?.proxies).toEqual(result);
    });

    it('forceRefresh bypasses fresh cache', async () => {
        const cachedProxies = [
            { protocol: 'http' as const, ip: '1.1.1.1', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' }
        ];
        const now = Date.now();
        const cache = { fetchedAt: now - 60000, proxies: cachedProxies };

        mockHelpers.setLocalStorageData({ publicProxyCatalog: cache });

        const freshData = {
            http: [{ ip: '3.3.3.3:7070', score: 200, type: 'Datacenter', country: 'UK' }],
            https: [],
            socks4: [],
            socks5: []
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue(freshData)
        } as unknown as Response);

        const result = await PublicProxyCatalog.get({ forceRefresh: true, ttlMs: 3600000 });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ protocol: 'http', ip: '3.3.3.3', port: 7070 });
        expect(global.fetch).toHaveBeenCalled();
    });

    it('returns stale cache when network fails', async () => {
        const staleProxies = [
            { protocol: 'http' as const, ip: '1.1.1.1', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' }
        ];
        const now = Date.now();
        const staleCache = { fetchedAt: now - 7200000, proxies: staleProxies };

        mockHelpers.setLocalStorageData({ publicProxyCatalog: staleCache });

        (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

        const result = await PublicProxyCatalog.get({ ttlMs: 3600000 });

        expect(result).toEqual(staleProxies);
    });

    it('throws when network fails and there is no cache', async () => {
        mockHelpers.setLocalStorageData({});

        (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

        await expect(PublicProxyCatalog.get({ ttlMs: 3600000 })).rejects.toThrow();
    });

    it('shares one in-flight request between parallel calls', async () => {
        mockHelpers.setLocalStorageData({});

        const freshData = {
            http: [{ ip: '4.4.4.4:6060', score: 180, type: 'Datacenter', country: 'DE' }],
            https: [],
            socks4: [],
            socks5: []
        };

        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue(freshData)
        } as unknown as Response);

        const [result1, result2] = await Promise.all([
            PublicProxyCatalog.get({ ttlMs: 3600000 }),
            PublicProxyCatalog.get({ ttlMs: 3600000 })
        ]);

        expect(result1).toEqual(result2);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('tries fallback URL when primary fails', async () => {
        mockHelpers.setLocalStorageData({});

        const freshData = {
            http: [{ ip: '5.5.5.5:5050', score: 170, type: 'Datacenter', country: 'FR' }],
            https: [],
            socks4: [],
            socks5: []
        };

        (global.fetch as jest.Mock)
            .mockRejectedValueOnce(new TypeError('Primary failed'))
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: jest.fn().mockResolvedValue(freshData)
            } as unknown as Response);

        const result = await PublicProxyCatalog.get({ ttlMs: 3600000 });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ protocol: 'http', ip: '5.5.5.5', port: 5050 });
        expect(global.fetch).toHaveBeenCalledTimes(2);
        const calls = (global.fetch as jest.Mock).mock.calls;
        expect(calls[0][0]).toContain(PUBLIC_PROXIES_PRIMARY_URL);
        expect(calls[1][0]).toContain(PUBLIC_PROXIES_FALLBACK_URL);
    });
});

describe('geo exclusions cleanup', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        (global.fetch as jest.Mock).mockReset();
        jest.resetModules();

        const catalogModule = await import('../../src/shared/public-proxy-catalog');
        PublicProxyCatalog = catalogModule.PublicProxyCatalog;

        const storageModule = await import('../../src/shared/storage');
        Storage = storageModule.Storage;

        mockHelpers.setLocalStorageData({});
    });

    it('geo exclusions cleanup removes exclusions for dropped proxies', async () => {
        const freshData = {
            http: [{ ip: '1.1.1.1:8080', score: 100, type: 'Datacenter', country: 'US' }],
            https: [],
            socks4: [],
            socks5: []
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue(freshData)
        } as unknown as Response);

        const presetId = 'preset-1';
        const exclusions = {
            [presetId]: {
                'http://1.1.1.1:8080': 1000,
                'http://2.2.2.2:9090': 2000
            }
        };

        mockHelpers.setLocalStorageData({
            publicPoolGeoExclusions: exclusions,
            presets: [{ id: presetId, name: 'Test', enabled: true, domains: [] }]
        });

        const result = await PublicProxyCatalog.get({ ttlMs: 3600000 });

        const storedExclusions = await Storage.getPublicPoolGeoExclusions();
        expect(storedExclusions[presetId]).toEqual({ 'http://1.1.1.1:8080': 1000 });
        expect(storedExclusions[presetId]['http://2.2.2.2:9090']).toBeUndefined();
    });

    it('geo exclusions cleanup preserves exclusions for existing proxies', async () => {
        const freshData = {
            http: [{ ip: '3.3.3.3:7070', score: 110, type: 'Datacenter', country: 'DE' }],
            https: [],
            socks4: [],
            socks5: []
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue(freshData)
        } as unknown as Response);

        const presetId = 'preset-2';
        const exclusions = {
            [presetId]: {
                'http://3.3.3.3:7070': 5000
            }
        };

        mockHelpers.setLocalStorageData({
            publicPoolGeoExclusions: exclusions,
            presets: [{ id: presetId, name: 'Test', enabled: true, domains: [] }]
        });

        const result = await PublicProxyCatalog.get({ ttlMs: 3600000 });

        const storedExclusions = await Storage.getPublicPoolGeoExclusions();
        expect(storedExclusions[presetId]['http://3.3.3.3:7070']).toBe(5000);
    });

    it('geo exclusions cleanup error does not prevent catalog storage', async () => {
        const freshData = {
            http: [{ ip: '4.4.4.4:6060', score: 120, type: 'Datacenter', country: 'UK' }],
            https: [],
            socks4: [],
            socks5: []
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue(freshData)
        } as unknown as Response);

        const cleanupError = new Error('Storage error during cleanup');
        jest.spyOn(Storage, 'cleanGeoExclusions').mockRejectedValueOnce(cleanupError);
        jest.spyOn(console, 'error').mockImplementation();

        const result = await PublicProxyCatalog.get({ ttlMs: 3600000 });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ protocol: 'http', ip: '4.4.4.4', port: 6060 });

        const stored = await Storage.getPublicProxyCatalog();
        expect(stored?.proxies).toEqual(result);
    });
});
