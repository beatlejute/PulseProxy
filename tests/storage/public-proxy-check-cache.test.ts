import {
    publicProxyCacheKey,
    pruneCheckResults,
    mergeCheckResults,
} from '../../src/storage/public-proxy-check-cache';
import { PublicProxyCheckConfig } from '../../src/shared/constants';
import { PublicProxyCheckResults } from '../../src/types';

describe('public-proxy-check-cache', () => {
    const TTL = PublicProxyCheckConfig.CACHE_TTL_MS;
    const NOW = 1_700_000_000_000;

    describe('publicProxyCacheKey', () => {
        it('should build key as protocol://ip:port', () => {
            expect(publicProxyCacheKey({ protocol: 'http', ip: '1.2.3.4', port: 8080 }))
                .toBe('http://1.2.3.4:8080');
            expect(publicProxyCacheKey({ protocol: 'socks5', ip: '10.0.0.1', port: 1080 }))
                .toBe('socks5://10.0.0.1:1080');
        });
    });

    describe('pruneCheckResults', () => {
        it('should keep entries younger than TTL', () => {
            const results: PublicProxyCheckResults = {
                'http://1.2.3.4:80': { status: 'alive', checkedAt: NOW - TTL + 1000 },
                'http://5.6.7.8:80': { status: 'dead', checkedAt: NOW - 1000 },
            };

            expect(pruneCheckResults(results, NOW)).toEqual(results);
        });

        it('should drop entries older than or equal to TTL', () => {
            const results: PublicProxyCheckResults = {
                'http://1.2.3.4:80': { status: 'alive', checkedAt: NOW - TTL },
                'http://5.6.7.8:80': { status: 'dead', checkedAt: NOW - TTL - 5000 },
                'http://9.9.9.9:80': { status: 'alive', checkedAt: NOW - 1000 },
            };

            expect(pruneCheckResults(results, NOW)).toEqual({
                'http://9.9.9.9:80': { status: 'alive', checkedAt: NOW - 1000 },
            });
        });

        it('should drop malformed entries', () => {
            const results = {
                'http://1.2.3.4:80': { status: 'weird', checkedAt: NOW - 1000 },
                'http://5.6.7.8:80': { status: 'alive' },
                'http://7.7.7.7:80': null,
                'http://9.9.9.9:80': { status: 'dead', checkedAt: NOW - 1000 },
            } as unknown as PublicProxyCheckResults;

            expect(pruneCheckResults(results, NOW)).toEqual({
                'http://9.9.9.9:80': { status: 'dead', checkedAt: NOW - 1000 },
            });
        });

        it('should respect custom TTL', () => {
            const results: PublicProxyCheckResults = {
                'http://1.2.3.4:80': { status: 'alive', checkedAt: NOW - 2000 },
            };

            expect(pruneCheckResults(results, NOW, 1000)).toEqual({});
            expect(pruneCheckResults(results, NOW, 5000)).toEqual(results);
        });
    });

    describe('mergeCheckResults', () => {
        it('should add new entries and overwrite existing ones', () => {
            const existing: PublicProxyCheckResults = {
                'http://1.2.3.4:80': { status: 'alive', checkedAt: NOW - 5000 },
                'http://5.6.7.8:80': { status: 'dead', checkedAt: NOW - 5000 },
            };
            const updates: PublicProxyCheckResults = {
                'http://5.6.7.8:80': { status: 'alive', checkedAt: NOW },
                'http://9.9.9.9:80': { status: 'dead', checkedAt: NOW },
            };

            expect(mergeCheckResults(existing, updates)).toEqual({
                'http://1.2.3.4:80': { status: 'alive', checkedAt: NOW - 5000 },
                'http://5.6.7.8:80': { status: 'alive', checkedAt: NOW },
                'http://9.9.9.9:80': { status: 'dead', checkedAt: NOW },
            });
        });

        it('should not mutate inputs', () => {
            const existing: PublicProxyCheckResults = {
                'http://1.2.3.4:80': { status: 'alive', checkedAt: NOW },
            };
            const updates: PublicProxyCheckResults = {
                'http://5.6.7.8:80': { status: 'dead', checkedAt: NOW },
            };

            mergeCheckResults(existing, updates);

            expect(Object.keys(existing)).toEqual(['http://1.2.3.4:80']);
            expect(Object.keys(updates)).toEqual(['http://5.6.7.8:80']);
        });
    });
});
