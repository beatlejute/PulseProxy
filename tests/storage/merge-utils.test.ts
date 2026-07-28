/**
 * TDD тесты для merge-utils
 * Тестируют слияние облачных и локальных списков без дублей при включении синхронизации
 */

import { mergeProxies, mergePresets, ProxyMergeResult } from '../../src/storage/merge-utils';
import { DEFAULT_PRESET_ID } from '../../src/shared/constants';
import { Preset, ProxyServer } from '../../src/types';

const makeProxy = (overrides: Partial<ProxyServer> = {}): ProxyServer => ({
    id: 'proxy-1',
    type: 'http',
    host: '1.2.3.4',
    port: 8080,
    isDefault: false,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
});

const makePreset = (overrides: Partial<Preset> = {}): Preset => ({
    id: 'preset-1',
    name: 'Preset',
    domains: [],
    enabled: true,
    isDefault: false,
    order: 0,
    proxyId: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
});

const emptyProxyMerge = (): ProxyMergeResult => ({ merged: [], idRemap: new Map(), received: 0, added: 0 });

describe('mergeProxies()', () => {
    it('should return empty result for empty inputs', () => {
        const result = mergeProxies([], []);

        expect(result.merged).toEqual([]);
        expect(result.idRemap.size).toBe(0);
    });

    it('should return local proxies when cloud is empty', () => {
        const local = [makeProxy({ id: 'l1' }), makeProxy({ id: 'l2', host: '5.6.7.8' })];

        const result = mergeProxies([], local);

        expect(result.merged).toEqual(local);
        expect(result.idRemap.size).toBe(0);
    });

    it('should return cloud proxies when local is empty', () => {
        const cloud = [makeProxy({ id: 'c1' })];

        const result = mergeProxies(cloud, []);

        expect(result.merged).toEqual(cloud);
    });

    it('should concatenate non-overlapping lists (cloud first)', () => {
        const cloud = [makeProxy({ id: 'c1', host: 'cloud.com' })];
        const local = [makeProxy({ id: 'l1', host: 'local.com' })];

        const result = mergeProxies(cloud, local);

        expect(result.merged.map(p => p.id)).toEqual(['c1', 'l1']);
        expect(result.idRemap.size).toBe(0);
    });

    describe('статистика received/added', () => {
        it('should count non-overlapping entries as received and added', () => {
            const result = mergeProxies(
                [makeProxy({ id: 'c1', host: 'cloud.com' }), makeProxy({ id: 'c2', host: 'cloud2.com' })],
                [makeProxy({ id: 'l1', host: 'local.com' })]
            );

            expect(result.received).toBe(2);
            expect(result.added).toBe(1);
        });

        it('should not count id duplicates as received or added', () => {
            const result = mergeProxies(
                [makeProxy({ id: 'p1' })],
                [makeProxy({ id: 'p1', updatedAt: 2000 })]
            );

            expect(result.received).toBe(0);
            expect(result.added).toBe(0);
        });

        it('should not count content duplicates as received or added', () => {
            const result = mergeProxies(
                [makeProxy({ id: 'cloud-id' })],
                [makeProxy({ id: 'local-id' })]
            );

            expect(result.received).toBe(0);
            expect(result.added).toBe(0);
        });

        it('should report zero stats for empty inputs', () => {
            const result = mergeProxies([], []);

            expect(result.received).toBe(0);
            expect(result.added).toBe(0);
        });
    });

    describe('дубль по id', () => {
        it('should keep local fields when local is newer', () => {
            const cloud = [makeProxy({ id: 'p1', name: 'Cloud', updatedAt: 1000 })];
            const local = [makeProxy({ id: 'p1', name: 'Local', updatedAt: 2000 })];

            const result = mergeProxies(cloud, local);

            expect(result.merged).toHaveLength(1);
            expect(result.merged[0].name).toBe('Local');
        });

        it('should keep cloud fields when cloud is newer', () => {
            const cloud = [makeProxy({ id: 'p1', name: 'Cloud', updatedAt: 3000 })];
            const local = [makeProxy({ id: 'p1', name: 'Local', updatedAt: 2000 })];

            const result = mergeProxies(cloud, local);

            expect(result.merged[0].name).toBe('Cloud');
        });

        it('should prefer cloud version on equal updatedAt', () => {
            const cloud = [makeProxy({ id: 'p1', name: 'Cloud', updatedAt: 2000 })];
            const local = [makeProxy({ id: 'p1', name: 'Local', updatedAt: 2000 })];

            const result = mergeProxies(cloud, local);

            expect(result.merged[0].name).toBe('Cloud');
        });
    });

    describe('контентный дубль (один сервер, разные UUID)', () => {
        it('should deduplicate same server and keep cloud id', () => {
            const cloud = [makeProxy({ id: 'cloud-id', updatedAt: 1000 })];
            const local = [makeProxy({ id: 'local-id', updatedAt: 2000, name: 'Fresh name' })];

            const result = mergeProxies(cloud, local);

            expect(result.merged).toHaveLength(1);
            expect(result.merged[0].id).toBe('cloud-id');
            expect(result.merged[0].name).toBe('Fresh name');
            expect(result.idRemap.get('local-id')).toBe('cloud-id');
        });

        it('should treat same host/port with different username as different servers', () => {
            const cloud = [makeProxy({ id: 'c1', username: 'alice' })];
            const local = [makeProxy({ id: 'l1', username: 'bob' })];

            const result = mergeProxies(cloud, local);

            expect(result.merged).toHaveLength(2);
            expect(result.idRemap.size).toBe(0);
        });
    });

    describe('инвариант isDefault', () => {
        it('should prefer local default when both sides have different defaults', () => {
            const cloud = [makeProxy({ id: 'c1', host: 'cloud.com', isDefault: true })];
            const local = [makeProxy({ id: 'l1', host: 'local.com', isDefault: true })];

            const result = mergeProxies(cloud, local);

            const defaults = result.merged.filter(p => p.isDefault);
            expect(defaults).toHaveLength(1);
            expect(defaults[0].id).toBe('l1');
        });

        it('should keep cloud default when local has none', () => {
            const cloud = [makeProxy({ id: 'c1', isDefault: true })];
            const local = [makeProxy({ id: 'l1', host: 'other.com' })];

            const result = mergeProxies(cloud, local);

            const defaults = result.merged.filter(p => p.isDefault);
            expect(defaults).toHaveLength(1);
            expect(defaults[0].id).toBe('c1');
        });

        it('should keep default on survivor when local default is a content duplicate', () => {
            const cloud = [makeProxy({ id: 'cloud-id', isDefault: false })];
            const local = [makeProxy({ id: 'local-id', isDefault: true })];

            const result = mergeProxies(cloud, local);

            expect(result.merged).toHaveLength(1);
            expect(result.merged[0].id).toBe('cloud-id');
            expect(result.merged[0].isDefault).toBe(true);
        });

        it('should assign no default when neither side has one', () => {
            const result = mergeProxies(
                [makeProxy({ id: 'c1' })],
                [makeProxy({ id: 'l1', host: 'other.com' })]
            );

            expect(result.merged.every(p => !p.isDefault)).toBe(true);
        });
    });

    it('should not mutate input arrays', () => {
        const cloud = [makeProxy({ id: 'p1', name: 'Cloud', isDefault: true })];
        const local = [makeProxy({ id: 'p1', name: 'Local', updatedAt: 2000, isDefault: true })];
        const cloudSnapshot = JSON.parse(JSON.stringify(cloud));
        const localSnapshot = JSON.parse(JSON.stringify(local));

        mergeProxies(cloud, local);

        expect(cloud).toEqual(cloudSnapshot);
        expect(local).toEqual(localSnapshot);
    });
});

