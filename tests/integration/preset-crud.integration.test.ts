/**
 * Интеграционные тесты для CRUD операций с пресетами
 * Проверяют взаимодействие StorageService ↔ PresetRepository ↔ ProxyRepository
 */

import { mockHelpers } from '../setup';
import { Preset, ProxyServer } from '../../src/types';

// Динамический импорт для правильного порядка инициализации моков
let Storage: typeof import('../../src/storage/storage').Storage;
let PresetRepository: typeof import('../../src/storage/preset-repository').PresetRepository;
let ProxyRepository: typeof import('../../src/storage/proxy-repository').ProxyRepository;

describe('Preset CRUD Integration Tests', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        
        const storageModule = await import('../../src/storage/storage');
        const presetRepoModule = await import('../../src/storage/preset-repository');
        const proxyRepoModule = await import('../../src/storage/proxy-repository');
        
        Storage = storageModule.Storage;
        PresetRepository = presetRepoModule.PresetRepository;
        ProxyRepository = proxyRepoModule.ProxyRepository;
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

    const createMockProxy = (overrides?: Partial<ProxyServer>): ProxyServer => ({
        id: 'proxy-1',
        type: 'http',
        host: '192.168.1.1',
        port: 8080,
        isDefault: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    });

    describe('Create preset', () => {
        it('should create preset and store via StorageService', async () => {
            const repository = new PresetRepository(Storage);
            const presetData: Omit<Preset, 'id' | 'createdAt' | 'updatedAt'> = {
                name: 'New Preset',
                domains: ['new.com'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
            };

            const created = await repository.add(presetData);
            expect(created.id).toBeDefined();
            expect(created.name).toBe('New Preset');
            expect(created.domains).toEqual(['new.com']);

            // Verify storage interaction
            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets).toBeDefined();
            const storedPreset = (stored.presets as Preset[]).find(p => p.id === created.id);
            expect(storedPreset).toEqual(created);
        });

        it('should create preset through StorageService.addPreset', async () => {
            const presetData: Omit<Preset, 'id' | 'createdAt' | 'updatedAt'> = {
                name: 'Storage Preset',
                domains: ['storage.com'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
            };

            const created = await Storage.addPreset(presetData);
            expect(created.id).toBeDefined();
            expect(created.name).toBe('Storage Preset');

            // Verify via repository
            const repository = new PresetRepository(Storage);
            const retrieved = await repository.getById(created.id);
            expect(retrieved).toEqual(created);
        });
    });

    describe('Read preset', () => {
        it('should get preset by ID through StorageService', async () => {
            const preset = createMockPreset({ id: 'test-id' });
            mockHelpers.setLocalStorageData({ presets: [preset] });

            const retrieved = await Storage.getPreset('test-id');
            expect(retrieved).toEqual(preset);
        });

        it('should get all presets through StorageService', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'p1', name: 'First' }),
                createMockPreset({ id: 'p2', name: 'Second' }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const retrieved = await Storage.getPresets();
            expect(retrieved).toHaveLength(2);
            expect(retrieved[0].name).toBe('First');
            expect(retrieved[1].name).toBe('Second');
        });

        it('should get active presets through StorageService', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'p1', enabled: true }),
                createMockPreset({ id: 'p2', enabled: false }),
                createMockPreset({ id: 'p3', enabled: true }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const active = await Storage.getActivePresets();
            expect(active).toHaveLength(2);
            expect(active.every(p => p.enabled)).toBe(true);
        });
    });

    describe('Update preset', () => {
        it('should update preset through StorageService', async () => {
            const preset = createMockPreset({ id: 'update-id', name: 'Old Name' });
            mockHelpers.setLocalStorageData({ presets: [preset] });

            await Storage.updatePreset('update-id', { name: 'New Name', order: 5 });

            const updated = await Storage.getPreset('update-id');
            expect(updated?.name).toBe('New Name');
            expect(updated?.order).toBe(5);
            expect(updated?.updatedAt).toBeGreaterThanOrEqual(preset.updatedAt);
        });

        it('should update preset proxy through StorageService', async () => {
            const preset = createMockPreset({ id: 'preset-with-proxy', proxyId: null });
            const proxy = createMockProxy({ id: 'proxy-123' });
            mockHelpers.setLocalStorageData({ presets: [preset], proxies: [proxy] });

            await Storage.setPresetProxy('preset-with-proxy', 'proxy-123');

            const updated = await Storage.getPreset('preset-with-proxy');
            expect(updated?.proxyId).toBe('proxy-123');
        });

        it('should enable/disable preset through StorageService', async () => {
            const preset = createMockPreset({ id: 'toggle-id', enabled: false });
            mockHelpers.setLocalStorageData({ presets: [preset] });

            await Storage.setPresetEnabled('toggle-id', true);

            const updated = await Storage.getPreset('toggle-id');
            expect(updated?.enabled).toBe(true);
        });
    });

    describe('Delete preset', () => {
        it('should delete preset through StorageService', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'keep' }),
                createMockPreset({ id: 'delete' }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            await Storage.deletePreset('delete');

            const remaining = await Storage.getPresets();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].id).toBe('keep');
        });
    });

    describe('List presets', () => {
        it('should return presets sorted by isDefault then order', async () => {
            const presets: Preset[] = [
                createMockPreset({ id: 'p2', isDefault: false, order: 1 }),
                createMockPreset({ id: 'p1', isDefault: true, order: 0 }),
                createMockPreset({ id: 'p3', isDefault: false, order: 2 }),
            ];
            mockHelpers.setLocalStorageData({ presets });

            const sorted = await Storage.getPresets();
            expect(sorted[0].isDefault).toBe(true);
            expect(sorted[0].id).toBe('p1');
            expect(sorted[1].order).toBe(1);
            expect(sorted[2].order).toBe(2);
        });
    });

    describe('Activate preset', () => {
        it('should mark preset as active through StorageService', async () => {
            const preset = createMockPreset({ id: 'active-preset', enabled: false });
            mockHelpers.setLocalStorageData({ presets: [preset] });

            await Storage.setPresetEnabled('active-preset', true);

            const active = await Storage.getActivePresets();
            expect(active).toHaveLength(1);
            expect(active[0].id).toBe('active-preset');
        });
    });

    describe('Integration with ProxyRepository', () => {
        it('should create preset with proxy and verify proxy linkage', async () => {
            const proxy = createMockProxy({ id: 'proxy-abc' });
            mockHelpers.setLocalStorageData({ proxies: [proxy] });

            const presetData: Omit<Preset, 'id' | 'createdAt' | 'updatedAt'> = {
                name: 'Proxy Preset',
                domains: ['proxy.com'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: 'proxy-abc',
            };

            const created = await Storage.addPreset(presetData);
            expect(created.proxyId).toBe('proxy-abc');

            const presetWithProxy = await Storage.getPreset(created.id);
            expect(presetWithProxy?.proxyId).toBe('proxy-abc');

            // Verify proxy exists via ProxyRepository
            const proxyRepo = new ProxyRepository(Storage);
            const proxyObj = await proxyRepo.getById('proxy-abc');
            expect(proxyObj).toBeDefined();
        });

        it('should update preset proxy and verify proxy repository unchanged', async () => {
            const proxy1 = createMockProxy({ id: 'proxy1' });
            const proxy2 = createMockProxy({ id: 'proxy2' });
            const preset = createMockPreset({ id: 'preset', proxyId: 'proxy1' });
            mockHelpers.setLocalStorageData({ presets: [preset], proxies: [proxy1, proxy2] });

            await Storage.setPresetProxy('preset', 'proxy2');

            const updated = await Storage.getPreset('preset');
            expect(updated?.proxyId).toBe('proxy2');

            // Ensure proxies still exist
            const proxyRepo = new ProxyRepository(Storage);
            const allProxies = await proxyRepo.getAll();
            expect(allProxies).toHaveLength(2);
        });

        it('should delete proxy and affect preset proxyId (set to null)', async () => {
            const proxy = createMockProxy({ id: 'proxy-to-delete' });
            const preset = createMockPreset({ id: 'preset', proxyId: 'proxy-to-delete' });
            mockHelpers.setLocalStorageData({ presets: [preset], proxies: [proxy] });

            await Storage.deleteProxy('proxy-to-delete');

            // Preset's proxyId should be set to null after cascade cleanup
            const presetAfter = await Storage.getPreset('preset');
            expect(presetAfter?.proxyId).toBeNull();
            
            // Verify proxy is deleted
            const proxyAfter = await Storage.getProxy('proxy-to-delete');
            expect(proxyAfter).toBeUndefined();
        });
    });

    describe('Cross-layer interaction', () => {
        it('should reflect preset changes in storage via repositories', async () => {
            const presetRepo = new PresetRepository(Storage);
            const presetData: Omit<Preset, 'id' | 'createdAt' | 'updatedAt'> = {
                name: 'Cross Layer',
                domains: ['test.com'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
            };

            const created = await presetRepo.add(presetData);

            // Verify via StorageService
            const viaStorage = await Storage.getPreset(created.id);
            expect(viaStorage).toEqual(created);

            // Verify via raw storage
            const stored = mockHelpers.getLocalStorageData();
            const storedPreset = (stored.presets as Preset[]).find(p => p.id === created.id);
            expect(storedPreset).toEqual(created);
        });

        it('should handle concurrent operations', async () => {
            // Add preset via repository
            const presetRepo = new PresetRepository(Storage);
            const preset = await presetRepo.add({
                name: 'Concurrent',
                domains: ['concurrent.com'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
            });

            // Update via StorageService
            await Storage.updatePreset(preset.id, { name: 'Updated Concurrent' });

            // Verify via repository
            const repoPreset = await presetRepo.getById(preset.id);
            expect(repoPreset?.name).toBe('Updated Concurrent');
        });
    });
});