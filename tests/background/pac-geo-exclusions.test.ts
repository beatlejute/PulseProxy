import { mockHelpers } from '../setup';

let ProxyManager: typeof import('../../src/background/proxy-manager').ProxyManager;
let Storage: typeof import('../../src/shared/storage').Storage;

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

describe('geo exclusions', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        jest.useFakeTimers();

        const proxyManagerModule = await import('../../src/background/proxy-manager');
        const storageModule = await import('../../src/shared/storage');
        ProxyManager = proxyManagerModule.ProxyManager;
        Storage = storageModule.Storage;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('excluded proxy is absent from FindProxyForURL chains for all preset domains', async () => {
        const proxies = Array.from({ length: 5 }, (_, i) => ({
            protocol: 'socks5' as const,
            ip: `${10 + i}.0.0.1`,
            port: 1080 + i,
            score: 5,
            connectionType: 'residential' as const,
            country: 'US'
        }));

        const checkResults: Record<string, { status: 'alive' | 'dead'; checkedAt: number }> = {};
        proxies.forEach(p => {
            checkResults[`socks5://${p.ip}:${p.port}`] = { status: 'alive', checkedAt: Date.now() };
        });

        const domains = ['pool1.example.com', 'pool2.example.com', 'pool3.example.com'];
        const presetId = 'pool-preset';
        const excludedKey = `socks5://${proxies[0].ip}:${proxies[0].port}`;

        mockHelpers.setLocalStorageData({
            proxies: [createProxy('10.0.0.1', 3128)],
            migrationCompleted: true,
            presets: [{
                ...createPreset(domains, true, false, presetId),
                proxyId: null,
                publicPool: { protocols: ['socks5' as const] },
            }],
            publicProxyCatalog: {
                fetchedAt: Date.now(),
                proxies,
            },
            publicProxyCheckResults: checkResults,
            publicPoolGeoExclusions: {
                [presetId]: {
                    [excludedKey]: Date.now(),
                }
            },
        });

        await ProxyManager.enable();
        const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
        const pac = setCall[0].value.pacScript.data;
        const execPac = new Function(pac + '; return { FindProxyForURL };');
        const { FindProxyForURL } = execPac() as { FindProxyForURL: (url: string, host: string) => string };

        domains.forEach(d => {
            const chain = FindProxyForURL(`http://${d}/`, d);
            expect(chain).not.toContain(`${proxies[0].ip}:${proxies[0].port}`);
        });
    });

    it('excluded proxy in one preset remains in another preset', async () => {
        const proxies = Array.from({ length: 5 }, (_, i) => ({
            protocol: 'socks5' as const,
            ip: `${10 + i}.0.0.1`,
            port: 1080 + i,
            score: 5,
            connectionType: 'residential' as const,
            country: 'US'
        }));

        const checkResults: Record<string, { status: 'alive' | 'dead'; checkedAt: number }> = {};
        proxies.forEach(p => {
            checkResults[`socks5://${p.ip}:${p.port}`] = { status: 'alive', checkedAt: Date.now() };
        });

        const excludedKey = `socks5://${proxies[0].ip}:${proxies[0].port}`;

        mockHelpers.setLocalStorageData({
            proxies: [createProxy('10.0.0.1', 3128)],
            migrationCompleted: true,
            presets: [
                {
                    ...createPreset(['preset1.example.com'], true, false, 'preset-1'),
                    proxyId: null,
                    publicPool: { protocols: ['socks5' as const] },
                },
                {
                    ...createPreset(['preset2.example.com'], true, false, 'preset-2'),
                    proxyId: null,
                    publicPool: { protocols: ['socks5' as const] },
                    order: 1,
                }
            ],
            publicProxyCatalog: {
                fetchedAt: Date.now(),
                proxies,
            },
            publicProxyCheckResults: checkResults,
            publicPoolGeoExclusions: {
                'preset-1': {
                    [excludedKey]: Date.now(),
                }
            },
        });

        await ProxyManager.enable();
        const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
        const pac = setCall[0].value.pacScript.data;
        const execPac = new Function(pac + '; return { FindProxyForURL };');
        const { FindProxyForURL } = execPac() as { FindProxyForURL: (url: string, host: string) => string };

        const preset1Chain = FindProxyForURL('http://preset1.example.com/', 'preset1.example.com');
        expect(preset1Chain).not.toContain(`${proxies[0].ip}:${proxies[0].port}`);

        const preset2Chain = FindProxyForURL('http://preset2.example.com/', 'preset2.example.com');
        expect(preset2Chain).toContain(`${proxies[0].ip}:${proxies[0].port}`);
    });

    it('config hash changes after adding exclusion', async () => {
        const proxies = Array.from({ length: 5 }, (_, i) => ({
            protocol: 'socks5' as const,
            ip: `${10 + i}.0.0.1`,
            port: 1080 + i,
            score: 5,
            connectionType: 'residential' as const,
            country: 'US'
        }));

        const checkResults: Record<string, { status: 'alive' | 'dead'; checkedAt: number }> = {};
        proxies.forEach(p => {
            checkResults[`socks5://${p.ip}:${p.port}`] = { status: 'alive', checkedAt: Date.now() };
        });

        const presetId = 'pool-preset';
        const excludedKey = `socks5://${proxies[0].ip}:${proxies[0].port}`;

        // First: enable without exclusion
        mockHelpers.setLocalStorageData({
            proxies: [createProxy('10.0.0.1', 3128)],
            migrationCompleted: true,
            presets: [{
                ...createPreset(['pool.example.com'], true, false, presetId),
                proxyId: null,
                publicPool: { protocols: ['socks5' as const] },
            }],
            publicProxyCatalog: {
                fetchedAt: Date.now(),
                proxies,
            },
            publicProxyCheckResults: checkResults,
        });

        await ProxyManager.enable();
        const setCall1 = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
        const pac1 = setCall1[0].value.pacScript.data;

        // Second: enable with exclusion
        mockHelpers.setLocalStorageData({
            proxies: [createProxy('10.0.0.1', 3128)],
            migrationCompleted: true,
            presets: [{
                ...createPreset(['pool.example.com'], true, false, presetId),
                proxyId: null,
                publicPool: { protocols: ['socks5' as const] },
            }],
            publicProxyCatalog: {
                fetchedAt: Date.now(),
                proxies,
            },
            publicProxyCheckResults: checkResults,
            publicPoolGeoExclusions: {
                [presetId]: {
                    [excludedKey]: Date.now(),
                }
            },
        });

        (chrome.proxy.settings.set as jest.Mock).mockClear();
        await ProxyManager.enable();

        const setCall2 = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
        const pac2 = setCall2[0].value.pacScript.data;

        expect(pac1).not.toBe(pac2);
    });

    it('all preset members excluded - exclusions not applied, pool unchanged', async () => {
        const proxies = Array.from({ length: 3 }, (_, i) => ({
            protocol: 'socks5' as const,
            ip: `${10 + i}.0.0.1`,
            port: 1080 + i,
            score: 5,
            connectionType: 'residential' as const,
            country: 'US'
        }));

        const checkResults: Record<string, { status: 'alive' | 'dead'; checkedAt: number }> = {};
        proxies.forEach(p => {
            checkResults[`socks5://${p.ip}:${p.port}`] = { status: 'alive', checkedAt: Date.now() };
        });

        const presetId = 'pool-preset';
        const exclusionKeys: Record<string, number> = {};
        proxies.forEach(p => {
            exclusionKeys[`socks5://${p.ip}:${p.port}`] = Date.now();
        });

        // Without exclusions
        mockHelpers.setLocalStorageData({
            proxies: [createProxy('10.0.0.1', 3128)],
            migrationCompleted: true,
            presets: [{
                ...createPreset(['pool.example.com'], true, false, presetId),
                proxyId: null,
                publicPool: { protocols: ['socks5' as const] },
            }],
            publicProxyCatalog: {
                fetchedAt: Date.now(),
                proxies,
            },
            publicProxyCheckResults: checkResults,
        });

        await ProxyManager.enable();
        const setCall1 = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
        const pac1 = setCall1[0].value.pacScript.data;
        const execPac1 = new Function(pac1 + '; return { FindProxyForURL };');
        const { FindProxyForURL: FindProxyBefore } = execPac1() as { FindProxyForURL: (url: string, host: string) => string };
        const chainBefore = FindProxyBefore('http://pool.example.com/', 'pool.example.com');

        // With all members excluded
        mockHelpers.setLocalStorageData({
            proxies: [createProxy('10.0.0.1', 3128)],
            migrationCompleted: true,
            presets: [{
                ...createPreset(['pool.example.com'], true, false, presetId),
                proxyId: null,
                publicPool: { protocols: ['socks5' as const] },
            }],
            publicProxyCatalog: {
                fetchedAt: Date.now(),
                proxies,
            },
            publicProxyCheckResults: checkResults,
            publicPoolGeoExclusions: {
                [presetId]: exclusionKeys,
            },
        });

        (chrome.proxy.settings.set as jest.Mock).mockClear();
        await ProxyManager.enable();

        const setCall2 = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
        const pac2 = setCall2[0].value.pacScript.data;
        const execPac2 = new Function(pac2 + '; return { FindProxyForURL };');
        const { FindProxyForURL: FindProxyAfter } = execPac2() as { FindProxyForURL: (url: string, host: string) => string };
        const chainAfter = FindProxyAfter('http://pool.example.com/', 'pool.example.com');

        expect(chainAfter).toBe(chainBefore);
    });

    it('PAC script remains ASCII-only', async () => {
        const proxies = Array.from({ length: 3 }, (_, i) => ({
            protocol: 'socks5' as const,
            ip: `${10 + i}.0.0.1`,
            port: 1080 + i,
            score: 5,
            connectionType: 'residential' as const,
            country: 'US'
        }));

        const checkResults: Record<string, { status: 'alive' | 'dead'; checkedAt: number }> = {};
        proxies.forEach(p => {
            checkResults[`socks5://${p.ip}:${p.port}`] = { status: 'alive', checkedAt: Date.now() };
        });

        const presetId = 'pool-preset';
        const excludedKey = `socks5://${proxies[0].ip}:${proxies[0].port}`;

        // Without exclusions
        mockHelpers.setLocalStorageData({
            proxies: [createProxy('10.0.0.1', 3128)],
            migrationCompleted: true,
            presets: [{
                ...createPreset(['pool.example.com'], true, false, presetId),
                proxyId: null,
                publicPool: { protocols: ['socks5' as const] },
            }],
            publicProxyCatalog: {
                fetchedAt: Date.now(),
                proxies,
            },
            publicProxyCheckResults: checkResults,
        });

        await ProxyManager.enable();
        const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
        const pac = setCall[0].value.pacScript.data;

        for (let i = 0; i < pac.length; i++) {
            expect(pac.charCodeAt(i)).toBeLessThan(128);
        }

        // With exclusions
        mockHelpers.setLocalStorageData({
            proxies: [createProxy('10.0.0.1', 3128)],
            migrationCompleted: true,
            presets: [{
                ...createPreset(['pool.example.com'], true, false, presetId),
                proxyId: null,
                publicPool: { protocols: ['socks5' as const] },
            }],
            publicProxyCatalog: {
                fetchedAt: Date.now(),
                proxies,
            },
            publicProxyCheckResults: checkResults,
            publicPoolGeoExclusions: {
                [presetId]: {
                    [excludedKey]: Date.now(),
                }
            },
        });

        (chrome.proxy.settings.set as jest.Mock).mockClear();
        await ProxyManager.enable();

        const setCall2 = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
        const pac2 = setCall2[0].value.pacScript.data;

        for (let i = 0; i < pac2.length; i++) {
            expect(pac2.charCodeAt(i)).toBeLessThan(128);
        }
    });
});