describe('mergePresets()', () => {
    it('should return empty list for empty inputs', () => {
        expect(mergePresets([], [], emptyProxyMerge()).merged).toEqual([]);
    });

    it('should concatenate non-overlapping lists and renumber order sequentially', () => {
        const cloud = [
            makePreset({ id: 'c1', name: 'Cloud-A', order: 5 }),
            makePreset({ id: 'c2', name: 'Cloud-B', order: 7 }),
        ];
        const local = [makePreset({ id: 'l1', name: 'Local-C', order: 0 })];

        const result = mergePresets(cloud, local, emptyProxyMerge());

        expect(result.merged.map(p => p.name)).toEqual(['Cloud-A', 'Cloud-B', 'Local-C']);
        expect(result.merged.map(p => p.order)).toEqual([0, 1, 2]);
    });

    it('should union domains of the default preset present on both sides', () => {
        const cloud = [makePreset({
            id: DEFAULT_PRESET_ID, name: 'Custom', isDefault: true,
            domains: ['cloud.com', 'shared.com'], updatedAt: 2000,
        })];
        const local = [makePreset({
            id: DEFAULT_PRESET_ID, name: 'Custom', isDefault: true,
            domains: ['local.com', 'shared.com'], updatedAt: 1000,
        })];

        const result = mergePresets(cloud, local, emptyProxyMerge());

        expect(result.merged).toHaveLength(1);
        expect(result.merged[0].id).toBe(DEFAULT_PRESET_ID);
        expect(result.merged[0].domains).toEqual(['cloud.com', 'shared.com', 'local.com']);
    });

    it('should deduplicate presets by normalized name and keep cloud id', () => {
        const cloud = [makePreset({ id: 'c1', name: 'Work', domains: ['a.com'], updatedAt: 1000 })];
        const local = [makePreset({ id: 'l1', name: '  work ', domains: ['b.com'], updatedAt: 2000, enabled: false })];

        const result = mergePresets(cloud, local, emptyProxyMerge());

        expect(result.merged).toHaveLength(1);
        expect(result.merged[0].id).toBe('c1');
        expect(result.merged[0].enabled).toBe(false);
        expect(result.merged[0].domains).toEqual(['a.com', 'b.com']);
    });

    it('should keep cloud fields on equal updatedAt', () => {
        const cloud = [makePreset({ id: 'p1', enabled: true, updatedAt: 2000 })];
        const local = [makePreset({ id: 'p1', enabled: false, updatedAt: 2000 })];

        const result = mergePresets(cloud, local, emptyProxyMerge());

        expect(result.merged[0].enabled).toBe(true);
    });

    describe('статистика received/added', () => {
        it('should count non-overlapping entries as received and added', () => {
            const result = mergePresets(
                [makePreset({ id: 'c1', name: 'Cloud-A' })],
                [makePreset({ id: 'l1', name: 'Local-B' }), makePreset({ id: 'l2', name: 'Local-C' })],
                emptyProxyMerge()
            );

            expect(result.received).toBe(1);
            expect(result.added).toBe(2);
        });

        it('should not count duplicates (by id or name) as received or added', () => {
            const result = mergePresets(
                [makePreset({ id: 'p1', name: 'Same' }), makePreset({ id: 'c2', name: 'Work' })],
                [makePreset({ id: 'p1', name: 'Same' }), makePreset({ id: 'l2', name: 'work' })],
                emptyProxyMerge()
            );

            expect(result.received).toBe(0);
            expect(result.added).toBe(0);
        });
    });

    describe('ссылки proxyId', () => {
        it('should remap proxyId of deduplicated proxies', () => {
            const proxyMerge: ProxyMergeResult = {
                merged: [makeProxy({ id: 'cloud-proxy' })],
                idRemap: new Map([['local-proxy', 'cloud-proxy']]),
                received: 0,
                added: 0,
            };
            const local = [makePreset({ id: 'l1', proxyId: 'local-proxy' })];

            const result = mergePresets([], local, proxyMerge);

            expect(result.merged[0].proxyId).toBe('cloud-proxy');
        });

        it('should null out proxyId not present in merged proxies', () => {
            const local = [makePreset({ id: 'l1', proxyId: 'ghost-proxy' })];

            const result = mergePresets([], local, emptyProxyMerge());

            expect(result.merged[0].proxyId).toBeNull();
        });

        it('should keep valid proxyId as is', () => {
            const proxyMerge: ProxyMergeResult = {
                merged: [makeProxy({ id: 'p1' })],
                idRemap: new Map(),
                received: 0,
                added: 0,
            };
            const cloud = [makePreset({ id: 'c1', proxyId: 'p1' })];

            const result = mergePresets(cloud, [], proxyMerge);

            expect(result.merged[0].proxyId).toBe('p1');
        });

        it('should keep null proxyId as null', () => {
            const result = mergePresets([makePreset({ proxyId: null })], [], emptyProxyMerge());

            expect(result.merged[0].proxyId).toBeNull();
        });
    });

    it('should not mutate input arrays', () => {
        const cloud = [makePreset({ id: 'p1', domains: ['a.com'] })];
        const local = [makePreset({ id: 'p1', domains: ['b.com'], updatedAt: 2000 })];
        const cloudSnapshot = JSON.parse(JSON.stringify(cloud));
        const localSnapshot = JSON.parse(JSON.stringify(local));

        mergePresets(cloud, local, emptyProxyMerge());

        expect(cloud).toEqual(cloudSnapshot);
        expect(local).toEqual(localSnapshot);
    });
});
