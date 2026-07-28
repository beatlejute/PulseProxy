import { mockHelpers } from '../setup';

// Нужно импортировать Storage после setup, чтобы моки были активны
// Используем динамический импорт для правильного порядка инициализации
let Storage: typeof import('../../src/shared/storage').Storage;

describe('storage.ts - StorageService', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        // Переимпортируем модуль для чистого состояния
        jest.resetModules();
        const storageModule = await import('../../src/shared/storage');
        Storage = storageModule.Storage;
    });

    describe('init()', () => {
        it('should initialize with syncEnabled from storage', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: true });
            
            await Storage.init();
            
            expect(chrome.storage.local.get).toHaveBeenCalledWith('syncEnabled');
        });

        it('should default to syncEnabled = false if not set (opt-in)', async () => {
            mockHelpers.setLocalStorageData({});

            await Storage.init();

            const syncEnabled = await Storage.getSyncEnabled();
            expect(syncEnabled).toBe(false);
        });

        it('should subscribe to storage changes', async () => {
            await Storage.init();
            
            expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
        });
    });

    describe('get()', () => {
        it('should get value from local storage when sync disabled', async () => {
            const testPresets = [{ id: 'test', name: 'Test', domains: ['test.com'], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }];
            mockHelpers.setLocalStorageData({ presets: testPresets });
            
            const result = await Storage.get('presets');
            
            expect(result).toEqual(testPresets);
            expect(chrome.storage.local.get).toHaveBeenCalledWith('presets', expect.any(Function));
        });

        it('should return undefined for non-existent key', async () => {
            mockHelpers.setLocalStorageData({});
            
            const result = await Storage.get('presets');
            
            expect(result).toBeUndefined();
        });
    });

    describe('set()', () => {
        it('should set value in local storage when sync disabled', async () => {
            await Storage.set('currentState', 'connected');
            
            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { currentState: 'connected' },
                expect.any(Function)
            );
        });

        it('should store the value correctly', async () => {
            const testPresets = [{ id: 'test', name: 'Test', domains: ['domain1.com'], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }];
            await Storage.set('presets', testPresets);
            
            const data = mockHelpers.getLocalStorageData();
            expect(data.presets).toEqual(testPresets);
        });
    });

    describe('getMultiple()', () => {
        it('should get multiple values at once', async () => {
            const testPresets = [{ id: 'test', name: 'Test', domains: ['test.com'], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }];
            const testProxies = [{ id: 'proxy1', type: 'http', host: '127.0.0.1', port: 8080, isDefault: true, createdAt: 0, updatedAt: 0 }];
            mockHelpers.setLocalStorageData({
                presets: testPresets,
                proxies: testProxies,
                theme: 'dark',
            });
            
            const result = await Storage.getMultiple(['presets', 'proxies', 'theme']);
            
            expect(result.presets).toEqual(testPresets);
            expect(result.proxies).toEqual(testProxies);
            expect(result.theme).toBe('dark');
        });

        it('should return partial results for missing keys', async () => {
            const testPresets = [{ id: 'test', name: 'Test', domains: ['test.com'], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }];
            mockHelpers.setLocalStorageData({
                presets: testPresets,
            });
            
            const result = await Storage.getMultiple(['presets', 'proxies']);
            
            expect(result.presets).toEqual(testPresets);
            expect(result.proxies).toBeUndefined();
        });
    });

    describe('Specialized methods', () => {
        describe('getPresets() / setPresets()', () => {
            it('should get presets as array', async () => {
                const testPresets = [
                    { id: 'a', name: 'A', domains: ['a.com'], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 },
                    { id: 'b', name: 'B', domains: ['b.com'], enabled: true, isDefault: false, order: 1, createdAt: 0, updatedAt: 0 }
                ];
                mockHelpers.setLocalStorageData({ presets: testPresets });
                
                const presets = await Storage.getPresets();
                
                expect(presets).toEqual(testPresets);
            });

            it('should create default preset if presets not set', async () => {
                mockHelpers.setLocalStorageData({});
                
                const presets = await Storage.getPresets();
                
                // getPresets() создаёт дефолтный пресет Ignore List если пресетов нет
                expect(presets).toHaveLength(1);
                expect(presets[0].id).toBe('default-custom-preset');
                expect(presets[0].name).toBe('Ignore List');
                expect(presets[0].isDefault).toBe(true);
            });

            it('should set presets', async () => {
                const testPresets = [{ id: 'x', name: 'X', domains: ['x.com'], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }];
                await Storage.setPresets(testPresets);
                
                const data = mockHelpers.getLocalStorageData();
                expect(data.presets).toEqual(testPresets);
            });
        });

        describe('getProxies() / setProxies() / getProxy()', () => {
            it('should get proxies as array', async () => {
                const testProxies = [
                    { id: 'proxy1', type: 'http', host: '192.168.1.1', port: 3128, isDefault: true, createdAt: 0, updatedAt: 0 }
                ];
                mockHelpers.setLocalStorageData({ proxies: testProxies });
                
                const proxies = await Storage.getProxies();
                
                expect(proxies).toEqual(testProxies);
            });

            it('should return empty array if proxies not set', async () => {
                mockHelpers.setLocalStorageData({});
                
                const proxies = await Storage.getProxies();
                
                expect(proxies).toEqual([]);
            });

            it('should get proxy by id', async () => {
                const testProxies = [
                    { id: 'proxy1', type: 'http', host: '192.168.1.1', port: 3128, isDefault: true, createdAt: 0, updatedAt: 0 },
                    { id: 'proxy2', type: 'socks5', host: '10.0.0.1', port: 1080, isDefault: false, createdAt: 0, updatedAt: 0 }
                ];
                mockHelpers.setLocalStorageData({ proxies: testProxies });
                
                const proxy = await Storage.getProxy('proxy2');
                
                expect(proxy).toEqual(testProxies[1]);
            });

            it('should return undefined for non-existent proxy id', async () => {
                mockHelpers.setLocalStorageData({ proxies: [] });
                
                const proxy = await Storage.getProxy('non-existent');
                
                expect(proxy).toBeUndefined();
            });

            it('should set proxies', async () => {
                const testProxies = [
                    { id: 'proxy1', type: 'http', host: '10.0.0.1', port: 8080, isDefault: true, createdAt: 0, updatedAt: 0 }
                ];
                await Storage.setProxies(testProxies);
                
                const data = mockHelpers.getLocalStorageData();
                expect(data.proxies).toEqual(testProxies);
            });
        });

        describe('getCurrentState() / setCurrentState()', () => {
            it('should get current state', async () => {
                mockHelpers.setLocalStorageData({ currentState: 'connected' });
                
                const state = await Storage.getCurrentState();
                
                expect(state).toBe('connected');
            });

            it('should return disconnected as default', async () => {
                mockHelpers.setLocalStorageData({});
                
                const state = await Storage.getCurrentState();
                
                expect(state).toBe('disconnected');
            });

            it('should set current state', async () => {
                await Storage.setCurrentState('connecting');
                
                const data = mockHelpers.getLocalStorageData();
                expect(data.currentState).toBe('connecting');
            });
        });

        describe('getTargetState() / setTargetState()', () => {
            it('should get target state', async () => {
                mockHelpers.setLocalStorageData({ targetState: 'connected' });
                
                const state = await Storage.getTargetState();
                
                expect(state).toBe('connected');
            });

            it('should return disconnected as default', async () => {
                mockHelpers.setLocalStorageData({});
                
                const state = await Storage.getTargetState();
                
                expect(state).toBe('disconnected');
            });

            it('should set target state', async () => {
                await Storage.setTargetState('connected');
                
                const data = mockHelpers.getLocalStorageData();
                expect(data.targetState).toBe('connected');
            });
        });

        describe('getTheme() / setTheme()', () => {
            it('should get theme', async () => {
                mockHelpers.setLocalStorageData({ theme: 'light' });
                
                const theme = await Storage.getTheme();
                
                expect(theme).toBe('light');
            });

            it('should return light as default', async () => {
                mockHelpers.setLocalStorageData({});
                
                const theme = await Storage.getTheme();
                
                expect(theme).toBe('light');
            });

            it('should set theme', async () => {
                await Storage.setTheme('light');

                const data = mockHelpers.getLocalStorageData();
                expect(data.theme).toBe('light');
            });
        });

        describe('getStoredTheme()', () => {
            it('should return the stored theme', async () => {
                mockHelpers.setLocalStorageData({ theme: 'dark' });

                expect(await Storage.getStoredTheme()).toBe('dark');
            });

            it('should return undefined when theme is not set (inherit from system)', async () => {
                mockHelpers.setLocalStorageData({});

                expect(await Storage.getStoredTheme()).toBeUndefined();
            });
        });

        describe('getLanguage() / setLanguage()', () => {
            it('should get language', async () => {
                mockHelpers.setLocalStorageData({ language: 'ru' });
                
                const lang = await Storage.getLanguage();
                
                expect(lang).toBe('ru');
            });

            it('should return undefined if not set', async () => {
                mockHelpers.setLocalStorageData({});
                
                const lang = await Storage.getLanguage();
                
                expect(lang).toBeUndefined();
            });

            it('should set language', async () => {
                await Storage.setLanguage('de');
                
                const data = mockHelpers.getLocalStorageData();
                expect(data.language).toBe('de');
            });
        });
    });

    describe('Sync management', () => {
        describe('getSyncEnabled()', () => {
            it('should return syncEnabled value', async () => {
                mockHelpers.setLocalStorageData({ syncEnabled: true });
                
                const enabled = await Storage.getSyncEnabled();
                
                expect(enabled).toBe(true);
            });

            it('should return false by default (opt-in)', async () => {
                mockHelpers.setLocalStorageData({});

                const enabled = await Storage.getSyncEnabled();

                expect(enabled).toBe(false);
            });
        });

        describe('setSyncEnabled()', () => {
            it('should enable sync and migrate data', async () => {
                mockHelpers.setLocalStorageData({
                    presets: [{ id: 'test', name: 'Test', domains: ['test.com'], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }],
                    proxies: [{ id: 'proxy1', type: 'http', host: '127.0.0.1', port: 8080, isDefault: true, createdAt: 0, updatedAt: 0 }],
                });

                await Storage.setSyncEnabled(true);
                
                // migrateToSync вызывает chrome.storage.sync.set
                expect(chrome.storage.sync.set).toHaveBeenCalled();
                // Также должен установиться флаг syncEnabled в local storage
                expect(chrome.storage.local.set).toHaveBeenCalledWith(
                    { syncEnabled: true }
                );
            });

            it('should disable sync and migrate data back', async () => {
                // Сначала включаем синхронизацию
                mockHelpers.setLocalStorageData({ syncEnabled: true });
                await Storage.init();
                
                mockHelpers.setSyncStorageData({
                    presets: [{ id: 'test', name: 'Test', domains: ['synced.com'], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }],
                });

                await Storage.setSyncEnabled(false);
                
                expect(chrome.storage.sync.get).toHaveBeenCalled();
            });
        });
    });

    describe('onChange()', () => {
        it('should add listener for storage changes', () => {
            const callback = jest.fn();
            
            Storage.onChange(callback);
            
            // onChange создаёт внутренний listener-обёртку
            expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
        });

        it('should return unsubscribe function', () => {
            const callback = jest.fn();
            
            const unsubscribe = Storage.onChange(callback);
            unsubscribe();
            
            expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
        });
    });

    describe('Sync mode operations', () => {
        const testPreset = { id: 'test', name: 'Test', domains: ['synced.com'], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 };
        
        beforeEach(async () => {
            // Включаем режим синхронизации и отключаем миграцию
            mockHelpers.setLocalStorageData({ syncEnabled: true, migrationCompleted: true });
            await Storage.init();
        });

        describe('get() with sync enabled', () => {
            // ВАЖНО: В текущей архитектуре get() всегда читает из local storage
            // Это кэш, который обновляется при init() из sync и при изменениях в sync
            it('should always read from local storage (cache) even for sync keys', async () => {
                // Устанавливаем данные в local (кэш)
                mockHelpers.setLocalStorageData({
                    syncEnabled: true,
                    migrationCompleted: true,
                    presets: [testPreset]
                });
                
                const presets = await Storage.get('presets');
                
                expect(presets).toEqual([testPreset]);
                // Читаем из local, а не из sync
                expect(chrome.storage.local.get).toHaveBeenCalledWith('presets', expect.any(Function));
            });

            it('should get local key from local storage', async () => {
                mockHelpers.setLocalStorageData({
                    syncEnabled: true,
                    migrationCompleted: true,
                    currentState: 'connected'
                });
                
                const state = await Storage.get('currentState');
                
                expect(state).toBe('connected');
                expect(chrome.storage.local.get).toHaveBeenCalledWith('currentState', expect.any(Function));
            });
        });

        describe('set() with sync enabled', () => {
            // Push в облако выполняет background (SyncService.registerLocalToCloudSync),
            // а не Storage.set: debounce-таймер, заведённый в попапе, умирал вместе
            // с ним при закрытии, и запись в облако терялась
            it('should write sync key to local immediately without direct cloud write', async () => {
                jest.useFakeTimers();

                const newPresets = [{ ...testPreset, domains: ['new.com'] }];

                // Await the set call to ensure the Promise completes
                await Storage.set('presets', newPresets);

                // Local storage должен быть вызван сразу
                expect(chrome.storage.local.set).toHaveBeenCalledWith(
                    { presets: newPresets },
                    expect.any(Function)
                );

                // Прокручиваем таймеры — прямой записи в sync быть не должно
                await jest.runAllTimersAsync();

                expect(chrome.storage.sync.set).not.toHaveBeenCalled();

                jest.useRealTimers();
            });

            it('should set local key directly without debounce', async () => {
                await Storage.set('currentState', 'connecting');
                
                expect(chrome.storage.local.set).toHaveBeenCalledWith(
                    { currentState: 'connecting' },
                    expect.any(Function)
                );
            });

            it('should apply rapid writes to local with last value winning', async () => {
                // Несколько быстрых записей
                await Promise.all([
                    Storage.set('presets', [{ ...testPreset, domains: ['first.com'] }]),
                    Storage.set('presets', [{ ...testPreset, domains: ['second.com'] }]),
                    Storage.set('presets', [{ ...testPreset, domains: ['third.com'] }]),
                ]);

                // В local остаётся последнее значение; облако Storage.set не трогает
                expect(mockHelpers.getLocalStorageData().presets).toEqual(
                    [{ ...testPreset, domains: ['third.com'] }]
                );
                expect(chrome.storage.sync.set).not.toHaveBeenCalled();
            });
        });

        describe('getMultiple() with sync enabled', () => {
            // В текущей архитектуре getMultiple() всегда читает из local
            it('should read all keys from local storage (cache)', async () => {
                mockHelpers.setLocalStorageData({
                    syncEnabled: true,
                    migrationCompleted: true,
                    presets: [testPreset],
                    theme: 'light',
                    currentState: 'connected',
                    targetState: 'connected',
                });
                
                const result = await Storage.getMultiple(['presets', 'currentState', 'theme']);
                
                expect(result.presets).toEqual([testPreset]);
                expect(result.currentState).toBe('connected');
                expect(result.theme).toBe('light');
                
                // Только local storage
                expect(chrome.storage.local.get).toHaveBeenCalled();
            });

            it('should handle empty sync keys array', async () => {
                mockHelpers.setLocalStorageData({
                    syncEnabled: true,
                    migrationCompleted: true,
                    currentState: 'connected',
                });
                
                const result = await Storage.getMultiple(['currentState', 'targetState']);
                
                expect(result.currentState).toBe('connected');
            });

            it('should handle only sync keys array', async () => {
                mockHelpers.setLocalStorageData({
                    syncEnabled: true,
                    migrationCompleted: true,
                    presets: [testPreset],
                });
                
                const result = await Storage.getMultiple(['presets', 'theme']);
                
                expect(result.presets).toEqual([testPreset]);
            });
        });
    });

    describe('Storage area selection', () => {
        it('should write sync keys to local (cloud push is done by background)', async () => {
            // presets, proxies, theme, language - это sync ключи; их push в облако
            // выполняет background через SyncService.registerLocalToCloudSync
            mockHelpers.setLocalStorageData({ syncEnabled: true, migrationCompleted: true });
            await Storage.init();

            await Storage.set('theme', 'light');

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { theme: 'light' },
                expect.any(Function)
            );
            expect(chrome.storage.sync.set).not.toHaveBeenCalled();
        });

        it('should identify local keys correctly', async () => {
            // currentState, targetState - это local ключи
            mockHelpers.setLocalStorageData({ syncEnabled: true, migrationCompleted: true });
            await Storage.init();
            
            await Storage.set('targetState', 'connected');
            
            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { targetState: 'connected' },
                expect.any(Function)
            );
        });
    });

    describe('init() with sync enabled', () => {
        it('should notify subscribers on sync storage changes', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: true, migrationCompleted: true });
            await Storage.init();
            
            // Проверяем, что слушатель изменений добавлен
            expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
        });
    });

    describe('Export/Import functionality', () => {
        const samplePreset = {
            id: 'preset-1',
            name: 'Test Preset',
            domains: ['example.com', 'test.org'],
            enabled: true,
            isDefault: false,
            order: 0,
            proxyId: 'proxy-1',
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
        };

        const sampleProxy = {
            id: 'proxy-1',
            type: 'http' as const,
            host: '192.168.1.1',
            port: 8080,
            isDefault: true,
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
        };

        describe('exportAllData()', () => {
            beforeEach(async () => {
                mockHelpers.setLocalStorageData({ migrationCompleted: true });
                await Storage.init();
            });

            it('should export all data in correct format', async () => {
                mockHelpers.setLocalStorageData({
                    migrationCompleted: true,
                    presets: [samplePreset],
                    proxies: [sampleProxy],
                    theme: 'dark',
                    language: 'ru',
                    proxyByDefault: false,
                });

                const exportData = await Storage.exportAllData();

                expect(exportData.version).toBe(1);
                expect(exportData.exportedAt).toBeDefined();
                expect(exportData.extensionVersion).toBeDefined();
                expect(exportData.data.presets).toEqual([samplePreset]);
                expect(exportData.data.proxies).toEqual([sampleProxy]);
                expect(exportData.data.theme).toBe('dark');
                expect(exportData.data.language).toBe('ru');
                expect(exportData.data.proxyByDefault).toBe(false);
            });

            it('should export with default values when data is empty', async () => {
                mockHelpers.setLocalStorageData({ migrationCompleted: true });

                const exportData = await Storage.exportAllData();

                expect(exportData.version).toBe(1);
                expect(exportData.data.theme).toBe('light');
                expect(exportData.data.language).toBe('en');
                expect(exportData.data.proxyByDefault).toBe(true);
            });

            it('should include valid ISO timestamp', async () => {
                const exportData = await Storage.exportAllData();

                const timestamp = new Date(exportData.exportedAt);
                expect(timestamp.toISOString()).toBe(exportData.exportedAt);
            });
        });

        describe('validateImportData()', () => {
            beforeEach(async () => {
                mockHelpers.setLocalStorageData({ migrationCompleted: true });
                await Storage.init();
            });

            it('should validate correct export data', () => {
                const validData = {
                    version: 1,
                    exportedAt: '2026-01-24T00:00:00Z',
                    extensionVersion: '1.0.0',
                    data: {
                        presets: [samplePreset],
                        proxies: [sampleProxy],
                        theme: 'dark',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(validData));

                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
                expect(result.data).toEqual(validData);
            });

            it('should reject invalid JSON', () => {
                const result = Storage.validateImportData('not valid json {');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidJson');
            });

            it('should reject non-object data', () => {
                const result = Storage.validateImportData('"just a string"');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidStructure');
            });

            it('should reject missing version', () => {
                const dataWithoutVersion = {
                    data: {
                        presets: [],
                        proxies: [],
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(dataWithoutVersion));

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('missingVersion');
            });

            it('should warn about newer version', () => {
                const futureVersionData = {
                    version: 999,
                    data: {
                        presets: [samplePreset],
                        proxies: [sampleProxy],
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(futureVersionData));

                expect(result.warnings).toContain('newerVersion');
            });

            it('should reject missing data object', () => {
                const dataWithoutInner = {
                    version: 1,
                };

                const result = Storage.validateImportData(JSON.stringify(dataWithoutInner));

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('missingData');
            });

            it('should reject invalid presets array', () => {
                const invalidPresets = {
                    version: 1,
                    data: {
                        presets: 'not an array',
                        proxies: [],
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(invalidPresets));

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidPresets');
            });

            it('should reject invalid preset structure', () => {
                const invalidPresetStructure = {
                    version: 1,
                    data: {
                        presets: [{ id: 'test' }], // missing required fields
                        proxies: [],
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(invalidPresetStructure));

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidPresetStructure');
            });

            it('should reject invalid proxies array', () => {
                const invalidProxies = {
                    version: 1,
                    data: {
                        presets: [],
                        proxies: 'not an array',
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(invalidProxies));

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidProxies');
            });

            it('should reject invalid proxy structure', () => {
                const invalidProxyStructure = {
                    version: 1,
                    data: {
                        presets: [],
                        proxies: [{ id: 'test', type: 'invalid_type', host: 'test', port: 80, isDefault: true }],
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(invalidProxyStructure));

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidProxyStructure');
            });
        });

        describe('importAllData()', () => {
            beforeEach(async () => {
                mockHelpers.setLocalStorageData({ migrationCompleted: true });
                await Storage.init();
            });

            it('should use replace mode by default', async () => {
                const importData = {
                    version: 1,
                    exportedAt: '2026-01-24T00:00:00Z',
                    extensionVersion: '1.0.0',
                    data: {
                        presets: [samplePreset],
                        proxies: [sampleProxy],
                        theme: 'dark' as const,
                        language: 'ru' as const,
                        proxyByDefault: false,
                    },
                };

                await Storage.importAllData(importData);

                const data = mockHelpers.getLocalStorageData();
                expect(data.presets).toEqual([samplePreset]);
                expect(data.proxies).toEqual([sampleProxy]);
            });

            it('should import data in replace mode', async () => {
                const importData = {
                    version: 1,
                    exportedAt: '2026-01-24T00:00:00Z',
                    extensionVersion: '1.0.0',
                    data: {
                        presets: [samplePreset],
                        proxies: [sampleProxy],
                        theme: 'dark' as const,
                        language: 'ru' as const,
                        proxyByDefault: false,
                    },
                };

                await Storage.importAllData(importData, 'replace');

                const data = mockHelpers.getLocalStorageData();
                expect(data.presets).toEqual([samplePreset]);
                expect(data.proxies).toEqual([sampleProxy]);
                expect(data.theme).toBe('dark');
                expect(data.language).toBe('ru');
                expect(data.proxyByDefault).toBe(false);
            });

            it('should import data in merge mode (add new items only)', async () => {
                const existingPreset = { ...samplePreset, id: 'existing-preset', name: 'Existing' };
                const existingProxy = { ...sampleProxy, id: 'existing-proxy', host: '10.0.0.1' };
                
                mockHelpers.setLocalStorageData({
                    migrationCompleted: true,
                    presets: [existingPreset],
                    proxies: [existingProxy],
                });

                const importData = {
                    version: 1,
                    exportedAt: '2026-01-24T00:00:00Z',
                    extensionVersion: '1.0.0',
                    data: {
                        presets: [samplePreset], // Different ID from existing
                        proxies: [sampleProxy],  // Different ID from existing
                        theme: 'dark' as const,
                        language: 'de' as const,
                        proxyByDefault: false,
                    },
                };

                await Storage.importAllData(importData, 'merge');

                const data = mockHelpers.getLocalStorageData();
                // Должны быть и старые, и новые элементы
                expect(data.presets).toHaveLength(2);
                expect(data.proxies).toHaveLength(2);
            });

            it('should not duplicate items in merge mode with same IDs', async () => {
                mockHelpers.setLocalStorageData({
                    migrationCompleted: true,
                    presets: [samplePreset],
                    proxies: [sampleProxy],
                });

                const importData = {
                    version: 1,
                    exportedAt: '2026-01-24T00:00:00Z',
                    extensionVersion: '1.0.0',
                    data: {
                        presets: [samplePreset], // Same ID
                        proxies: [sampleProxy],  // Same ID
                        theme: 'dark' as const,
                        language: 'de' as const,
                        proxyByDefault: false,
                    },
                };

                await Storage.importAllData(importData, 'merge');

                const data = mockHelpers.getLocalStorageData();
                // Не должно быть дубликатов
                expect(data.presets).toHaveLength(1);
                expect(data.proxies).toHaveLength(1);
            });
        });
    });

    describe('Migration from legacy data', () => {
        beforeEach(async () => {
            mockHelpers.resetAllMocks();
            jest.resetModules();
            const storageModule = await import('../../src/shared/storage');
            Storage = storageModule.Storage;
        });

        describe('migrateFromLegacyDomains()', () => {
            it('should migrate domains from sync storage', async () => {
                mockHelpers.setLocalStorageData({});
                mockHelpers.setSyncStorageData({ domains: ['example.com', 'test.org'] });

                await Storage.init();

                const data = mockHelpers.getLocalStorageData();
                expect(data.presets).toBeDefined();
                expect(data.presets[0].domains).toContain('example.com');
                expect(data.presets[0].domains).toContain('test.org');
                expect(data.migrationCompleted).toBe(true);
            });

            it('should migrate domains from local storage if sync is empty', async () => {
                mockHelpers.setLocalStorageData({ domains: ['local-domain.com'] });
                mockHelpers.setSyncStorageData({});

                await Storage.init();

                const data = mockHelpers.getLocalStorageData();
                expect(data.presets).toBeDefined();
                expect(data.presets[0].domains).toContain('local-domain.com');
            });

            it('should create default preset with empty domains if no legacy data', async () => {
                mockHelpers.setLocalStorageData({});
                mockHelpers.setSyncStorageData({});

                await Storage.init();

                const data = mockHelpers.getLocalStorageData();
                expect(data.presets).toBeDefined();
                expect(data.presets[0].id).toBe('default-custom-preset');
                expect(data.presets[0].name).toBe('Ignore List');
                expect(data.presets[0].isDefault).toBe(true);
            });

            it('should remove legacy domains from storage after migration', async () => {
                mockHelpers.setLocalStorageData({ domains: ['old.com'] });
                mockHelpers.setSyncStorageData({ domains: ['sync-old.com'] });

                await Storage.init();

                const removeCalls = (chrome.storage.local.remove as jest.Mock).mock.calls;
                const removeArgs = removeCalls.map((call: unknown[]) => call[0]).flat();
                expect(removeArgs).toContain('domains');
                expect(chrome.storage.sync.remove).toHaveBeenCalled();
            });

            it('should skip migration if already completed', async () => {
                mockHelpers.setLocalStorageData({
                    migrationCompleted: true,
                    presets: [{ id: 'existing', name: 'Existing', domains: [], enabled: true, isDefault: true, order: 0, createdAt: 0, updatedAt: 0 }]
                });

                await Storage.init();

                // remove не должен вызываться для domains
                const removeCalls = (chrome.storage.local.remove as jest.Mock).mock.calls;
                const domainsRemoved = removeCalls.some((call: string[]) => call.includes('domains'));
                expect(domainsRemoved).toBe(false);
            });
        });

        describe('migrateFromLegacyProxy()', () => {
            it('should migrate selfProxy from sync storage', async () => {
                mockHelpers.setLocalStorageData({});
                mockHelpers.setSyncStorageData({ selfProxy: '192.168.1.100:8080' });

                await Storage.init();

                const data = mockHelpers.getLocalStorageData();
                expect(data.proxies).toBeDefined();
                expect(data.proxies[0].host).toBe('192.168.1.100');
                expect(data.proxies[0].port).toBe(8080);
                expect(data.proxies[0].type).toBe('http');
                expect(data.proxies[0].isDefault).toBe(true);
            });

            it('should migrate selfProxy from local storage if sync is empty', async () => {
                mockHelpers.setLocalStorageData({ selfProxy: '10.0.0.1:3128' });
                mockHelpers.setSyncStorageData({});

                await Storage.init();

                const data = mockHelpers.getLocalStorageData();
                expect(data.proxies).toBeDefined();
                expect(data.proxies[0].host).toBe('10.0.0.1');
                expect(data.proxies[0].port).toBe(3128);
            });

            it('should skip proxy migration for invalid format', async () => {
                mockHelpers.setLocalStorageData({});
                mockHelpers.setSyncStorageData({ selfProxy: 'invalid-format' });

                await Storage.init();

                const data = mockHelpers.getLocalStorageData();
                expect(data.proxies).toBeUndefined();
            });

            it('should skip proxy migration for non-string selfProxy', async () => {
                mockHelpers.setLocalStorageData({});
                mockHelpers.setSyncStorageData({ selfProxy: 12345 });

                await Storage.init();

                const data = mockHelpers.getLocalStorageData();
                expect(data.proxies).toBeUndefined();
            });

            it('should remove legacy selfProxy from storage after migration', async () => {
                mockHelpers.setLocalStorageData({});
                mockHelpers.setSyncStorageData({ selfProxy: '127.0.0.1:8888' });

                await Storage.init();

                const removeCalls = (chrome.storage.local.remove as jest.Mock).mock.calls;
                const removeArgs = removeCalls.map((call: unknown[]) => call[0]).flat();
                expect(removeArgs).toContain('domains');
                expect(removeArgs).toContain('selfProxy');
                expect(chrome.storage.sync.remove).toHaveBeenCalled();
            });

            it('should handle port parsing with NaN', async () => {
                mockHelpers.setLocalStorageData({});
                mockHelpers.setSyncStorageData({ selfProxy: 'host:notanumber' });

                await Storage.init();

                const data = mockHelpers.getLocalStorageData();
                expect(data.proxies).toBeUndefined();
            });
        });
    });

    describe('Validation edge cases', () => {
        beforeEach(async () => {
            mockHelpers.setLocalStorageData({ migrationCompleted: true });
            await Storage.init();
        });

        describe('validateImportData() additional cases', () => {
            it('should reject array data', () => {
                const result = Storage.validateImportData('[]');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('missingData');
            });

            it('should reject null data', () => {
                const result = Storage.validateImportData('null');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidStructure');
            });

            it('should handle preset with missing fields', () => {
                const dataWithBadPreset = {
                    version: 1,
                    data: {
                        presets: [{ name: 'Test' }], // missing id, domains, enabled, isDefault, order
                        proxies: [],
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(dataWithBadPreset));

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidPresetStructure');
            });

            it('should handle proxy with missing required fields', () => {
                const dataWithBadProxy = {
                    version: 1,
                    data: {
                        presets: [],
                        proxies: [{ id: 'test', host: 'localhost' }], // missing type, port, isDefault
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(dataWithBadProxy));

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidProxyStructure');
            });

            it('should handle preset as null', () => {
                const dataWithNullPreset = {
                    version: 1,
                    data: {
                        presets: [null],
                        proxies: [],
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(dataWithNullPreset));

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidPresetStructure');
            });

            it('should handle proxy as null', () => {
                const dataWithNullProxy = {
                    version: 1,
                    data: {
                        presets: [],
                        proxies: [null],
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(dataWithNullProxy));

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('invalidProxyStructure');
            });

            it('should validate empty presets and proxies arrays', () => {
                const emptyData = {
                    version: 1,
                    exportedAt: '2026-01-24T00:00:00Z',
                    extensionVersion: '1.0.0',
                    data: {
                        presets: [],
                        proxies: [],
                        theme: 'light',
                        language: 'en',
                        proxyByDefault: true,
                    },
                };

                const result = Storage.validateImportData(JSON.stringify(emptyData));

                expect(result.valid).toBe(true);
                expect(result.errors).toHaveLength(0);
            });
        });
    });

    describe('remove()', () => {
        it('should remove keys from local storage', async () => {
            mockHelpers.setLocalStorageData({ key1: 'value1', key2: 'value2' });

            await Storage.remove(['key1']);

            expect(chrome.storage.local.remove).toHaveBeenCalledWith(['key1'], expect.any(Function));
        });
    });

    describe('checkSyncQuota()', () => {
        it('should delegate to SyncService', async () => {
            await expect(Storage.checkSyncQuota('presets', [])).resolves.not.toThrow();
        });
    });

    describe('getSyncBytesInUse()', () => {
        it('should return bytes in use', async () => {
            const result = await Storage.getSyncBytesInUse();
            expect(typeof result).toBe('number');
        });
    });

    describe('subscribe()', () => {
        it('should add subscriber and return unsubscribe function', () => {
            const callback = jest.fn();
            const unsubscribe = Storage.subscribe(callback);

            expect(typeof unsubscribe).toBe('function');
        });

        it('should remove subscriber on unsubscribe', () => {
            const callback = jest.fn();
            const unsubscribe = Storage.subscribe(callback);
            unsubscribe();

            // No error expected
            expect(true).toBe(true);
        });
    });

    describe('Proxy CRUD delegation', () => {
        it('should update proxy via repository', async () => {
            const proxy = { name: 'Test', type: 'http' as const, host: '1.2.3.4', port: 8080, isDefault: false };
            const added = await Storage.addProxy(proxy);
            expect(added).toBeDefined();
            expect(added.id).toBeDefined();

            await Storage.updateProxy(added.id, { name: 'Updated' });
            const updated = await Storage.getProxy(added.id);
            expect(updated?.name).toBe('Updated');
        });

        it('should delete proxy via repository', async () => {
            const proxy = { name: 'ToDelete', type: 'http' as const, host: '1.2.3.4', port: 8080, isDefault: false };
            const added = await Storage.addProxy(proxy);

            await Storage.deleteProxy(added.id);
            const result = await Storage.getProxy(added.id);
            expect(result).toBeUndefined();
        });

        it('should set default proxy via repository', async () => {
            const proxy = { name: 'Default', type: 'http' as const, host: '1.2.3.4', port: 8080, isDefault: false };
            const added = await Storage.addProxy(proxy);

            await Storage.setDefaultProxy(added.id);
            const defaultProxy = await Storage.getDefaultProxy();
            expect(defaultProxy?.id).toBe(added.id);
        });
    });

    describe('Preset additional methods', () => {
        it('should get single preset by id', async () => {
            const preset = { name: 'Test', domains: ['test.com'], enabled: true, isDefault: false, order: 0, proxyId: null };
            const added = await Storage.addPreset(preset);

            const found = await Storage.getPreset(added.id);
            expect(found?.name).toBe('Test');
        });

        it('should get active presets', async () => {
            await Storage.addPreset({ name: 'Active', domains: ['a.com'], enabled: true, isDefault: false, order: 0, proxyId: null });
            await Storage.addPreset({ name: 'Inactive', domains: ['b.com'], enabled: false, isDefault: false, order: 1, proxyId: null });

            const active = await Storage.getActivePresets();
            expect(active.every(p => p.enabled)).toBe(true);
        });

        it('should get all active domains', async () => {
            await Storage.addPreset({ name: 'P1', domains: ['a.com', 'b.com'], enabled: true, isDefault: false, order: 0, proxyId: null });

            const domains = await Storage.getAllActiveDomains();
            expect(domains).toContain('a.com');
            expect(domains).toContain('b.com');
        });
    });

    describe('ProxyCheckEnabled', () => {
        it('should get proxy check enabled state', async () => {
            mockHelpers.setLocalStorageData({ proxyCheckEnabled: false });
            const result = await Storage.getProxyCheckEnabled();
            expect(result).toBe(false);
        });

        it('should default to true when not set', async () => {
            mockHelpers.setLocalStorageData({});
            const result = await Storage.getProxyCheckEnabled();
            expect(result).toBe(true);
        });

        it('should set proxy check enabled', async () => {
            await Storage.setProxyCheckEnabled(false);
            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({ proxyCheckEnabled: false }),
                expect.any(Function)
            );
        });
    });

    describe('PublicProxiesWarningDismissed', () => {
        it('should get dismissed state', async () => {
            mockHelpers.setLocalStorageData({ publicProxiesWarningDismissed: true });
            const result = await Storage.getPublicProxiesWarningDismissed();
            expect(result).toBe(true);
        });

        it('should default to false when not set', async () => {
            mockHelpers.setLocalStorageData({});
            const result = await Storage.getPublicProxiesWarningDismissed();
            expect(result).toBe(false);
        });

        it('should set dismissed state', async () => {
            await Storage.setPublicProxiesWarningDismissed(true);
            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({ publicProxiesWarningDismissed: true }),
                expect.any(Function)
            );
        });
    });

    describe('PublicProxiesFiltersCollapsed', () => {
        it('should get collapsed state', async () => {
            mockHelpers.setLocalStorageData({ publicProxiesFiltersCollapsed: true });
            const result = await Storage.getPublicProxiesFiltersCollapsed();
            expect(result).toBe(true);
        });

        it('should default to false when not set', async () => {
            mockHelpers.setLocalStorageData({});
            const result = await Storage.getPublicProxiesFiltersCollapsed();
            expect(result).toBe(false);
        });

        it('should set collapsed state', async () => {
            await Storage.setPublicProxiesFiltersCollapsed(true);
            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({ publicProxiesFiltersCollapsed: true }),
                expect.any(Function)
            );
        });
    });

    describe('PublicProxyCheckResults', () => {
        it('should return empty object when cache not set', async () => {
            mockHelpers.setLocalStorageData({});
            const result = await Storage.getPublicProxyCheckResults();
            expect(result).toEqual({});
        });

        it('should return fresh entries and prune expired ones (24h TTL)', async () => {
            const now = Date.now();
            mockHelpers.setLocalStorageData({
                publicProxyCheckResults: {
                    'http://1.1.1.1:80': { status: 'alive', checkedAt: now - 1000 },
                    'http://2.2.2.2:80': { status: 'dead', checkedAt: now - 25 * 60 * 60 * 1000 },
                },
            });

            const result = await Storage.getPublicProxyCheckResults();

            expect(result['http://1.1.1.1:80']).toEqual({ status: 'alive', checkedAt: now - 1000 });
            expect(result['http://2.2.2.2:80']).toBeUndefined();
        });

        it('should merge new results over existing cache', async () => {
            const now = Date.now();
            mockHelpers.setLocalStorageData({
                publicProxyCheckResults: {
                    'http://1.1.1.1:80': { status: 'alive', checkedAt: now - 1000 },
                },
            });

            await Storage.mergePublicProxyCheckResults({
                'http://2.2.2.2:80': { status: 'dead', checkedAt: now },
            });

            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    publicProxyCheckResults: expect.objectContaining({
                        'http://1.1.1.1:80': expect.objectContaining({ status: 'alive' }),
                        'http://2.2.2.2:80': expect.objectContaining({ status: 'dead' }),
                    }),
                }),
                expect.any(Function)
            );
        });
    });
});