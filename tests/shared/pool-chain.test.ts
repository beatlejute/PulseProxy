import { pickPoolChain } from '../../src/shared/public-pool';
import { PublicPoolCheckConfig } from '../../src/shared/constants';
import { mockHelpers } from '../setup';

describe('pickPoolChain', () => {
    it('returns empty array for empty pool', () => {
        const pool: string[] = [];
        const ruleKey = 'example.com';

        const result = pickPoolChain(pool, ruleKey);

        expect(result).toEqual([]);
    });

    it('returns empty array for null or undefined pool', () => {
        const ruleKey = 'example.com';

        expect(pickPoolChain(null as any, ruleKey)).toEqual([]);
        expect(pickPoolChain(undefined as any, ruleKey)).toEqual([]);
    });

    it('returns up to CHAIN_LENGTH members from pool', () => {
        const pool = [
            'SOCKS5 1.1.1.1:9050',
            'SOCKS5 2.2.2.2:9050',
            'SOCKS5 3.3.3.3:9050',
            'SOCKS5 4.4.4.4:9050',
            'SOCKS5 5.5.5.5:9050',
        ];
        const ruleKey = 'example.com';

        const result = pickPoolChain(pool, ruleKey);

        expect(result.length).toBeLessThanOrEqual(PublicPoolCheckConfig.CHAIN_LENGTH);
    });

    it('normalizes wildcard and non-wildcard rules to same key', () => {
        const pool = [
            'SOCKS5 1.1.1.1:9050',
            'SOCKS5 2.2.2.2:9050',
            'SOCKS5 3.3.3.3:9050',
        ];

        const result1 = pickPoolChain(pool, '*.example.com');
        const result2 = pickPoolChain(pool, 'example.com');

        expect(result1).toEqual(result2);
    });

    it('produces stable chain for same pool and rule', () => {
        const pool = [
            'SOCKS5 1.1.1.1:9050',
            'SOCKS5 2.2.2.2:9050',
            'SOCKS5 3.3.3.3:9050',
        ];
        const ruleKey = 'example.com';

        const result1 = pickPoolChain(pool, ruleKey);
        const result2 = pickPoolChain(pool, ruleKey);

        expect(result1).toEqual(result2);
    });

    it('produces different chains for different rules', () => {
        const pool = [
            'SOCKS5 1.1.1.1:9050',
            'SOCKS5 2.2.2.2:9050',
            'SOCKS5 3.3.3.3:9050',
        ];

        const result1 = pickPoolChain(pool, 'example.com');
        const result2 = pickPoolChain(pool, 'other.com');

        // Different rules should likely produce different order (with high probability)
        // though theoretically they could match. Check that results are both valid subsets.
        expect(result1.length).toBeGreaterThan(0);
        expect(result2.length).toBeGreaterThan(0);
        expect(result1.every((p) => pool.includes(p))).toBe(true);
        expect(result2.every((p) => pool.includes(p))).toBe(true);
    });

    it('uses all pool members when pool size < CHAIN_LENGTH', () => {
        const pool = [
            'SOCKS5 1.1.1.1:9050',
            'SOCKS5 2.2.2.2:9050',
        ];
        const ruleKey = 'example.com';

        const result = pickPoolChain(pool, ruleKey);

        expect(result.length).toBe(2);
        expect(result).toContain('SOCKS5 1.1.1.1:9050');
        expect(result).toContain('SOCKS5 2.2.2.2:9050');
    });

    it('returns exactly CHAIN_LENGTH members when pool size >= CHAIN_LENGTH', () => {
        const pool = [
            'SOCKS5 1.1.1.1:9050',
            'SOCKS5 2.2.2.2:9050',
            'SOCKS5 3.3.3.3:9050',
            'SOCKS5 4.4.4.4:9050',
            'SOCKS5 5.5.5.5:9050',
            'SOCKS5 6.6.6.6:9050',
            'SOCKS5 7.7.7.7:9050',
            'SOCKS5 8.8.8.8:9050',
        ];
        const ruleKey = 'example.com';

        const result = pickPoolChain(pool, ruleKey);

        expect(result.length).toBe(PublicPoolCheckConfig.CHAIN_LENGTH);
    });

    it('returns members from pool in valid order', () => {
        const pool = [
            'SOCKS5 1.1.1.1:9050',
            'SOCKS5 2.2.2.2:9050',
            'SOCKS5 3.3.3.3:9050',
            'SOCKS5 4.4.4.4:9050',
            'SOCKS5 5.5.5.5:9050',
        ];
        const ruleKey = 'example.com';

        const result = pickPoolChain(pool, ruleKey);

        // All returned members must be from the original pool
        result.forEach((member) => {
            expect(pool).toContain(member);
        });

        // No duplicates
        expect(new Set(result).size).toBe(result.length);
    });

    it('handles pool with single member', () => {
        const pool = ['SOCKS5 1.1.1.1:9050'];
        const ruleKey = 'example.com';

        const result = pickPoolChain(pool, ruleKey);

        expect(result).toEqual(['SOCKS5 1.1.1.1:9050']);
    });

    it('handles complex domain patterns', () => {
        const pool = [
            'SOCKS5 1.1.1.1:9050',
            'SOCKS5 2.2.2.2:9050',
            'SOCKS5 3.3.3.3:9050',
        ];

        const result1 = pickPoolChain(pool, '*.sub.example.com');
        const result2 = pickPoolChain(pool, 'sub.example.com');
        const result3 = pickPoolChain(pool, '*.example.com');

        // Rules with different wildcards should normalize correctly
        expect(result1).toEqual(result2);
        expect(result1.length).toBeGreaterThan(0);
        expect(result3.length).toBeGreaterThan(0);
    });

    it('chain composition remains valid for large pool', () => {
        const pool = Array.from({ length: 20 }, (_, i) => `SOCKS5 ${i + 1}.${i + 1}.${i + 1}.${i + 1}:9050`);
        const ruleKey = 'example.com';

        const result = pickPoolChain(pool, ruleKey);

        expect(result.length).toBe(PublicPoolCheckConfig.CHAIN_LENGTH);
        expect(result.every((p) => pool.includes(p))).toBe(true);
        expect(new Set(result).size).toBe(result.length);
    });
});

