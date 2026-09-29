import '../__mocks__/chrome';

// Define mocks before importing modules that use them
const mockStorage = {
    getTargetState: jest.fn().mockResolvedValue('connected'),
    getActivePresets: jest.fn().mockResolvedValue([
        {
            name: 'Pool Preset',
            publicPool: {
                sources: [{ type: 'direct' as const, url: 'http://example.com/list' }],
            },
        },
    ]),
    getPublicProxyCheckResults: jest.fn().mockResolvedValue({}),
    mergePublicProxyCheckResults: jest.fn().mockResolvedValue(undefined),
};

const mockPublicProxyCatalog = {
    get: jest.fn().mockResolvedValue([
        {
            protocol: 'http' as const,
            ip: '1.1.1.1',
            port: 8080,
            checked: true,
        },
    ]),
};

jest.mock('../../src/shared/storage', () => ({
    Storage: mockStorage,
}));

jest.mock('../../src/shared/public-proxy-catalog', () => ({
    PublicProxyCatalog: mockPublicProxyCatalog,
}));

jest.mock('../../src/shared/public-proxy-queue', () => ({
    interleaveBySubnet: (proxies: unknown[]) => proxies,
}));

jest.mock('../../src/shared/public-pool', () => {
    const resolvePoolMembersImpl = jest.fn((pool: unknown, catalog: any[], results: any = {}, now: number = Date.now()) => {
        const needsCheck = catalog.filter(proxy => {
            const key = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
            return !results[key];
        });
        return {
            members: catalog,
            needsCheck,
        };
    });
    return {
        poolSignature: jest.fn((members: unknown[]) => JSON.stringify(members)),
        resolvePoolMembers: resolvePoolMembersImpl,
    };
});

// Now import after jest.mock
import { PublicPoolScheduler } from '../../src/background/public-pool-scheduler';
import { PublicProxyCheckConfig, PublicPoolCheckConfig } from '../../src/shared/constants';
import { mockHelpers } from '../__mocks__/chrome';

