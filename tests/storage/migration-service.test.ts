/**
 * TDD тесты для MigrationService
 * Тестируют миграцию данных между форматами storage и версиями схемы
 */

import { mockHelpers } from '../setup';
import { Preset, ProxyServer } from '../../src/types';

// Динамический импорт для правильного порядка инициализации моков
let MigrationService: typeof import('../../src/storage/migration-service').MigrationService;
let PresetRepository: typeof import('../../src/storage/preset-repository').PresetRepository;
let StorageBackend: typeof import('../../src/storage/preset-repository').StorageBackend;

describe('MigrationService', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();

        const migrationModule = await import('../../src/storage/migration-service');
        const presetModule = await import('../../src/storage/preset-repository');
        
        MigrationService = migrationModule.MigrationService;
        PresetRepository = presetModule.PresetRepository;
        StorageBackend = presetModule.StorageBackend;
    });

    const createMigrationService = () => {
        const presetRepository = new PresetRepository(StorageBackend);
        return new MigrationService(StorageBackend, presetRepository);
    };

    describe('migrateFromLegacyDomains()', () => {
        it('should migrate legacy domains from sync storage to presets', async () => {
            mockHelpers.setSyncStorageData({
                domains: ['example.com', 'test.com']
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyDomains();

            const storedPresets = mockHelpers.getLocalStorageData().presets as Preset[];
            expect(storedPresets).toHaveLength(1);
            expect(storedPresets[0].name).toBe('Ignore List');
            expect(storedPresets[0].domains).toEqual(['example.com', 'test.com']);
            expect(storedPresets[0].isDefault).toBe(true);
        });

        it('should migrate legacy domains from local storage if sync is empty', async () => {
            mockHelpers.setLocalStorageData({
                domains: ['local.com']
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyDomains();

            const storedPresets = mockHelpers.getLocalStorageData().presets as Preset[];
            expect(storedPresets[0].domains).toEqual(['local.com']);
        });

        it('should prefer sync domains over local domains', async () => {
            mockHelpers.setSyncStorageData({
                domains: ['sync.com']
            });
            mockHelpers.setLocalStorageData({
                domains: ['local.com']
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyDomains();

            const storedPresets = mockHelpers.getLocalStorageData().presets as Preset[];
            expect(storedPresets[0].domains).toEqual(['sync.com']);
        });

        it('should create default preset with empty domains if no legacy domains', async () => {
            mockHelpers.setLocalStorageData({});
            mockHelpers.setSyncStorageData({});

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyDomains();

            const storedPresets = mockHelpers.getLocalStorageData().presets as Preset[];
            expect(storedPresets).toHaveLength(1);
            expect(storedPresets[0].domains).toEqual([]);
            expect(storedPresets[0].isDefault).toBe(true);
        });

        it('should remove legacy domains from both storages', async () => {
            mockHelpers.setSyncStorageData({
                domains: ['example.com']
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyDomains();

            const localData = mockHelpers.getLocalStorageData();
            const syncData = mockHelpers.getSyncStorageData();
            
            expect(localData.domains).toBeUndefined();
            expect(syncData.domains).toBeUndefined();
        });

        it('should trigger migrateFromLegacyProxy after domains migration', async () => {
            mockHelpers.setSyncStorageData({
                domains: ['example.com'],
                selfProxy: 'proxy.example.com:8080'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyDomains();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[];
            expect(storedProxies).toHaveLength(1);
            expect(storedProxies[0].host).toBe('proxy.example.com');
            expect(storedProxies[0].port).toBe(8080);
        });
    });

    describe('migrateFromLegacyProxy()', () => {
        it('should migrate legacy selfProxy from sync storage', async () => {
            mockHelpers.setSyncStorageData({
                selfProxy: 'legacy-proxy.com:3128'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[];
            expect(storedProxies).toHaveLength(1);
            expect(storedProxies[0].host).toBe('legacy-proxy.com');
            expect(storedProxies[0].port).toBe(3128);
            expect(storedProxies[0].type).toBe('http');
            expect(storedProxies[0].isDefault).toBe(true);
        });

        it('should migrate legacy selfProxy from local storage if sync is empty', async () => {
            mockHelpers.setLocalStorageData({
                selfProxy: 'local-proxy.com:8888'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[];
            expect(storedProxies[0].host).toBe('local-proxy.com');
            expect(storedProxies[0].port).toBe(8888);
        });

        it('should prefer sync selfProxy over local selfProxy', async () => {
            mockHelpers.setSyncStorageData({
                selfProxy: 'sync-proxy.com:9000'
            });
            mockHelpers.setLocalStorageData({
                selfProxy: 'local-proxy.com:8888'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[];
            expect(storedProxies[0].host).toBe('sync-proxy.com');
            expect(storedProxies[0].port).toBe(9000);
        });

        it('should not create proxy if selfProxy is invalid format', async () => {
            mockHelpers.setSyncStorageData({
                selfProxy: 'invalid-format'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[] | undefined;
            expect(storedProxies).toBeUndefined();
        });

        it('should not create proxy if port is not a number', async () => {
            mockHelpers.setSyncStorageData({
                selfProxy: 'proxy.com:invalid'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[] | undefined;
            expect(storedProxies).toBeUndefined();
        });

        it('should remove legacy selfProxy from both storages', async () => {
            mockHelpers.setSyncStorageData({
                selfProxy: 'proxy.com:8080'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const localData = mockHelpers.getLocalStorageData();
            const syncData = mockHelpers.getSyncStorageData();
            
            expect(localData.selfProxy).toBeUndefined();
            expect(syncData.selfProxy).toBeUndefined();
        });

        it('should append to existing proxies if they exist', async () => {
            const existingProxy: ProxyServer = {
                id: 'existing-proxy',
                type: 'https',
                host: 'existing.com',
                port: 443,
                isDefault: false,
                createdAt: Date.now() - 1000,
                updatedAt: Date.now() - 1000,
            };
            mockHelpers.setLocalStorageData({
                proxies: [existingProxy]
            });
            mockHelpers.setSyncStorageData({
                selfProxy: 'legacy.com:8080'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[];
            expect(storedProxies).toHaveLength(2);
            expect(storedProxies[1].host).toBe('legacy.com');
        });
    });

    describe('migrateToSync()', () => {
        it('should migrate all keys from local to sync storage', async () => {
            const localData = {
                presets: [{ id: 'preset-1', name: 'Test' }],
                proxies: [{ id: 'proxy-1', type: 'http', host: 'test.com', port: 8080, isDefault: true }],
                theme: 'dark',
                language: 'ru',
                proxyByDefault: false,
            };
            mockHelpers.setLocalStorageData(localData);

            const migrationService = createMigrationService();
            await migrationService.migrateToSync();

            const syncData = mockHelpers.getSyncStorageData();
            expect(syncData.presets).toEqual(localData.presets);
            expect(syncData.proxies).toEqual(localData.proxies);
            expect(syncData.theme).toBe('dark');
            expect(syncData.language).toBe('ru');
            expect(syncData.proxyByDefault).toBe(false);
        });

        it('should skip undefined values during migration', async () => {
            mockHelpers.setLocalStorageData({
                presets: [{ id: 'preset-1', name: 'Test' }],
                theme: undefined,
            });

            const migrationService = createMigrationService();
            await migrationService.migrateToSync();

            const syncData = mockHelpers.getSyncStorageData();
            expect(syncData.presets).toBeDefined();
            expect(syncData.theme).toBeUndefined();
        });

        it('should do nothing if local storage is empty', async () => {
            mockHelpers.setLocalStorageData({});

            const migrationService = createMigrationService();
            await migrationService.migrateToSync();

            const syncData = mockHelpers.getSyncStorageData();
            expect(Object.keys(syncData)).toHaveLength(0);
        });
    });

    describe('migrateToLocal()', () => {
        it('should migrate all keys from sync to local storage', async () => {
            const syncData = {
                presets: [{ id: 'preset-1', name: 'Test' }],
                proxies: [{ id: 'proxy-1', type: 'http', host: 'test.com', port: 8080, isDefault: true }],
                theme: 'light',
                language: 'en',
                proxyByDefault: true,
            };
            mockHelpers.setSyncStorageData(syncData);

            const migrationService = createMigrationService();
            await migrationService.migrateToLocal();

            const localData = mockHelpers.getLocalStorageData();
            expect(localData.presets).toEqual(syncData.presets);
            expect(localData.proxies).toEqual(syncData.proxies);
            expect(localData.theme).toBe('light');
            expect(localData.language).toBe('en');
            expect(localData.proxyByDefault).toBe(true);
        });

        it('should skip undefined values during migration', async () => {
            mockHelpers.setSyncStorageData({
                presets: [{ id: 'preset-1', name: 'Test' }],
                theme: undefined,
            });

            const migrationService = createMigrationService();
            await migrationService.migrateToLocal();

            const localData = mockHelpers.getLocalStorageData();
            expect(localData.presets).toBeDefined();
            expect(localData.theme).toBeUndefined();
        });

        it('should do nothing if sync storage is empty', async () => {
            mockHelpers.setSyncStorageData({});

            const migrationService = createMigrationService();
            await migrationService.migrateToLocal();

            const localData = mockHelpers.getLocalStorageData();
            expect(Object.keys(localData)).toHaveLength(0);
        });
    });

    describe('edge cases', () => {
        it('should handle malformed legacy proxy with extra colons', async () => {
            mockHelpers.setSyncStorageData({
                selfProxy: 'proxy.com:8080:extra'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[];
            expect(storedProxies).toHaveLength(1);
            expect(storedProxies[0].host).toBe('proxy.com');
            expect(storedProxies[0].port).toBe(8080);
        });

        it('should handle empty string legacy proxy', async () => {
            mockHelpers.setSyncStorageData({
                selfProxy: ''
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[] | undefined;
            expect(storedProxies).toBeUndefined();
        });

        it('should handle null legacy proxy', async () => {
            mockHelpers.setSyncStorageData({
                selfProxy: null as unknown as string
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[] | undefined;
            expect(storedProxies).toBeUndefined();
        });

        it('should generate valid UUID for migrated proxy', async () => {
            mockHelpers.setSyncStorageData({
                selfProxy: 'proxy.com:8080'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[];
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            expect(storedProxies[0].id).toMatch(uuidRegex);
        });

        it('should set timestamps for migrated proxy', async () => {
            const beforeMigration = Date.now();
            mockHelpers.setSyncStorageData({
                selfProxy: 'proxy.com:8080'
            });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyProxy();

            const storedProxies = mockHelpers.getLocalStorageData().proxies as ProxyServer[];
            expect(storedProxies[0].createdAt).toBeGreaterThanOrEqual(beforeMigration);
            expect(storedProxies[0].updatedAt).toBeGreaterThanOrEqual(beforeMigration);
        });
    });
});
