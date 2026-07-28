import { mockHelpers } from '../setup';

let SyncService: typeof import('../../src/storage/sync-service').SyncService;

describe('sync-service.ts - SyncService', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        const module = await import('../../src/storage/sync-service');
        SyncService = module.SyncService;
    });

    describe('init()', () => {
        it('should initialize with syncEnabled from storage', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: true });
            
            await SyncService.init();
            
            expect(chrome.storage.local.get).toHaveBeenCalledWith('syncEnabled');
        });

        it('should default to syncEnabled = false if not set (opt-in)', async () => {
            mockHelpers.setLocalStorageData({});

            await SyncService.init();

            const syncEnabled = await SyncService.isEnabled();
            expect(syncEnabled).toBe(false);
            // Флаг явно записан как false, чтобы поведение было детерминированным
            expect(mockHelpers.getLocalStorageData().syncEnabled).toBe(false);
        });

        it('should subscribe to storage changes when enabled', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: true });
            
            await SyncService.init();
            
            expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
        });
    });

    describe('isEnabled()', () => {
        it('should return syncEnabled value from storage', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: true });
            
            const enabled = await SyncService.isEnabled();
            
            expect(enabled).toBe(true);
        });

        it('should return false by default (opt-in)', async () => {
            mockHelpers.setLocalStorageData({});

            const enabled = await SyncService.isEnabled();

            expect(enabled).toBe(false);
        });
    });

    describe('setEnabled()', () => {
        it('should set syncEnabled in local storage', async () => {
            await SyncService.setEnabled(true);
            
            const localData = mockHelpers.getLocalStorageData();
            expect(localData.syncEnabled).toBe(true);
        });

        it('should update internal state', async () => {
            await SyncService.setEnabled(false);
            
            const enabled = await SyncService.isEnabled();
            expect(enabled).toBe(false);
        });
    });

    describe('syncFromCloud()', () => {
        it('should get data from sync storage', async () => {
            mockHelpers.setSyncStorageData({ 
                presets: [{ id: 'test', name: 'Test', domains: [], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }],
                theme: 'dark'
            });
            
            await SyncService.syncFromCloud();
            
            expect(chrome.storage.sync.get).toHaveBeenCalled();
        });

        it('should write synced data to local storage', async () => {
            const syncData = { 
                presets: [{ id: 'test', name: 'Test', domains: [], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }],
                theme: 'dark'
            };
            mockHelpers.setSyncStorageData(syncData);
            
            await SyncService.syncFromCloud();
            
            const localData = mockHelpers.getLocalStorageData();
            expect(localData.presets).toEqual(syncData.presets);
            expect(localData.theme).toBe('dark');
        });

        it('should not write syncEnabled key to local', async () => {
            mockHelpers.setSyncStorageData({ 
                syncEnabled: false,
                theme: 'light'
            });
            
            await SyncService.syncFromCloud();
            
            const localData = mockHelpers.getLocalStorageData();
            expect(localData.syncEnabled).toBeUndefined();
            expect(localData.theme).toBe('light');
        });

        it('should handle empty sync storage', async () => {
            mockHelpers.setSyncStorageData({});
            
            await SyncService.syncFromCloud();
            
            expect(chrome.storage.local.set).not.toHaveBeenCalled();
        });
    });

    describe('handleSyncChanges()', () => {
        it('should update local storage with changes from sync', () => {
            const changes = {
                presets: {
                    oldValue: undefined,
                    newValue: [{ id: 'new', name: 'New', domains: [], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }]
                },
                theme: {
                    oldValue: 'light',
                    newValue: 'dark'
                }
            } as Record<string, chrome.storage.StorageChange>;
            
            SyncService.handleSyncChanges(changes);
            
            const localData = mockHelpers.getLocalStorageData();
            expect(localData.presets).toEqual(changes.presets.newValue);
            expect(localData.theme).toBe('dark');
        });

        it('should ignore changes with undefined newValue', () => {
            const changes = {
                presets: {
                    oldValue: [],
                    newValue: undefined
                }
            } as Record<string, chrome.storage.StorageChange>;
            
            SyncService.handleSyncChanges(changes);
            
            expect(chrome.storage.local.set).not.toHaveBeenCalled();
        });
    });

    describe('checkSyncQuota()', () => {
        it('should throw if item is too large', async () => {
            const largeValue = { data: 'x'.repeat(9000) };
            
            await expect(SyncService.checkSyncQuota('test', largeValue)).rejects.toThrow('Sync storage item too large');
        });

        it('should throw if quota exceeded', async () => {
            (chrome.storage.sync.getBytesInUse as jest.Mock).mockImplementation(() => Promise.resolve(102400));
            
            await expect(SyncService.checkSyncQuota('test', { data: 'test' })).rejects.toThrow('Sync storage quota exceeded');
        });

        it('should not throw if within quota', async () => {
            (chrome.storage.sync.getBytesInUse as jest.Mock).mockImplementation(() => Promise.resolve(0));
            
            await expect(SyncService.checkSyncQuota('test', { data: 'test' })).resolves.not.toThrow();
        });
    });

    describe('getSyncBytesInUse()', () => {
        it('should return bytes in use from sync storage', async () => {
            (chrome.storage.sync.getBytesInUse as jest.Mock).mockImplementation(() => Promise.resolve(5000));
            
            const bytes = await SyncService.getSyncBytesInUse();
            
            expect(bytes).toBe(5000);
        });
    });

    describe('isSyncKey()', () => {
        it('should return true for sync keys', () => {
            expect(SyncService.isSyncKey('presets')).toBe(true);
            expect(SyncService.isSyncKey('proxies')).toBe(true);
            expect(SyncService.isSyncKey('theme')).toBe(true);
            expect(SyncService.isSyncKey('language')).toBe(true);
            expect(SyncService.isSyncKey('proxyByDefault')).toBe(true);
        });

        it('should return false for local keys', () => {
            expect(SyncService.isSyncKey('currentState')).toBe(false);
            expect(SyncService.isSyncKey('targetState')).toBe(false);
        });
    });

    // Push local→cloud должен жить в background: debounce-таймер, заведённый в
    // попапе, умирает при его закрытии, и запись в облако теряется — при следующем
    // открытии syncFromCloud() перетирает local устаревшим значением из облака
    describe('registerLocalToCloudSync()', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should push local change of a sync key to cloud after debounce', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: true });
            SyncService.registerLocalToCloudSync();

            mockHelpers.triggerStorageChange(
                { proxyByDefault: { oldValue: false, newValue: true } },
                'local'
            );
            await jest.runAllTimersAsync();

            expect(mockHelpers.getSyncStorageData().proxyByDefault).toBe(true);
        });

        it('should not push when sync is disabled', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: false });
            SyncService.registerLocalToCloudSync();

            mockHelpers.triggerStorageChange(
                { proxyByDefault: { oldValue: false, newValue: true } },
                'local'
            );
            await jest.runAllTimersAsync();

            expect(chrome.storage.sync.set).not.toHaveBeenCalled();
        });

        it('should ignore non-sync keys and the syncEnabled key itself', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: true });
            SyncService.registerLocalToCloudSync();

            mockHelpers.triggerStorageChange(
                {
                    currentState: { oldValue: 'disconnected', newValue: 'connected' },
                    syncEnabled: { oldValue: false, newValue: true },
                },
                'local'
            );
            await jest.runAllTimersAsync();

            expect(chrome.storage.sync.set).not.toHaveBeenCalled();
        });

        it('should ignore changes in sync area (handled by handleSyncChanges)', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: true });
            SyncService.registerLocalToCloudSync();

            mockHelpers.triggerStorageChange(
                { proxyByDefault: { oldValue: false, newValue: true } },
                'sync'
            );
            await jest.runAllTimersAsync();

            expect(chrome.storage.sync.set).not.toHaveBeenCalled();
        });

        it('should skip push when cloud already holds the same value (echo guard)', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: true });
            mockHelpers.setSyncStorageData({ proxyByDefault: true });
            SyncService.registerLocalToCloudSync();

            mockHelpers.triggerStorageChange(
                { proxyByDefault: { oldValue: false, newValue: true } },
                'local'
            );
            await jest.runAllTimersAsync();

            expect(chrome.storage.sync.set).not.toHaveBeenCalled();
        });

        it('should debounce rapid changes and push only the last value', async () => {
            mockHelpers.setLocalStorageData({ syncEnabled: true });
            SyncService.registerLocalToCloudSync();

            mockHelpers.triggerStorageChange({ theme: { newValue: 'dark' } }, 'local');
            mockHelpers.triggerStorageChange({ theme: { newValue: 'light' } }, 'local');
            await jest.runAllTimersAsync();

            expect(mockHelpers.getSyncStorageData().theme).toBe('light');
            const themeCalls = (chrome.storage.sync.set as jest.Mock).mock.calls
                .filter(call => 'theme' in call[0]);
            expect(themeCalls).toHaveLength(1);
        });
    });

    describe('debounced sync writes', () => {
        it('should write to local immediately and to sync with debounce', async () => {
            jest.useFakeTimers();
            
            const newPresets = [{ id: 'test', name: 'Test', domains: [], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }];
            const setPromise = SyncService.setWithDebounce('presets', newPresets);
            
            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                { presets: newPresets },
                expect.any(Function)
            );
            
            await jest.runAllTimersAsync();
            await setPromise;
            
            expect(chrome.storage.sync.set).toHaveBeenCalledWith(
                { presets: newPresets },
                expect.any(Function)
            );
            
            jest.useRealTimers();
        });

        it('should debounce multiple rapid writes and use last value', async () => {
            jest.useFakeTimers();
            
            const presets1 = [{ id: 'p1', name: 'P1', domains: [], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }];
            const presets2 = [{ id: 'p2', name: 'P2', domains: [], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }];
            const presets3 = [{ id: 'p3', name: 'P3', domains: [], enabled: true, isDefault: false, order: 0, createdAt: 0, updatedAt: 0 }];
            
            const promises = [
                SyncService.setWithDebounce('presets', presets1),
                SyncService.setWithDebounce('presets', presets2),
                SyncService.setWithDebounce('presets', presets3),
            ];
            
            await jest.runAllTimersAsync();
            await Promise.all(promises);
            
            const syncSetCalls = (chrome.storage.sync.set as jest.Mock).mock.calls;
            const lastCall = syncSetCalls[syncSetCalls.length - 1];
            expect(lastCall[0]).toEqual({ presets: presets3 });
            
            jest.useRealTimers();
        });
    });
});
