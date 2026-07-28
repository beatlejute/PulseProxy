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

        it('should NOT overwrite existing presets (fresh install with cloud-synced presets)', async () => {
            // Регрессия на потерю данных: флаг migrationCompleted живёт только в local,
            // поэтому на втором устройстве миграция запускается заново — уже поверх
            // пресетов, синхронизированных из облака. setAll затирал их пустым дефолтом.
            const cloudPresets: Preset[] = [
                makePreset({ id: 'default-custom-preset', name: 'Ignore List', isDefault: true, domains: ['keep-me.com'] }),
                makePreset({ id: 'work', name: 'Work', domains: ['intranet.corp'], order: 1 }),
            ];
            mockHelpers.setLocalStorageData({ presets: cloudPresets });

            const migrationService = createMigrationService();
            await migrationService.migrateFromLegacyDomains();

            const storedPresets = mockHelpers.getLocalStorageData().presets as Preset[];
            expect(storedPresets).toHaveLength(2);
            expect(storedPresets.find(p => p.id === 'work')).toBeDefined();
            expect(storedPresets.find(p => p.id === 'default-custom-preset')?.domains).toEqual(['keep-me.com']);
            // Флаг миграции всё равно проставлен — повторно не запустится
            expect(mockHelpers.getLocalStorageData().migrationCompleted).toBe(true);
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
        it('should merge local and cloud data without losing cloud entities', async () => {
            mockHelpers.setSyncStorageData({
                presets: [
                    makePreset({ id: 'c1', name: 'Cloud-A' }),
                    makePreset({ id: 'c2', name: 'Cloud-B' }),
                ],
                proxies: [makeProxy({ id: 'cp1', host: 'cloud.com' })],
            });
            mockHelpers.setLocalStorageData({
                presets: [makePreset({ id: 'l1', name: 'Local-C' })],
                proxies: [makeProxy({ id: 'lp1', host: 'local.com' })],
            });

            const migrationService = createMigrationService();
            const stats = await migrationService.migrateToSync();

            const syncPresets = mockHelpers.getSyncStorageData().presets as Preset[];
            const syncProxies = mockHelpers.getSyncStorageData().proxies as ProxyServer[];
            expect(syncPresets.map(p => p.name)).toEqual(['Cloud-A', 'Cloud-B', 'Local-C']);
            expect(syncPresets.map(p => p.order)).toEqual([0, 1, 2]);
            expect(syncProxies.map(p => p.host)).toEqual(['cloud.com', 'local.com']);
            // 2 облачных пресета + 1 облачный прокси получены; 1 пресет + 1 прокси добавлены
            expect(stats).toEqual({ received: 3, added: 2 });
        });

        it('should write merged lists to local storage as well', async () => {
            mockHelpers.setSyncStorageData({
                presets: [makePreset({ id: 'c1', name: 'Cloud-only' })],
            });
            mockHelpers.setLocalStorageData({
                presets: [makePreset({ id: 'l1', name: 'Local-only' })],
            });

            const migrationService = createMigrationService();
            await migrationService.migrateToSync();

            const localPresets = mockHelpers.getLocalStorageData().presets as Preset[];
            expect(localPresets.map(p => p.name)).toEqual(['Cloud-only', 'Local-only']);
        });

        it('should deduplicate the same proxy server present on both sides and remap preset references', async () => {
            mockHelpers.setSyncStorageData({
                proxies: [makeProxy({ id: 'cloud-id' })],
            });
            mockHelpers.setLocalStorageData({
                proxies: [makeProxy({ id: 'local-id' })],
                presets: [makePreset({ id: 'l1', proxyId: 'local-id' })],
            });

            const migrationService = createMigrationService();
            const stats = await migrationService.migrateToSync();

            const syncProxies = mockHelpers.getSyncStorageData().proxies as ProxyServer[];
            const syncPresets = mockHelpers.getSyncStorageData().presets as Preset[];
            expect(syncProxies).toHaveLength(1);
            expect(syncProxies[0].id).toBe('cloud-id');
            expect(syncPresets[0].proxyId).toBe('cloud-id');
            // прокси-дубль не считается ни полученным, ни добавленным; пресет добавлен
            expect(stats).toEqual({ received: 0, added: 1 });
        });

        it('should prefer local scalar values and keep cloud value when local is undefined', async () => {
            mockHelpers.setSyncStorageData({
                theme: 'light',
                language: 'ru',
            });
            mockHelpers.setLocalStorageData({
                theme: 'dark',
            });

            const migrationService = createMigrationService();
            await migrationService.migrateToSync();

            const syncData = mockHelpers.getSyncStorageData();
            expect(syncData.theme).toBe('dark');
            expect(syncData.language).toBe('ru');
        });

        it('should migrate proxyCheckEnabled', async () => {
            mockHelpers.setLocalStorageData({ proxyCheckEnabled: false });

            const migrationService = createMigrationService();
            await migrationService.migrateToSync();

            expect(mockHelpers.getSyncStorageData().proxyCheckEnabled).toBe(false);
        });

        it('should not migrate targetState/currentState and purge them from sync', async () => {
            mockHelpers.setSyncStorageData({
                targetState: 'connected',
                currentState: 'connected',
            });
            mockHelpers.setLocalStorageData({
                targetState: 'disconnected',
                currentState: 'disconnected',
                theme: 'dark',
            });

            const migrationService = createMigrationService();
            await migrationService.migrateToSync();

            const syncData = mockHelpers.getSyncStorageData();
            expect(syncData.targetState).toBeUndefined();
            expect(syncData.currentState).toBeUndefined();
            expect(syncData.theme).toBe('dark');
        });

        it('should throw and leave sync untouched when an item exceeds quota', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [makeProxy({ id: 'big', name: 'x'.repeat(9000) })],
                theme: 'dark',
            });

            const migrationService = createMigrationService();
            await expect(migrationService.migrateToSync()).rejects.toThrow(/too large/);

            const syncData = mockHelpers.getSyncStorageData();
            expect(syncData.proxies).toBeUndefined();
            expect(syncData.theme).toBeUndefined();
        });

        it('should reject when chrome.runtime.lastError is set during sync write', async () => {
            mockHelpers.setLocalStorageData({ theme: 'dark' });
            // lastError скоупим строго на sync.set: глобальный setLastError теперь
            // спотыкается уже на чтении из local (backend бросает на lastError),
            // а этот кейс проверяет именно путь ошибки записи в sync.
            (chrome.storage.sync.set as jest.Mock).mockImplementationOnce(
                (_items: Record<string, unknown>, cb?: () => void) => {
                    (chrome.runtime as unknown as { lastError?: { message: string } }).lastError = {
                        message: 'MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded',
                    };
                    cb?.();
                    (chrome.runtime as unknown as { lastError?: { message: string } }).lastError = undefined;
                }
            );

            const migrationService = createMigrationService();
            await expect(migrationService.migrateToSync()).rejects.toThrow(/Sync write failed/);
        });

        it('should do nothing if both storages are empty', async () => {
            mockHelpers.setLocalStorageData({});
            mockHelpers.setSyncStorageData({});

            const migrationService = createMigrationService();
            await migrationService.migrateToSync();

            expect(Object.keys(mockHelpers.getSyncStorageData())).toHaveLength(0);
        });
    });

    describe('migrateToLocal()', () => {
        it('should migrate all sync keys from sync to local storage', async () => {
            const syncData = {
                presets: [makePreset({ id: 'preset-1', name: 'Test' })],
                proxies: [makeProxy({ id: 'proxy-1', host: 'test.com', isDefault: true })],
                theme: 'light',
                language: 'en',
                proxyByDefault: true,
                proxyCheckEnabled: false,
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
            expect(localData.proxyCheckEnabled).toBe(false);
        });

        it('should not copy targetState/currentState from sync to local', async () => {
            mockHelpers.setSyncStorageData({
                targetState: 'connected',
                currentState: 'connected',
                theme: 'light',
            });

            const migrationService = createMigrationService();
            await migrationService.migrateToLocal();

            const localData = mockHelpers.getLocalStorageData();
            expect(localData.targetState).toBeUndefined();
            expect(localData.currentState).toBeUndefined();
            expect(localData.theme).toBe('light');
        });

        it('should skip undefined values during migration', async () => {
            mockHelpers.setSyncStorageData({
                presets: [makePreset({ id: 'preset-1', name: 'Test' })],
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
