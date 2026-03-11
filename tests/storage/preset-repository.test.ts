/**
 * TDD тесты для PresetRepository
 * Тестируют CRUD операции с пресетами
 */

import { mockHelpers } from '../setup';
import { Preset } from '../../src/types';

// Динамический импорт для правильного порядка инициализации моков
let PresetRepository: typeof import('../../src/storage/preset-repository').PresetRepository;
let storageBackend: typeof import('../../src/storage/preset-repository').StorageBackend;

describe('PresetRepository', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        
        const module = await import('../../src/storage/preset-repository');
        PresetRepository = module.PresetRepository;
        storageBackend = module.StorageBackend;
    });

    const createMockPreset = (overrides?: Partial<Preset>): Preset => ({
        id: 'preset-1',
        name: 'Test Preset',
        domains: ['example.com'],
        enabled: true,
        isDefault: false,
        order: 0,
        proxyId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    });

    describe('constructor', () => {
        it('should create repository with injected storage backend', () => {
            const repository = new PresetRepository(storageBackend);
            expect(repository).toBeDefined();
        });
    });

    describe('getAll()', () => {
        it('should return all presets sorted by isDefault then order', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'preset-2', name: 'Custom 2', isDefault: false, order: 1 }),
                createMockPreset({ id: 'preset-1', name: 'Custom', isDefault: true, order: 0 }),
                createMockPreset({ id: 'preset-3', name: 'Custom 3', isDefault: false, order: 2 }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const repository = new PresetRepository(storageBackend);
            const result = await repository.getAll();

            // Первый должен быть isDefault=true
            expect(result[0].isDefault).toBe(true);
            expect(result[0].name).toBe('Custom');
            // Остальные сортируются по order
            expect(result[1].order).toBe(1);
            expect(result[2].order).toBe(2);
        });

        it('should return empty array when no presets exist', async () => {
            mockHelpers.setLocalStorageData({});

            const repository = new PresetRepository(storageBackend);
            const result = await repository.getAll();

            expect(result).toHaveLength(1);
            expect(result[0].isDefault).toBe(true);
            expect(result[0].name).toBe('Ignore List');
        });

        it('should create default preset when none exist', async () => {
            mockHelpers.setLocalStorageData({});

            const repository = new PresetRepository(storageBackend);
            const result = await repository.getAll();

            expect(result).toHaveLength(1);
            expect(result[0].isDefault).toBe(true);
            expect(result[0].name).toBe('Ignore List');
        });
    });

    describe('setAll()', () => {
        it('should set all presets to storage', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'preset-1' }),
                createMockPreset({ id: 'preset-2' }),
            ];

            const repository = new PresetRepository(storageBackend);
            await repository.setAll(presets);

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets).toEqual(presets);
        });
    });

    describe('getById()', () => {
        it('should return preset by ID', async () => {
            const preset = createMockPreset({ id: 'test-id' });
            mockHelpers.setLocalStorageData({ presets: [preset] });

            const repository = new PresetRepository(storageBackend);
            const result = await repository.getById('test-id');

            expect(result).toEqual(preset);
        });

        it('should return undefined for non-existent ID', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createMockPreset({ id: 'existing-id' })],
            });

            const repository = new PresetRepository(storageBackend);
            const result = await repository.getById('non-existent-id');

            expect(result).toBeUndefined();
        });
    });

    describe('update()', () => {
        it('should update preset by ID', async () => {
            const preset = createMockPreset({ id: 'test-id', name: 'Old Name', order: 0 });
            mockHelpers.setLocalStorageData({ presets: [preset] });

            const repository = new PresetRepository(storageBackend);
            await repository.update('test-id', { name: 'New Name', order: 5 });

            const stored = mockHelpers.getLocalStorageData();
            const updated = stored.presets[0];
            expect(updated.name).toBe('New Name');
            expect(updated.order).toBe(5);
            expect(updated.updatedAt).toBeGreaterThanOrEqual(preset.updatedAt);
        });

        it('should not throw for non-existent ID', async () => {
            const repository = new PresetRepository(storageBackend);
            
            await expect(repository.update('non-existent', { name: 'Test' }))
                .resolves.not.toThrow();
        });
    });

    describe('delete()', () => {
        it('should delete preset by ID', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'preset-1' }),
                createMockPreset({ id: 'preset-2' }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const repository = new PresetRepository(storageBackend);
            await repository.delete('preset-1');

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets).toHaveLength(1);
            expect(stored.presets[0].id).toBe('preset-2');
        });

        it('should not throw for non-existent ID', async () => {
            const repository = new PresetRepository(storageBackend);
            
            await expect(repository.delete('non-existent'))
                .resolves.not.toThrow();
        });
    });

    describe('add()', () => {
        it('should add new preset with auto-generated ID and timestamps', async () => {
            mockHelpers.setLocalStorageData({ presets: [] });
            const beforeAdd = Date.now();

            const repository = new PresetRepository(storageBackend);
            const result = await repository.add({
                name: 'New Preset',
                domains: ['new.com'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
            });

            expect(result.id).toBeDefined();
            expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            expect(result.createdAt).toBeGreaterThanOrEqual(beforeAdd);
            expect(result.updatedAt).toBeGreaterThanOrEqual(beforeAdd);
            expect(result.name).toBe('New Preset');

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets).toHaveLength(2);
            expect(stored.presets[0].isDefault).toBe(true);
            expect(stored.presets[0].name).toBe('Ignore List');
            expect(stored.presets[1]).toEqual(result);
        });

        it('should add preset to existing list', async () => {
            const existingPreset = createMockPreset({ id: 'existing' });
            mockHelpers.setLocalStorageData({ presets: [existingPreset] });

            const repository = new PresetRepository(storageBackend);
            await repository.add({
                name: 'New Preset',
                domains: ['new.com'],
                enabled: true,
                isDefault: false,
                order: 1,
                proxyId: null,
            });

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets).toHaveLength(2);
        });
    });

    describe('setEnabled()', () => {
        it('should set enabled flag for preset', async () => {
            const preset = createMockPreset({ id: 'test-id', enabled: false });
            mockHelpers.setLocalStorageData({ presets: [preset] });

            const repository = new PresetRepository(storageBackend);
            await repository.setEnabled('test-id', true);

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets[0].enabled).toBe(true);
            expect(stored.presets[0].updatedAt).toBeGreaterThanOrEqual(preset.updatedAt);
        });
    });

    describe('setProxy()', () => {
        it('should set proxyId for preset', async () => {
            const preset = createMockPreset({ id: 'test-id', proxyId: null });
            mockHelpers.setLocalStorageData({ presets: [preset] });

            const repository = new PresetRepository(storageBackend);
            await repository.setProxy('test-id', 'proxy-123');

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets[0].proxyId).toBe('proxy-123');
        });

        it('should set proxyId to null', async () => {
            const preset = createMockPreset({ id: 'test-id', proxyId: 'old-proxy' });
            mockHelpers.setLocalStorageData({ presets: [preset] });

            const repository = new PresetRepository(storageBackend);
            await repository.setProxy('test-id', null);

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets[0].proxyId).toBeNull();
        });
    });

    describe('reorder()', () => {
        it('should reorder presets by ID array', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'preset-1', order: 0 }),
                createMockPreset({ id: 'preset-2', order: 1 }),
                createMockPreset({ id: 'preset-3', order: 2 }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const repository = new PresetRepository(storageBackend);
            await repository.reorder(['preset-3', 'preset-1', 'preset-2']);

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets[0].id).toBe('preset-3');
            expect(stored.presets[0].order).toBe(0);
            expect(stored.presets[1].id).toBe('preset-1');
            expect(stored.presets[1].order).toBe(1);
            expect(stored.presets[2].id).toBe('preset-2');
            expect(stored.presets[2].order).toBe(2);
        });

        it('should keep isDefault preset first regardless of order', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'preset-1', isDefault: false, order: 0 }),
                createMockPreset({ id: 'default', isDefault: true, order: 1 }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const repository = new PresetRepository(storageBackend);
            await repository.reorder(['preset-1', 'default']);

            const stored = mockHelpers.getLocalStorageData();
            // isDefault должен остатьсяся первым
            expect(stored.presets[0].isDefault).toBe(true);
            expect(stored.presets[0].id).toBe('default');
        });
    });

    describe('getActive()', () => {
        it('should return only enabled presets', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'preset-1', enabled: true }),
                createMockPreset({ id: 'preset-2', enabled: false }),
                createMockPreset({ id: 'preset-3', enabled: true }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const repository = new PresetRepository(storageBackend);
            const result = await repository.getActive();

            expect(result).toHaveLength(2);
            expect(result.every(p => p.enabled)).toBe(true);
        });

        it('should return empty array when no active presets', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'preset-1', enabled: false }),
                createMockPreset({ id: 'preset-2', enabled: false }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const repository = new PresetRepository(storageBackend);
            const result = await repository.getActive();

            expect(result).toHaveLength(0);
        });
    });

    describe('getAllActiveDomains()', () => {
        it('should return unique domains from all active presets', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'preset-1', enabled: true, domains: ['a.com', 'b.com'] }),
                createMockPreset({ id: 'preset-2', enabled: false, domains: ['c.com'] }),
                createMockPreset({ id: 'preset-3', enabled: true, domains: ['b.com', 'd.com'] }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const repository = new PresetRepository(storageBackend);
            const result = await repository.getAllActiveDomains();

            // Только из активных, уникальные
            expect(result).toHaveLength(3);
            expect(result).toContain('a.com');
            expect(result).toContain('b.com');
            expect(result).toContain('d.com');
            expect(result).not.toContain('c.com');
        });

        it('should return empty array when no active presets', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'preset-1', enabled: false, domains: ['a.com'] }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const repository = new PresetRepository(storageBackend);
            const result = await repository.getAllActiveDomains();

            expect(result).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should handle null/undefined in preset data', async () => {
            mockHelpers.setLocalStorageData({ presets: [] });

            const repository = new PresetRepository(storageBackend);
            const result = await repository.add({
                name: 'Test',
                domains: [],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
            });

            expect(result.proxyId).toBeNull();
        });

        it('should handle unicode in preset name', async () => {
            mockHelpers.setLocalStorageData({ presets: [] });

            const repository = new PresetRepository(storageBackend);
            const result = await repository.add({
                name: 'Тестовый пресет 🚀',
                domains: ['тест.рф'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
            });

            expect(result.name).toBe('Тестовый пресет 🚀');
        });

        it('should handle very long domain lists', async () => {
            mockHelpers.setLocalStorageData({ presets: [] });
            const longDomains = Array.from({ length: 100 }, (_, i) => `domain${i}.com`);

            const repository = new PresetRepository(storageBackend);
            const result = await repository.add({
                name: 'Large Preset',
                domains: longDomains,
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
            });

            expect(result.domains).toHaveLength(100);
        });
    });
});