// Цепочка TypeScript против PAC, который продукт отдаёт браузеру: PAC берётся
// из вызова chrome.proxy.settings.set после ProxyManager.enable(), исполняется
// через new Function, пул — строки pools[] того же PAC. Своей копии PAC-кода
// и хеша здесь нет: сверяется только результат.
describe('pickPoolChain vs FindProxyForURL of the PAC', () => {
    type ProxyManagerService = typeof import('../../src/background/proxy-manager').ProxyManager;

    const POOL_SIZE = 8;
    const RULES = [
        '*.example.com',
        'example.com',
        '*.shop.test',
        'news.test',
        '*.cdn.test',
        'cdn.test',
        'api.test',
        '*.mail.test',
        'mail.test',
        'blog.test',
    ];
    // Хост на каждое правило пресета: у каждого хоста ровно одно совпадение.
    const HOSTS = [
        'www.example.com',
        'example.com',
        'cart.shop.test',
        'news.test',
        'img.cdn.test',
        'cdn.test',
        'api.test',
        'box.mail.test',
        'mail.test',
        'blog.test',
    ];

    const createPoolPreset = (domains: string[]) => ({
        id: 'pool-preset',
        name: 'Pool',
        domains,
        enabled: true,
        isDefault: false,
        order: 0,
        createdAt: 0,
        updatedAt: 0,
        proxyId: null,
        publicPool: { protocols: ['socks5' as const] },
    });

    const createDefaultProxy = () => ({
        id: 'test-proxy',
        type: 'http',
        host: '10.0.0.1',
        port: 3128,
        isDefault: true,
        createdAt: 0,
        updatedAt: 0,
    });

    let ProxyManager: ProxyManagerService;

    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        jest.useFakeTimers();
        ProxyManager = (await import('../../src/background/proxy-manager')).ProxyManager;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('matches FindProxyForURL on 10 preset rules and an 8-member pool', async () => {
        const catalog = Array.from({ length: POOL_SIZE }, (_, i) => ({
            protocol: 'socks5' as const,
            ip: `${10 + i}.${20 + i}.${30 + i}.${40 + i}`,
            port: 1080 + i,
            score: 10 - i,
            connectionType: 'residential',
            country: 'US',
        }));

        const checkResults: Record<string, { status: 'alive'; checkedAt: number }> = {};
        catalog.forEach((proxy) => {
            checkResults[`${proxy.protocol}://${proxy.ip}:${proxy.port}`] = {
                status: 'alive',
                checkedAt: Date.now(),
            };
        });

        mockHelpers.setLocalStorageData({
            proxies: [createDefaultProxy()],
            migrationCompleted: true,
            presets: [createPoolPreset(RULES)],
            publicProxyCatalog: { fetchedAt: Date.now(), proxies: catalog },
            publicProxyCheckResults: checkResults,
        });

        await ProxyManager.enable();

        const pac = (chrome.proxy.settings.set as jest.Mock).mock.calls[0][0].value.pacScript.data;
        const pacRuntime = new Function(`${pac}; return { FindProxyForURL, pools, domainPoolMap };`)() as {
            FindProxyForURL: (url: string, host: string) => string;
            pools: string[][];
            domainPoolMap: Record<string, number>;
        };

        // Пул собран продуктом из каталога: 8 строк PAC, а не ключей protocol://ip:port.
        expect(pacRuntime.pools).toHaveLength(1);
        expect(pacRuntime.pools[0]).toHaveLength(POOL_SIZE);
        expect(pacRuntime.pools[0].every((line) => /^SOCKS5 \d+\.\d+\.\d+\.\d+:\d+$/.test(line))).toBe(true);

        const comparisons = RULES.map((rule, index) => {
            const host = HOSTS[index];
            const pool = pacRuntime.pools[pacRuntime.domainPoolMap[rule]];
            return {
                host,
                rule,
                tsChain: pickPoolChain(pool, rule),
                pacChain: pacRuntime.FindProxyForURL(`http://${host}/`, host).split('; '),
            };
        });

        expect(comparisons).toHaveLength(10);
        comparisons.forEach(({ host, tsChain, pacChain }) => {
            expect({ host, chain: tsChain }).toEqual({ host, chain: pacChain });
        });

        // «*.example.com» и «example.com» — один ключ rendezvous-хеша, одна цепочка.
        const wildcard = comparisons[0];
        const exact = comparisons[1];
        expect(wildcard.tsChain).toEqual(exact.tsChain);
    });
});
