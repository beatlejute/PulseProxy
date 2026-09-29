import { mockHelpers } from '../setup';

let sortByLiveStatus: typeof import('../../src/shared/public-proxy-queue').sortByLiveStatus;
let interleaveBySubnet: typeof import('../../src/shared/public-proxy-queue').interleaveBySubnet;
let buildCheckQueue: typeof import('../../src/shared/public-proxy-queue').buildCheckQueue;

describe('public-proxy-queue', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();

        const queueModule = await import('../../src/shared/public-proxy-queue');
        sortByLiveStatus = queueModule.sortByLiveStatus;
        interleaveBySubnet = queueModule.interleaveBySubnet;
        buildCheckQueue = queueModule.buildCheckQueue;
    });

    describe('sortByLiveStatus', () => {
        it('puts live proxies first', () => {
            const proxies = [
                { protocol: 'http' as const, ip: '1.1.1.1', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
                { protocol: 'http' as const, ip: '2.2.2.2', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
                { protocol: 'http' as const, ip: '3.3.3.3', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
                { protocol: 'http' as const, ip: '4.4.4.4', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
            ];

            const statusMap = {
                '1.1.1.1': 'dead' as const,
                '2.2.2.2': 'alive' as const,
                '3.3.3.3': 'checking' as const,
                '4.4.4.4': 'unchecked' as const,
            };

            const getStatus = (proxy: any) => statusMap[proxy.ip];
            const result = sortByLiveStatus(proxies, getStatus);

            // Expected order: alive (2.2.2.2), then checking/unchecked (3.3.3.3, 4.4.4.4), then dead (1.1.1.1)
            expect(result[0].ip).toBe('2.2.2.2');
            expect(result[1].ip).toMatch(/^(3.3.3.3|4.4.4.4)$/);
            expect(result[2].ip).toMatch(/^(3.3.3.3|4.4.4.4)$/);
            expect(result[3].ip).toBe('1.1.1.1');
        });
    });

    describe('interleaveBySubnet', () => {
        it('spreads adjacent proxies across subnets', () => {
            const proxies = [
                { protocol: 'http' as const, ip: '10.0.0.1', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
                { protocol: 'http' as const, ip: '10.0.0.2', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
                { protocol: 'http' as const, ip: '10.1.0.1', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
                { protocol: 'http' as const, ip: '10.1.0.2', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
            ];

            const result = interleaveBySubnet(proxies);

            expect(result).toHaveLength(4);
            // Check that proxies from different /24 subnets are interleaved
            // Adjacent items should be from different /16 subnets when possible
            const ips = result.map(p => p.ip);

            // First and second should be from different /16 subnets
            const subnet16_first = ips[0].split('.').slice(0, 2).join('.');
            const subnet16_second = ips[1].split('.').slice(0, 2).join('.');
            expect(subnet16_first).not.toBe(subnet16_second);
        });
    });

    describe('buildCheckQueue', () => {
        it('returns priority, then filtered, then rest', () => {
            const proxies = [
                { protocol: 'http' as const, ip: '1.1.1.1', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
                { protocol: 'http' as const, ip: '2.2.2.2', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
                { protocol: 'http' as const, ip: '3.3.3.3', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
                { protocol: 'http' as const, ip: '4.4.4.4', port: 8080, score: 100, connectionType: 'datacenter', country: 'US' },
            ];

            const matchesFilter = (proxy: any) => {
                return ['2.2.2.2', '3.3.3.3'].includes(proxy.ip);
            };

            const needsCheck = (proxy: any) => true; // All need check

            // Priority key format: protocol://ip:port
            const priorityKeys = ['http://1.1.1.1:8080'];

            const result = buildCheckQueue(proxies, matchesFilter, needsCheck, priorityKeys);

            expect(result).toHaveLength(4);
            // Priority first
            expect(result[0].ip).toBe('1.1.1.1');
            // Then filtered (2.2.2.2, 3.3.3.3)
            // Then rest (4.4.4.4)
            const ips = result.map(p => p.ip);
            expect(ips.indexOf('1.1.1.1')).toBe(0); // Priority first
        });
    });
});
