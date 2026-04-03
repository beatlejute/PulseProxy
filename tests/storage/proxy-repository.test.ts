/**
 * TDD тесты для ProxyRepository
 * Тестируют CRUD операции с прокси-серверами
 */

import { mockHelpers } from '../setup';
import { ProxyServer, Preset } from '../../src/types';

// Динамический импорт для правильного порядка инициализации моков
let ProxyRepository: typeof import('../../src/storage/proxy-repository').ProxyRepository;
let storageBackend: typeof import('../../src/storage/preset-repository').StorageBackend;

describe('ProxyRepository', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        
        const module = await import('../../src/storage/proxy-repository');
        ProxyRepository = module.ProxyRepository;
        const presetModule = await import('../../src/storage/preset-repository');
        storageBackend = presetModule.StorageBackend;
    });

    const createMockProxy = (overrides?: Partial<ProxyServer>): ProxyServer => ({
        id: 'proxy-1',
        type: 'http',
        host: '192.168.1.1',
        port: 8080,
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    });

    describe('constructor', () => {
        it('should create repository with injected storage backend', () => {
            const repository = new ProxyRepository(storageBackend);
            expect(repository).toBeDefined();
        });
    });

    describe('getAll()', () => {
        it('should return all proxies', async () => {
            const proxies: ProxyServer[] = [
                createMockProxy({ id: 'proxy-1' }),
                createMockProxy({ id: 'proxy-2' }),
            ];
            mockHelpers.setLocalStorageData({ proxies });

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.getAll();

            expect(result).toEqual(proxies);
        });

        it('should return empty array when no proxies exist', async () => {
            mockHelpers.setLocalStorageData({});

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.getAll();

            expect(result).toEqual([]);
        });
    });

    describe('setAll()', () => {
        it('should set all proxies to storage', async () => {
            const proxies: ProxyServer[] = [
                createMockProxy({ id: 'proxy-1' }),
                createMockProxy({ id: 'proxy-2' }),
            ];

            const repository = new ProxyRepository(storageBackend);
            await repository.setAll(proxies);

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.proxies).toEqual(proxies);
        });
    });

    describe('getById()', () => {
        it('should return proxy by ID', async () => {
            const proxy = createMockProxy({ id: 'test-id' });
            mockHelpers.setLocalStorageData({ proxies: [proxy] });

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.getById('test-id');

            expect(result).toEqual(proxy);
        });

        it('should return undefined for non-existent ID', async () => {
            mockHelpers.setLocalStorageData({
                proxies: [createMockProxy({ id: 'existing-id' })],
            });

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.getById('non-existent-id');

            expect(result).toBeUndefined();
        });
    });

    describe('getDefault()', () => {
        it('should return default proxy (isDefault = true)', async () => {
            const proxies: ProxyServer[] = [
                createMockProxy({ id: 'proxy-1', isDefault: false }),
                createMockProxy({ id: 'proxy-2', isDefault: true }),
                createMockProxy({ id: 'proxy-3', isDefault: false }),
            ];
            mockHelpers.setLocalStorageData({ proxies });

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.getDefault();

            expect(result?.id).toBe('proxy-2');
        });

        it('should return undefined if no proxy has isDefault=true', async () => {
            const proxies: ProxyServer[] = [
                createMockProxy({ id: 'proxy-1', isDefault: false }),
                createMockProxy({ id: 'proxy-2', isDefault: false }),
            ];
            mockHelpers.setLocalStorageData({ proxies });

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.getDefault();

            expect(result).toBeUndefined();
        });

        it('should return undefined if no proxies exist', async () => {
            mockHelpers.setLocalStorageData({});

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.getDefault();

            expect(result).toBeUndefined();
        });
    });

    describe('update()', () => {
        it('should update proxy by ID', async () => {
            const proxy = createMockProxy({ id: 'test-id', host: 'old-host', port: 8080 });
            mockHelpers.setLocalStorageData({ proxies: [proxy] });

            const repository = new ProxyRepository(storageBackend);
            await repository.update('test-id', { host: 'new-host', port: 9999 });

            const stored = mockHelpers.getLocalStorageData();
            const updated = stored.proxies[0];
            expect(updated.host).toBe('new-host');
            expect(updated.port).toBe(9999);
            expect(updated.updatedAt).toBeGreaterThanOrEqual(proxy.updatedAt);
        });

        it('should not throw for non-existent ID', async () => {
            const repository = new ProxyRepository(storageBackend);
            
            await expect(repository.update('non-existent', { host: 'test' }))
                .resolves.not.toThrow();
        });
    });

    describe('delete()', () => {
        it('should delete proxy by ID', async () => {
            const proxies: ProxyServer[] = [
                createMockProxy({ id: 'proxy-1' }),
                createMockProxy({ id: 'proxy-2' }),
            ];
            mockHelpers.setLocalStorageData({ proxies });

            const repository = new ProxyRepository(storageBackend);
            await repository.delete('proxy-1');

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.proxies).toHaveLength(1);
            expect(stored.proxies[0].id).toBe('proxy-2');
        });

        it('should not throw for non-existent ID', async () => {
            const repository = new ProxyRepository(storageBackend);

            await expect(repository.delete('non-existent'))
                .resolves.not.toThrow();
        });

        it('cascade cleanup: should reset proxyId in linked preset to null', async () => {
            const proxy = createMockProxy({ id: 'proxy-1' });
            const preset: Preset = {
                id: 'preset-1', name: 'Test', domains: [], enabled: true,
                isDefault: false, order: 0, proxyId: 'proxy-1',
                createdAt: Date.now(), updatedAt: Date.now(),
            };
            mockHelpers.setLocalStorageData({ proxies: [proxy], presets: [preset] });

            const repository = new ProxyRepository(storageBackend);
            await repository.delete('proxy-1');

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets[0].proxyId).toBeNull();
        });

        it('cascade cleanup: should not throw when no presets are linked to deleted proxy', async () => {
            const proxy = createMockProxy({ id: 'proxy-1' });
            mockHelpers.setLocalStorageData({ proxies: [proxy], presets: [] });

            const repository = new ProxyRepository(storageBackend);
            await expect(repository.delete('proxy-1')).resolves.not.toThrow();

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.proxies).toHaveLength(0);
        });

        it('cascade cleanup: should reset proxyId in all presets linked to the same proxy', async () => {
            const proxy = createMockProxy({ id: 'proxy-1' });
            const presetA: Preset = {
                id: 'preset-a', name: 'A', domains: [], enabled: true,
                isDefault: false, order: 0, proxyId: 'proxy-1',
                createdAt: Date.now(), updatedAt: Date.now(),
            };
            const presetB: Preset = {
                id: 'preset-b', name: 'B', domains: [], enabled: true,
                isDefault: false, order: 1, proxyId: 'proxy-1',
                createdAt: Date.now(), updatedAt: Date.now(),
            };
            mockHelpers.setLocalStorageData({ proxies: [proxy], presets: [presetA, presetB] });

            const repository = new ProxyRepository(storageBackend);
            await repository.delete('proxy-1');

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.presets[0].proxyId).toBeNull();
            expect(stored.presets[1].proxyId).toBeNull();
        });
    });

    describe('add()', () => {
        it('should add new proxy with auto-generated ID and timestamps', async () => {
            mockHelpers.setLocalStorageData({ proxies: [] });
            const beforeAdd = Date.now();

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.add({
                type: 'http',
                host: '192.168.1.100',
                port: 3128,
                isDefault: false,
            });

            expect(result.id).toBeDefined();
            expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            expect(result.createdAt).toBeGreaterThanOrEqual(beforeAdd);
            expect(result.updatedAt).toBeGreaterThanOrEqual(beforeAdd);
            expect(result.host).toBe('192.168.1.100');
            expect(result.port).toBe(3128);

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.proxies).toHaveLength(1);
            expect(stored.proxies[0]).toEqual(result);
        });

        it('should add proxy to existing list', async () => {
            const existingProxy = createMockProxy({ id: 'existing' });
            mockHelpers.setLocalStorageData({ proxies: [existingProxy] });

            const repository = new ProxyRepository(storageBackend);
            await repository.add({
                type: 'socks5',
                host: '10.0.0.1',
                port: 1080,
                isDefault: false,
            });

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.proxies).toHaveLength(2);
        });
    });

    describe('setDefault()', () => {
        it('should set proxy as default and unset others', async () => {
            const proxies: ProxyServer[] = [
                createMockProxy({ id: 'proxy-1', isDefault: true }),
                createMockProxy({ id: 'proxy-2', isDefault: false }),
                createMockProxy({ id: 'proxy-3', isDefault: false }),
            ];
            mockHelpers.setLocalStorageData({ proxies });

            const repository = new ProxyRepository(storageBackend);
            await repository.setDefault('proxy-2');

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.proxies[0].isDefault).toBe(false);
            expect(stored.proxies[1].isDefault).toBe(true);
            expect(stored.proxies[2].isDefault).toBe(false);
        });

        it('should handle setting default when no proxies exist', async () => {
            mockHelpers.setLocalStorageData({});

            const repository = new ProxyRepository(storageBackend);
            await expect(repository.setDefault('some-id')).resolves.not.toThrow();
        });

        it('should not affect other proxies when setting already default', async () => {
            const proxies: ProxyServer[] = [
                createMockProxy({ id: 'proxy-1', isDefault: true }),
                createMockProxy({ id: 'proxy-2', isDefault: false }),
            ];
            mockHelpers.setLocalStorageData({ proxies });

            const repository = new ProxyRepository(storageBackend);
            await repository.setDefault('proxy-1');

            const stored = mockHelpers.getLocalStorageData();
            expect(stored.proxies[0].isDefault).toBe(true);
            expect(stored.proxies[1].isDefault).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle different proxy types', async () => {
            mockHelpers.setLocalStorageData({ proxies: [] });

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.add({
                type: 'socks5',
                host: 'localhost',
                port: 9050,
                isDefault: true,
            });

            expect(result.type).toBe('socks5');
        });

        it('should handle IPv6 host', async () => {
            mockHelpers.setLocalStorageData({ proxies: [] });

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.add({
                type: 'http',
                host: '::1',
                port: 8080,
                isDefault: false,
            });

            expect(result.host).toBe('::1');
        });

        it('should handle large port numbers', async () => {
            mockHelpers.setLocalStorageData({ proxies: [] });

            const repository = new ProxyRepository(storageBackend);
            const result = await repository.add({
                type: 'http',
                host: 'example.com',
                port: 65535,
                isDefault: false,
            });

            expect(result.port).toBe(65535);
        });
    });
});