describe('PublicPoolScheduler', () => {
    let scheduler: PublicPoolScheduler;
    let mockRunBatch: jest.Mock;
    let mockRefreshProxy: jest.Mock;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        mockHelpers.resetAllMocks();

        mockRunBatch = jest.fn().mockResolvedValue({ busy: false, results: ['ok'] });
        mockRefreshProxy = jest.fn().mockResolvedValue(undefined);

        // Reset mocks to defaults
        mockPublicProxyCatalog.get.mockResolvedValue([
            {
                protocol: 'http' as const,
                ip: '1.1.1.1',
                port: 8080,
                checked: true,
            },
        ]);
        mockStorage.getTargetState.mockResolvedValue('connected');
        mockStorage.getActivePresets.mockResolvedValue([
            {
                name: 'Pool Preset',
                publicPool: {
                    sources: [{ type: 'direct' as const, url: 'http://example.com/list' }],
                },
            },
        ]);
        mockStorage.getPublicProxyCheckResults.mockResolvedValue({});
        mockStorage.mergePublicProxyCheckResults.mockResolvedValue(undefined);

        scheduler = new PublicPoolScheduler({
            runBatch: mockRunBatch,
            refreshProxy: mockRefreshProxy,
        });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('PublicPoolScheduler.sync', () => {
        it('creates public_pool_check alarm with periodInMinutes 15 when connected with a pool preset', async () => {
            await scheduler.sync();

            expect(chrome.alarms.get).toHaveBeenCalledWith(PublicPoolCheckConfig.ALARM_NAME);
            expect(chrome.alarms.create).toHaveBeenCalledWith(PublicPoolCheckConfig.ALARM_NAME, {
                periodInMinutes: PublicPoolCheckConfig.CHECK_INTERVAL_MIN,
            });
        });

        it('clears the alarm when targetState is disconnected', async () => {
            mockStorage.getTargetState.mockResolvedValue('disconnected');

            await scheduler.sync();

            expect(chrome.alarms.clear).toHaveBeenCalledWith(PublicPoolCheckConfig.ALARM_NAME);
            expect(chrome.alarms.create).not.toHaveBeenCalled();
        });

        it('clears the alarm when no active preset has publicPool', async () => {
            mockStorage.getActivePresets.mockResolvedValue([
                { name: 'No Pool Preset', publicPool: null },
            ]);

            await scheduler.sync();

            expect(chrome.alarms.clear).toHaveBeenCalledWith(PublicPoolCheckConfig.ALARM_NAME);
            expect(chrome.alarms.create).not.toHaveBeenCalled();
        });
    });

    describe('PublicPoolScheduler.runCycle', () => {
        it('returns the running cycle promise to a concurrent call', async () => {
            const promise1 = scheduler.runCycle();
            const promise2 = scheduler.runCycle();

            expect(promise1).toBe(promise2);
            await promise1;
        });

        it('checks only needsCheck members', async () => {
            const catalog = [
                { protocol: 'http' as const, ip: '1.1.1.1', port: 8080, checked: true },
                { protocol: 'http' as const, ip: '2.2.2.2', port: 8080, checked: true },
            ];
            mockPublicProxyCatalog.get.mockResolvedValue(catalog);
            mockStorage.getPublicProxyCheckResults.mockResolvedValue({
                'http://1.1.1.1:8080': { status: 'alive', checkedAt: Date.now() },
            });

            await scheduler.runCycle();

            expect(mockRunBatch).toHaveBeenCalled();
            const batchArg = mockRunBatch.mock.calls[0][0];
            expect(batchArg.length).toBe(1);
            expect(batchArg[0]).toEqual({ type: 'http', host: '2.2.2.2', port: 8080 });
        });

        it('sends batches of 20 and at most 100 proxies per cycle', async () => {
            const proxies = Array.from({ length: 150 }, (_, i) => ({
                protocol: 'http' as const,
                ip: `${i}.${i}.${i}.${i}`,
                port: 8080,
                checked: true,
            }));
            mockPublicProxyCatalog.get.mockResolvedValue(proxies);

            await scheduler.runCycle();

            expect(mockRunBatch).toHaveBeenCalledTimes(5);
            mockRunBatch.mock.calls.forEach((call, i) => {
                if (i < 4) {
                    expect(call[0].length).toBe(20);
                } else {
                    expect(call[0].length).toBeLessThanOrEqual(20);
                }
            });
        });

        it('retries a busy batch 3 times with 2000 ms pause, then ends the cycle', async () => {
            mockRunBatch
                .mockResolvedValueOnce({ busy: true })
                .mockResolvedValueOnce({ busy: true })
                .mockResolvedValueOnce({ busy: true });

            const promise = scheduler.runCycle();
            jest.advanceTimersByTime(6000);
            await jest.runAllTimersAsync();
            await promise;

            expect(mockRunBatch).toHaveBeenCalledTimes(3);
        });

        it('writes ok as alive, error and timeout as dead, skips aborted', async () => {
            mockPublicProxyCatalog.get.mockResolvedValue([
                { protocol: 'http' as const, ip: '1.1.1.1', port: 8080, checked: true },
                { protocol: 'http' as const, ip: '2.2.2.2', port: 8080, checked: true },
                { protocol: 'http' as const, ip: '3.3.3.3', port: 8080, checked: true },
                { protocol: 'http' as const, ip: '4.4.4.4', port: 8080, checked: true },
            ]);
            mockRunBatch.mockResolvedValue({
                busy: false,
                results: ['ok', 'error', 'timeout', 'aborted'],
            });

            await scheduler.runCycle();

            expect(mockStorage.mergePublicProxyCheckResults).toHaveBeenCalled();
            const updates = mockStorage.mergePublicProxyCheckResults.mock.calls[0][0];
            const entries = Object.entries(updates);
            const alive = entries.filter(([, v]: any) => v.status === 'alive');
            const dead = entries.filter(([, v]: any) => v.status === 'dead');

            expect(alive.length).toBe(1);
            expect(dead.length).toBe(2);
        });

        it('calls refreshProxy only when the pool signature changes', async () => {
            mockPublicProxyCatalog.get
                .mockResolvedValueOnce([
                    { protocol: 'http' as const, ip: '1.1.1.1', port: 8080, checked: true },
                ])
                .mockResolvedValueOnce([
                    { protocol: 'http' as const, ip: '1.1.1.1', port: 8080, checked: true },
                ])
                .mockResolvedValueOnce([
                    { protocol: 'http' as const, ip: '2.2.2.2', port: 8080, checked: true },
                ]);

            await scheduler.runCycle();
            expect(mockRefreshProxy).toHaveBeenCalledTimes(1);

            mockRefreshProxy.mockClear();
            await scheduler.runCycle();
            expect(mockRefreshProxy).not.toHaveBeenCalled();

            await scheduler.runCycle();
            expect(mockRefreshProxy).toHaveBeenCalledTimes(1);
        });

        it('exits without runBatch when the catalog is unavailable', async () => {
            mockPublicProxyCatalog.get.mockRejectedValue(new Error('Unavailable'));

            await scheduler.runCycle();

            expect(mockRunBatch).not.toHaveBeenCalled();
            expect(mockRefreshProxy).not.toHaveBeenCalled();
        });
    });

    describe('PublicPoolScheduler.requestRecheck', () => {
        it('ignores a call within 60 s of the last cycle start', async () => {
            await scheduler.runCycle();

            mockRunBatch.mockClear();
            scheduler.requestRecheck();

            jest.advanceTimersByTime(30000);
            await jest.runAllTimersAsync();

            expect(mockRunBatch).not.toHaveBeenCalled();
        });

        it('starts a cycle after the debounce window', async () => {
            await scheduler.runCycle();
            const cycleTime = jest.now();

            mockRunBatch.mockClear();

            // Advance time to past debounce window, then call requestRecheck
            jest.advanceTimersByTime(PublicPoolCheckConfig.ERROR_RECHECK_DEBOUNCE_MS + 1000);
            scheduler.requestRecheck();

            await jest.runAllTimersAsync();

            expect(mockRunBatch).toHaveBeenCalled();
        });
    });
});
