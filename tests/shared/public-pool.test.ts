import { resolvePoolMembers, poolSignature } from '../../src/shared/public-pool';
import { PublicPoolConfig, NormalizedPublicProxy, PublicProxyCheckResults } from '../../src/types';
import { PublicPoolCheckConfig } from '../../src/shared/constants';

const mockProxy = (overrides?: Partial<NormalizedPublicProxy>): NormalizedPublicProxy => ({
    protocol: 'socks5',
    ip: '1.2.3.4',
    port: 9050,
    score: 100,
    connectionType: 'residential',
    country: 'US',
    ...overrides,
});

describe('resolvePoolMembers', () => {
    it('filters by protocol', () => {
        const catalog: NormalizedPublicProxy[] = [
            mockProxy({ protocol: 'socks5' }),
            mockProxy({ protocol: 'http' }),
            mockProxy({ protocol: 'https' }),
        ];
        const config: PublicPoolConfig = { protocols: ['socks5'] };
        const results: PublicProxyCheckResults = {};
        const now = Date.now();

        const { members, needsCheck } = resolvePoolMembers(config, catalog, results, now);

        expect(members).toHaveLength(1);
        expect(members[0].protocol).toBe('socks5');
        expect(needsCheck).toHaveLength(1);
    });

    it('filters by country case-insensitively', () => {
        const catalog: NormalizedPublicProxy[] = [
            mockProxy({ ip: '1.1.1.1', country: 'US' }),
            mockProxy({ ip: '2.2.2.2', country: 'us' }),
            mockProxy({ ip: '3.3.3.3', country: 'GB' }),
        ];
        const config: PublicPoolConfig = { protocols: ['socks5'], country: 'US' };
        const results: PublicProxyCheckResults = {};
        const now = Date.now();

        const { members } = resolvePoolMembers(config, catalog, results, now);

        expect(members).toHaveLength(2);
        expect(members.some((p) => p.ip === '1.1.1.1')).toBe(true);
        expect(members.some((p) => p.ip === '2.2.2.2')).toBe(true);
    });

    it('filters by connectionType', () => {
        const catalog: NormalizedPublicProxy[] = [
            mockProxy({ connectionType: 'residential' }),
            mockProxy({ connectionType: 'corporate' }),
            mockProxy({ connectionType: 'mobile' }),
        ];
        const config: PublicPoolConfig = { protocols: ['socks5'], connectionType: 'residential' };
        const results: PublicProxyCheckResults = {};
        const now = Date.now();

        const { members } = resolvePoolMembers(config, catalog, results, now);

        expect(members).toHaveLength(1);
        expect(members[0].connectionType).toBe('residential');
    });

    it('filters by minScore', () => {
        const catalog: NormalizedPublicProxy[] = [
            mockProxy({ ip: '1.1.1.1', score: 50 }),
            mockProxy({ ip: '2.2.2.2', score: 100 }),
            mockProxy({ ip: '3.3.3.3', score: 150 }),
        ];
        const config: PublicPoolConfig = { protocols: ['socks5'], minScore: 100 };
        const results: PublicProxyCheckResults = {};
        const now = Date.now();

        const { members } = resolvePoolMembers(config, catalog, results, now);

        expect(members).toHaveLength(2);
        expect(members.some((p) => p.ip === '2.2.2.2')).toBe(true);
        expect(members.some((p) => p.ip === '3.3.3.3')).toBe(true);
    });

    it('excludes proxies with status dead', () => {
        const catalog: NormalizedPublicProxy[] = [
            mockProxy({ ip: '1.1.1.1' }),
            mockProxy({ ip: '2.2.2.2' }),
            mockProxy({ ip: '3.3.3.3' }),
        ];
        const results: PublicProxyCheckResults = {
            'socks5://2.2.2.2:9050': { status: 'dead', checkedAt: Date.now() },
        };
        const config: PublicPoolConfig = { protocols: ['socks5'] };
        const now = Date.now();

        const { members } = resolvePoolMembers(config, catalog, results, now);

        expect(members).toHaveLength(2);
        expect(members.some((p) => p.ip === '2.2.2.2')).toBe(false);
    });

    it('sorts members by score desc then key asc', () => {
        const catalog: NormalizedPublicProxy[] = [
            mockProxy({ ip: '1.1.1.1', score: 100 }),
            mockProxy({ ip: '2.2.2.2', score: 100 }),
            mockProxy({ ip: '3.3.3.3', score: 200 }),
        ];
        const config: PublicPoolConfig = { protocols: ['socks5'] };
        const results: PublicProxyCheckResults = {};
        const now = Date.now();

        const { members } = resolvePoolMembers(config, catalog, results, now);

        expect(members).toHaveLength(3);
        // Score 200 comes first
        expect(members[0].score).toBe(200);
        // Score 100 sorted by key asc
        expect(members[1].ip).toBe('1.1.1.1');
        expect(members[2].ip).toBe('2.2.2.2');
    });

    it('limits members to MAX_MEMBERS (200)', () => {
        const catalog: NormalizedPublicProxy[] = Array.from({ length: 250 }, (_, i) =>
            mockProxy({ ip: `${i + 1}.0.0.1`, score: 250 - i })
        );
        const config: PublicPoolConfig = { protocols: ['socks5'] };
        const results: PublicProxyCheckResults = {};
        const now = Date.now();

        const { members } = resolvePoolMembers(config, catalog, results, now);

        expect(members).toHaveLength(PublicPoolCheckConfig.MAX_MEMBERS);
    });

    it('needsCheck includes members without check result', () => {
        const catalog: NormalizedPublicProxy[] = [
            mockProxy({ ip: '1.1.1.1' }),
            mockProxy({ ip: '2.2.2.2' }),
        ];
        const results: PublicProxyCheckResults = {};
        const config: PublicPoolConfig = { protocols: ['socks5'] };
        const now = Date.now();

        const { needsCheck } = resolvePoolMembers(config, catalog, results, now);

        expect(needsCheck).toHaveLength(2);
    });

    it('needsCheck includes members checked RECHECK_INTERVAL_MS ago or earlier', () => {
        const now = Date.now();
        const oldTime = now - PublicPoolCheckConfig.RECHECK_INTERVAL_MS - 1000;

        const catalog: NormalizedPublicProxy[] = [
            mockProxy({ ip: '1.1.1.1' }),
            mockProxy({ ip: '2.2.2.2' }),
            mockProxy({ ip: '3.3.3.3' }),
        ];
        const results: PublicProxyCheckResults = {
            'socks5://1.1.1.1:9050': { status: 'alive', checkedAt: now - 1000 },
            'socks5://2.2.2.2:9050': { status: 'alive', checkedAt: oldTime },
            'socks5://3.3.3.3:9050': { status: 'alive', checkedAt: now },
        };
        const config: PublicPoolConfig = { protocols: ['socks5'] };

        const { needsCheck } = resolvePoolMembers(config, catalog, results, now);

        // Member 1 is fresh (checked recently)
        // Member 2 is old (should be rechecked)
        // Member 3 is just now (fresh)
        expect(needsCheck.some((p) => p.ip === '2.2.2.2')).toBe(true);
        expect(needsCheck.some((p) => p.ip === '1.1.1.1')).toBe(false);
        expect(needsCheck.some((p) => p.ip === '3.3.3.3')).toBe(false);
    });

    it('returns empty members and needsCheck for empty catalog', () => {
        const catalog: NormalizedPublicProxy[] = [];
        const config: PublicPoolConfig = { protocols: ['socks5'] };
        const results: PublicProxyCheckResults = {};
        const now = Date.now();

        const { members, needsCheck } = resolvePoolMembers(config, catalog, results, now);

        expect(members).toHaveLength(0);
        expect(needsCheck).toHaveLength(0);
    });
});

describe('poolSignature', () => {
    it('same members give same signature', () => {
        const members: NormalizedPublicProxy[] = [
            mockProxy({ ip: '1.1.1.1' }),
            mockProxy({ ip: '2.2.2.2' }),
        ];

        const sig1 = poolSignature(members);
        const sig2 = poolSignature(members);

        expect(sig1).toBe(sig2);
    });

    it('signature does not depend on input order', () => {
        const member1 = mockProxy({ ip: '1.1.1.1' });
        const member2 = mockProxy({ ip: '2.2.2.2' });

        const sig1 = poolSignature([member1, member2]);
        const sig2 = poolSignature([member2, member1]);

        expect(sig1).toBe(sig2);
    });
});
