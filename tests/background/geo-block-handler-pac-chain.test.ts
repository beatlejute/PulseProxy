// FIX-036: цепочка сайта на маршруте пула строится по строкам PAC участников —
// тем же входом, что pickFromPool в PAC-скрипте, поэтому исключается участник
// из ответа FindProxyForURL продукта, а не из параллельного ранжирования по ключам.
import { mockHelpers } from '../setup';

jest.mock('../../src/background/icon-manager', () => ({
    IconManager: { setTabProxyBadge: jest.fn() },
}));

jest.mock('../../src/background/geo-block-marks', () => ({
    setMark: jest.fn(),
    clearMarkIfNotMatching: jest.fn(),
}));

const PRESET_ID = 'pac-chain-preset';

// Пул пресета — 8 участников; домены — 5 правил одного пресета.
const POOL_DOMAINS = [
    'pool-alpha.example.com',
    'pool-beta.example.com',
    'pool-gamma.example.com',
    'pool-delta.example.com',
    'pool-epsilon.example.com',
];

const POOL_PROXIES = Array.from({ length: 8 }, (_, i) => ({
    protocol: 'socks5' as const,
    ip: `10.20.${30 + i}.${40 + i}`,
    port: 1080 + i,
    score: 5 - (i % 3),
    connectionType: 'residential' as const,
    country: 'US',
}));

interface PoolMemberRoute {
    key: string;
    ip: string;
    pac: string;
}

interface PoolHarness {
    findProxyForURL: (url: string, host: string) => string;
    poolMembers: PoolMemberRoute[];
    handleGeoBlockResponse: (details: chrome.webRequest.OnResponseStartedDetails) => void;
    storedExclusions: () => Record<string, number>;
}

// Свежий storage, свой enable() и свой снимок PAC на каждый случай.
async function setUpPool(): Promise<PoolHarness> {
    mockHelpers.resetAllMocks();
    jest.resetModules();
    jest.useFakeTimers();
    (chrome as unknown as { tabs: { reload: jest.Mock } }).tabs = { reload: jest.fn() };

    mockHelpers.setLocalStorageData({
        migrationCompleted: true,
        proxyByDefault: false,
        presets: [{
            id: PRESET_ID,
            name: 'PAC chain pool',
            domains: POOL_DOMAINS,
            enabled: true,
            isDefault: false,
            order: 0,
            proxyId: null,
            publicPool: { protocols: ['socks5' as const] },
            createdAt: 0,
            updatedAt: 0,
        }],
        publicProxyCatalog: {
            fetchedAt: Date.now(),
            proxies: POOL_PROXIES,
        },
        publicProxyCheckResults: Object.fromEntries(
            POOL_PROXIES.map((p) => [
                `socks5://${p.ip}:${p.port}`,
                { status: 'alive', checkedAt: Date.now() },
            ]),
        ),
    });

    const { ProxyManager } = await import('../../src/background/proxy-manager');
    const { handleGeoBlockResponse } = await import('../../src/background/geo-block-handler');

    await ProxyManager.enable();

    const setCall = (chrome.proxy.settings.set as jest.Mock).mock.calls[0];
    const pacScript = setCall[0].value.pacScript.data;
    const execPac = new Function(pacScript + '; return { FindProxyForURL };');
    const { FindProxyForURL } = execPac() as {
        FindProxyForURL: (url: string, host: string) => string;
    };

    const route = ProxyManager.getRouteForUrl(`https://${POOL_DOMAINS[0]}/`);

    return {
        findProxyForURL: FindProxyForURL,
        poolMembers: (route?.poolMembers ?? []) as PoolMemberRoute[],
        handleGeoBlockResponse,
        storedExclusions: () => {
            const stored = mockHelpers.getLocalStorageData()['publicPoolGeoExclusions'] as
                | Record<string, Record<string, number>>
                | undefined;
            return stored?.[PRESET_ID] ?? {};
        },
    };
}

function poolChain(h: PoolHarness, domain: string): string[] {
    return h.findProxyForURL(`https://${domain}/`, domain).split('; ');
}

function geoBlockDetails(domain: string, ip: string): chrome.webRequest.OnResponseStartedDetails {
    return {
        tabId: 42,
        requestId: '1',
        url: `https://${domain}/`,
        type: 'main_frame',
        method: 'GET',
        statusCode: 451,
        responseHeaders: [],
        ip,
    } as chrome.webRequest.OnResponseStartedDetails;
}

describe('geo-block pool exclusions over the PAC chain', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it.each(POOL_DOMAINS)(
        'PAC chain, %s: IP outside the chain — the member whose pac is the first FindProxyForURL element is excluded',
        async (domain) => {
            const harness = await setUpPool();
            const chain = poolChain(harness, domain);
            const head = harness.poolMembers.find((m) => m.pac === chain[0]);

            harness.handleGeoBlockResponse(geoBlockDetails(domain, '203.0.113.77'));
            await jest.runAllTimersAsync();

            const excluded = Object.keys(harness.storedExclusions());
            expect(excluded).toHaveLength(1);
            expect(harness.poolMembers.find((m) => m.key === excluded[0])?.pac).toBe(chain[0]);
            expect(head?.key).toBe(excluded[0]);
        },
    );

    it.each(POOL_DOMAINS)(
        'PAC chain, %s: IP of the member whose pac is the second FindProxyForURL element — that member is excluded',
        async (domain) => {
            const harness = await setUpPool();
            const chain = poolChain(harness, domain);
            const second = harness.poolMembers.find((m) => m.pac === chain[1]);
            expect(second).toBeDefined();

            harness.handleGeoBlockResponse(geoBlockDetails(domain, second!.ip));
            await jest.runAllTimersAsync();

            const excluded = Object.keys(harness.storedExclusions());
            expect(excluded).toEqual([second!.key]);
        },
    );
});
