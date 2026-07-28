import {
    buildCheckQueue,
    interleaveBySubnet,
    publicProxyCacheKey,
    sortByLiveStatus,
    PublicProxyCheckSession,
} from '../../src/popup/public-proxy-check';
import { StorageKeys } from '../../src/shared/constants';
import { NormalizedPublicProxy, PublicProxyLiveStatus } from '../../src/types';

function makeProxy(ip: string, overrides: Partial<NormalizedPublicProxy> = {}): NormalizedPublicProxy {
    return {
        protocol: 'http',
        ip,
        port: 8080,
        score: 4.0,
        connectionType: 'residential',
        country: 'US',
        ...overrides,
    };
}

function subnet24(ip: string): string {
    return ip.split('.').slice(0, 3).join('.');
}

describe('public-proxy-check', () => {
    describe('sortByLiveStatus', () => {
        it('should order alive → unchecked/checking → dead, keeping relative order inside groups', () => {
            const proxies = [
                makeProxy('1.1.1.1', { score: 5 }),
                makeProxy('2.2.2.2', { score: 4.8 }),
                makeProxy('3.3.3.3', { score: 4.5 }),
                makeProxy('4.4.4.4', { score: 4.2 }),
                makeProxy('5.5.5.5', { score: 4.0 }),
            ];
            const statuses: Record<string, PublicProxyLiveStatus> = {
                '1.1.1.1': 'dead',
                '2.2.2.2': 'unchecked',
                '3.3.3.3': 'alive',
                '4.4.4.4': 'checking',
                '5.5.5.5': 'alive',
            };

            const sorted = sortByLiveStatus(proxies, p => statuses[p.ip]);

            expect(sorted.map(p => p.ip)).toEqual([
                '3.3.3.3', // alive (выше по score)
                '5.5.5.5', // alive
                '2.2.2.2', // unchecked (исходный порядок внутри группы)
                '4.4.4.4', // checking
                '1.1.1.1', // dead — в конец
            ]);
        });

        it('should not mutate the input array', () => {
            const proxies = [makeProxy('1.1.1.1'), makeProxy('2.2.2.2')];
            const original = [...proxies];

            sortByLiveStatus(proxies, () => 'dead');

            expect(proxies).toEqual(original);
        });
    });

    describe('interleaveBySubnet', () => {
        it('should not place neighbours from the same /24 while alternatives exist', () => {
            const proxies = [
                makeProxy('10.0.0.1'),
                makeProxy('10.0.0.2'),
                makeProxy('10.0.0.3'),
                makeProxy('20.5.1.1'),
                makeProxy('20.5.1.2'),
                makeProxy('30.9.9.1'),
            ];

            const result = interleaveBySubnet(proxies);

            expect(result).toHaveLength(proxies.length);
            // Первые три элемента — из трёх разных /24
            const firstThree = result.slice(0, 3).map(p => subnet24(p.ip));
            expect(new Set(firstThree).size).toBe(3);
        });

        it('should spread across /16 groups first', () => {
            // Две /24 внутри одной /16 и одна отдельная /16
            const proxies = [
                makeProxy('10.0.0.1'),
                makeProxy('10.0.1.1'),
                makeProxy('99.9.9.1'),
            ];

            const result = interleaveBySubnet(proxies);
            const first16 = result.slice(0, 2).map(p => p.ip.split('.').slice(0, 2).join('.'));

            // Соседние элементы из разных /16
            expect(new Set(first16).size).toBe(2);
        });

        it('should keep all proxies when everything is in one subnet', () => {
            const proxies = [
                makeProxy('10.0.0.1'),
                makeProxy('10.0.0.2'),
                makeProxy('10.0.0.3'),
            ];

            const result = interleaveBySubnet(proxies);

            expect(result.map(p => p.ip).sort()).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.3']);
        });
    });

    describe('buildCheckQueue', () => {
        const proxies = [
            makeProxy('10.0.0.1'),
            makeProxy('10.0.0.2'),
            makeProxy('20.5.1.1'),
            makeProxy('30.9.9.1'),
        ];

        it('should put filter-matched proxies before the rest', () => {
            const queue = buildCheckQueue(
                proxies,
                p => p.ip.startsWith('20.'),
                () => true
            );

            expect(queue[0].ip).toBe('20.5.1.1');
            expect(queue).toHaveLength(4);
        });

        it('should exclude proxies that do not need a check', () => {
            const queue = buildCheckQueue(
                proxies,
                () => true,
                p => p.ip !== '10.0.0.1'
            );

            expect(queue.map(p => p.ip)).not.toContain('10.0.0.1');
            expect(queue).toHaveLength(3);
        });

        it('should put priority keys first in click order, ahead of filter-matched', () => {
            const queue = buildCheckQueue(
                proxies,
                p => p.ip.startsWith('20.'),
                () => true,
                [publicProxyCacheKey(makeProxy('30.9.9.1')), publicProxyCacheKey(makeProxy('10.0.0.2'))]
            );

            expect(queue[0].ip).toBe('30.9.9.1');
            expect(queue[1].ip).toBe('10.0.0.2');
            expect(queue[2].ip).toBe('20.5.1.1');
        });

        it('should ignore priority keys that no longer need a check', () => {
            const queue = buildCheckQueue(
                proxies,
                () => true,
                p => p.ip !== '30.9.9.1',
                [publicProxyCacheKey(makeProxy('30.9.9.1'))]
            );

            expect(queue.map(p => p.ip)).not.toContain('30.9.9.1');
        });
    });

    describe('PublicProxyCheckSession', () => {
        const sendMessageMock = chrome.runtime.sendMessage as jest.Mock;

        function createSession(
            proxies: NormalizedPublicProxy[],
            statuses: Map<string, PublicProxyLiveStatus>,
            overrides: Partial<{
                isAlive: () => boolean;
                onUpdate: () => void;
                matcher: (p: NormalizedPublicProxy) => boolean;
            }> = {}
        ): PublicProxyCheckSession {
            return new PublicProxyCheckSession({
                proxies,
                statuses,
                getFilterMatcher: () => overrides.matcher ?? (() => true),
                isAlive: overrides.isAlive ?? (() => true),
                onUpdate: overrides.onUpdate ?? (() => undefined),
            });
        }

        it('should check queue in batches, apply statuses and cache results', async () => {
            const proxies = [makeProxy('1.1.1.1'), makeProxy('2.2.2.2'), makeProxy('3.3.3.3')];
            const statuses = new Map<string, PublicProxyLiveStatus>();
            sendMessageMock.mockImplementation((message: { action: string; proxies?: unknown[] }) => {
                if (message.action === 'checkProxyBatch') {
                    return Promise.resolve({ results: ['ok', 'error', 'timeout'] });
                }
                return Promise.resolve({});
            });

            const session = createSession(proxies, statuses);
            await session.start();

            const byIp = (ip: string) => statuses.get(publicProxyCacheKey(makeProxy(ip)));
            expect(byIp('1.1.1.1')).toBe('alive');
            expect(byIp('2.2.2.2')).toBe('dead');
            expect(byIp('3.3.3.3')).toBe('dead');

            // Результаты записаны в кеш (chrome.storage.local)
            const stored = await new Promise<Record<string, unknown>>(resolve => {
                chrome.storage.local.get(StorageKeys.PUBLIC_PROXY_CHECK_RESULTS, resolve);
            });
            const cache = stored[StorageKeys.PUBLIC_PROXY_CHECK_RESULTS] as Record<string, { status: string }>;
            expect(cache['http://1.1.1.1:8080'].status).toBe('alive');
            expect(cache['http://2.2.2.2:8080'].status).toBe('dead');
        });

        it('should skip proxies that already have a status', async () => {
            const proxies = [makeProxy('1.1.1.1'), makeProxy('2.2.2.2')];
            const statuses = new Map<string, PublicProxyLiveStatus>([
                [publicProxyCacheKey(makeProxy('1.1.1.1')), 'alive'],
            ]);
            const checkedBatches: Array<Array<{ host: string }>> = [];
            sendMessageMock.mockImplementation((message: { action: string; proxies?: Array<{ host: string }> }) => {
                if (message.action === 'checkProxyBatch') {
                    checkedBatches.push(message.proxies!);
                    return Promise.resolve({ results: message.proxies!.map(() => 'ok') });
                }
                return Promise.resolve({});
            });

            const session = createSession(proxies, statuses);
            await session.start();

            expect(checkedBatches).toHaveLength(1);
            expect(checkedBatches[0].map(p => p.host)).toEqual(['2.2.2.2']);
        });

        it('should return aborted proxies to unchecked without caching them', async () => {
            const proxies = [makeProxy('1.1.1.1'), makeProxy('2.2.2.2')];
            const statuses = new Map<string, PublicProxyLiveStatus>();
            let calls = 0;
            let alive = true;
            sendMessageMock.mockImplementation((message: { action: string }) => {
                if (message.action === 'checkProxyBatch') {
                    calls++;
                    // Первый батч: один результат и один aborted, затем модалка закрывается
                    alive = false;
                    return Promise.resolve({ results: ['ok', 'aborted'] });
                }
                return Promise.resolve({});
            });

            const session = createSession(proxies, statuses, { isAlive: () => alive });
            await session.start();

            expect(calls).toBe(1);
            expect(statuses.get(publicProxyCacheKey(makeProxy('1.1.1.1')))).toBe('alive');
            expect(statuses.get(publicProxyCacheKey(makeProxy('2.2.2.2')))).toBe('unchecked');
        });

        it('should stop when the modal is closed', async () => {
            const proxies = [makeProxy('1.1.1.1')];
            const statuses = new Map<string, PublicProxyLiveStatus>();
            sendMessageMock.mockResolvedValue({ results: ['ok'] });

            const session = createSession(proxies, statuses, { isAlive: () => false });
            await session.start();

            expect(sendMessageMock).not.toHaveBeenCalled();
        });

        it('should mark manually requested proxy as checking and check it first', async () => {
            const proxies = [makeProxy('1.1.1.1'), makeProxy('2.2.2.2'), makeProxy('3.3.3.3')];
            const statuses = new Map<string, PublicProxyLiveStatus>([
                [publicProxyCacheKey(makeProxy('1.1.1.1')), 'dead'],
                [publicProxyCacheKey(makeProxy('2.2.2.2')), 'dead'],
            ]);
            const checkedBatches: Array<Array<{ host: string }>> = [];
            sendMessageMock.mockImplementation((message: { action: string; proxies?: Array<{ host: string }> }) => {
                if (message.action === 'checkProxyBatch') {
                    checkedBatches.push(message.proxies!);
                    return Promise.resolve({ results: message.proxies!.map(() => 'ok') });
                }
                return Promise.resolve({});
            });

            const session = createSession(proxies, statuses);
            const target = makeProxy('3.3.3.3');
            session.requestPriorityCheck(target);

            expect(statuses.get(publicProxyCacheKey(target))).toBe('checking');

            await session.start();

            expect(checkedBatches[0].map(p => p.host)).toEqual(['3.3.3.3']);
            expect(statuses.get(publicProxyCacheKey(target))).toBe('alive');
        });
    });
});
