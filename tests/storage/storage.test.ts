import { mockHelpers } from '../setup';

// Mock SyncService before importing StorageService
const mockSyncService = {
    init: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockResolvedValue(false),
    wasInitialized: jest.fn().mockReturnValue(true),
    setEnabled: jest.fn().mockResolvedValue(undefined),
    syncFromCloud: jest.fn().mockResolvedValue(undefined),
    isSyncKey: jest.fn().mockReturnValue(false),
    setWithDebounce: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../src/storage/sync-service', () => ({
    SyncService: mockSyncService,
}));

import { StorageService } from '../../src/storage/storage';
import { StorageKeys, ProxyState } from '../../src/shared/constants';

// Mock dependencies
function createMockStorageBackend() {
    return {
        get: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockResolvedValue(undefined),
        getMultiple: jest.fn().mockResolvedValue({}),
        remove: jest.fn().mockResolvedValue(undefined),
        checkSyncQuota: jest.fn().mockResolvedValue(undefined),
        getSyncBytesInUse: jest.fn().mockResolvedValue(0),
    };
}

function createMockPresetRepository() {
    return {
        getAll: jest.fn().mockResolvedValue([]),
        setAll: jest.fn().mockResolvedValue(undefined),
        getById: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        add: jest.fn().mockResolvedValue({ id: 'new-preset' }),
        setEnabled: jest.fn().mockResolvedValue(undefined),
        setProxy: jest.fn().mockResolvedValue(undefined),
        reorder: jest.fn().mockResolvedValue(undefined),
        getActive: jest.fn().mockResolvedValue([]),
        getAllActiveDomains: jest.fn().mockResolvedValue([]),
    };
}

function createMockProxyRepository() {
    return {
        getAll: jest.fn().mockResolvedValue([]),
        setAll: jest.fn().mockResolvedValue(undefined),
        getById: jest.fn().mockResolvedValue(undefined),
        getDefault: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        add: jest.fn().mockResolvedValue({ id: 'new-proxy' }),
        setDefault: jest.fn().mockResolvedValue(undefined),
    };
}

function createMockMigrationService() {
    return {
        migrateFromLegacyDomains: jest.fn().mockResolvedValue(undefined),
        migrateToSync: jest.fn().mockResolvedValue(undefined),
        migrateToLocal: jest.fn().mockResolvedValue(undefined),
    };
}

function createMockImportExportService() {
    return {
        exportAll: jest.fn().mockResolvedValue({ version: 1, data: {} }),
        validateImportData: jest.fn().mockReturnValue({ valid: true }),
        importAll: jest.fn().mockResolvedValue(undefined),
    };
}

describe('storage.ts - StorageService', () => {
    let service: StorageService;
    let mockBackend: ReturnType<typeof createMockStorageBackend>;
    let mockPresets: ReturnType<typeof createMockPresetRepository>;
    let mockProxies: ReturnType<typeof createMockProxyRepository>;
    let mockMigration: ReturnType<typeof createMockMigrationService>;
    let mockImportExport: ReturnType<typeof createMockImportExportService>;

    beforeEach(() => {
        mockHelpers.resetAllMocks();
        jest.clearAllMocks();

        mockBackend = createMockStorageBackend();
        mockPresets = createMockPresetRepository();
        mockProxies = createMockProxyRepository();
        mockMigration = createMockMigrationService();
        mockImportExport = createMockImportExportService();

        // Reset SyncService mocks to defaults
        mockSyncService.init.mockResolvedValue(undefined);
        mockSyncService.isEnabled.mockResolvedValue(false);
        mockSyncService.wasInitialized.mockReturnValue(true);
        mockSyncService.setEnabled.mockResolvedValue(undefined);
        mockSyncService.syncFromCloud.mockResolvedValue(undefined);
        mockSyncService.isSyncKey.mockReturnValue(false);
        mockSyncService.setWithDebounce.mockResolvedValue(undefined);

        service = new StorageService(
            mockBackend as any,
            mockPresets as any,
            mockProxies as any,
            mockMigration as any,
            mockImportExport as any,
        );
    });

    // ── init() ─────────────────────────────────────────────────────────
    describe('init()', () => {
        it('should call SyncService.init()', async () => {
            await service.init();
            expect(mockSyncService.init).toHaveBeenCalled();
        });

        it('should call syncFromCloud when sync is enabled', async () => {
            mockSyncService.isEnabled.mockResolvedValue(true);
            await service.init();
            expect(mockSyncService.syncFromCloud).toHaveBeenCalled();
        });

        it('should NOT call syncFromCloud when sync is disabled', async () => {
            mockSyncService.isEnabled.mockResolvedValue(false);
            await service.init();
            expect(mockSyncService.syncFromCloud).not.toHaveBeenCalled();
        });

        it('should run migration if migrationCompleted is falsy', async () => {
            mockBackend.get.mockResolvedValue(undefined);
            await service.init();
            expect(mockMigration.migrateFromLegacyDomains).toHaveBeenCalled();
        });

        it('should skip migration if migrationCompleted is truthy', async () => {
            mockBackend.get.mockResolvedValue(true);
            await service.init();
            expect(mockMigration.migrateFromLegacyDomains).not.toHaveBeenCalled();
        });
    });

    // ── get / set / getMultiple / remove ───────────────────────────────
    describe('get()', () => {
        it('should delegate to storageBackend.get', async () => {
            mockBackend.get.mockResolvedValue('value');
            const result = await service.get('theme');
            expect(mockBackend.get).toHaveBeenCalledWith('theme');
            expect(result).toBe('value');
        });
    });

    describe('set()', () => {
        it('should delegate to storageBackend.set when sync disabled', async () => {
            await service.set('theme', 'dark');
            expect(mockBackend.set).toHaveBeenCalledWith('theme', 'dark');
        });
    });

    describe('getMultiple()', () => {
        it('should delegate to storageBackend.getMultiple', async () => {
            mockBackend.getMultiple.mockResolvedValue({ theme: 'dark' });
            const result = await service.getMultiple(['theme']);
            expect(mockBackend.getMultiple).toHaveBeenCalledWith(['theme']);
            expect(result).toEqual({ theme: 'dark' });
        });
    });

    describe('remove()', () => {
        it('should delegate to storageBackend.remove', async () => {
            await service.remove(['theme']);
            expect(mockBackend.remove).toHaveBeenCalledWith(['theme']);
        });
    });

    describe('checkSyncQuota()', () => {
        it('should delegate to storageBackend.checkSyncQuota', async () => {
            await service.checkSyncQuota('key', 'value');
            expect(mockBackend.checkSyncQuota).toHaveBeenCalledWith('key', 'value');
        });
    });

    describe('getSyncBytesInUse()', () => {
        it('should delegate to storageBackend.getSyncBytesInUse', async () => {
            mockBackend.getSyncBytesInUse.mockResolvedValue(42);
            const result = await service.getSyncBytesInUse();
            expect(result).toBe(42);
        });
    });

    // ── setTyped ───────────────────────────────────────────────────────
    // setTyped всегда пишет только в local: debounce-push в облако выполняет
    // background через SyncService.registerLocalToCloudSync — таймер, заведённый
    // в контексте попапа, умирает вместе с ним и запись терялась
    describe('setTyped()', () => {
        it('should write sync key to local backend even when sync enabled', async () => {
            mockSyncService.isEnabled.mockResolvedValue(true);
            mockSyncService.isSyncKey.mockReturnValue(true);

            await service.setTyped('theme' as any, 'dark' as any);

            expect(mockBackend.set).toHaveBeenCalledWith('theme', 'dark');
            expect(mockSyncService.setWithDebounce).not.toHaveBeenCalled();
        });

        it('should use storageBackend.set when sync enabled but key is NOT sync key', async () => {
            mockSyncService.isEnabled.mockResolvedValue(true);
            mockSyncService.isSyncKey.mockReturnValue(false);

            await service.setTyped('currentState' as any, 'connected' as any);

            expect(mockBackend.set).toHaveBeenCalledWith('currentState', 'connected');
            expect(mockSyncService.setWithDebounce).not.toHaveBeenCalled();
        });

        it('should use storageBackend.set when sync disabled', async () => {
            mockSyncService.isEnabled.mockResolvedValue(false);

            await service.setTyped('theme' as any, 'dark' as any);

            expect(mockBackend.set).toHaveBeenCalledWith('theme', 'dark');
        });
    });

    // ── setSyncEnabled ────────────────────────────────────────────────
    describe('setSyncEnabled()', () => {
        it('should call migrateToSync when enabling sync', async () => {
            mockSyncService.wasInitialized.mockReturnValue(true);
            mockSyncService.isEnabled.mockResolvedValue(false);

            await service.setSyncEnabled(true);

            expect(mockMigration.migrateToSync).toHaveBeenCalled();
            expect(mockSyncService.setEnabled).toHaveBeenCalledWith(true);
        });

        it('should call migrateToLocal when disabling sync', async () => {
            mockSyncService.wasInitialized.mockReturnValue(true);
            mockSyncService.isEnabled.mockResolvedValue(true);

            await service.setSyncEnabled(false);

            expect(mockMigration.migrateToLocal).toHaveBeenCalled();
            expect(mockSyncService.setEnabled).toHaveBeenCalledWith(false);
        });

        it('should not migrate when enabling and already enabled', async () => {
            mockSyncService.wasInitialized.mockReturnValue(true);
            mockSyncService.isEnabled.mockResolvedValue(true);

            await service.setSyncEnabled(true);

            expect(mockMigration.migrateToSync).not.toHaveBeenCalled();
            expect(mockMigration.migrateToLocal).not.toHaveBeenCalled();
        });

        it('should not migrate when disabling and already disabled', async () => {
            mockSyncService.wasInitialized.mockReturnValue(true);
            mockSyncService.isEnabled.mockResolvedValue(false);

            await service.setSyncEnabled(false);

            expect(mockMigration.migrateToSync).not.toHaveBeenCalled();
            expect(mockMigration.migrateToLocal).not.toHaveBeenCalled();
        });

        it('should treat wasInitialized=false as currentEnabled=false', async () => {
            mockSyncService.wasInitialized.mockReturnValue(false);

            await service.setSyncEnabled(true);

            expect(mockMigration.migrateToSync).toHaveBeenCalled();
            expect(mockSyncService.setEnabled).toHaveBeenCalledWith(true);
        });
    });

    // ── subscribe ─────────────────────────────────────────────────────
    describe('subscribe()', () => {
        it('should add a subscriber and return unsubscribe function', () => {
            const callback = jest.fn();
            const unsubscribe = service.subscribe(callback);
            expect(typeof unsubscribe).toBe('function');
        });

        it('should remove subscriber when unsubscribe is called', () => {
            const callback = jest.fn();
            const unsubscribe = service.subscribe(callback);
            // Calling unsubscribe should not throw
            unsubscribe();
            // Calling again should be safe (index will be -1)
            unsubscribe();
        });
    });

    // ── onChange ───────────────────────────────────────────────────────
    describe('onChange()', () => {
        it('should add a chrome storage listener', () => {
            const callback = jest.fn();
            service.onChange(callback);
            expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
        });

        it('should remove the listener when returned function is called', () => {
            const callback = jest.fn();
            const removeListener = service.onChange(callback);
            removeListener();
            expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
        });
    });

    // ── Preset delegation ─────────────────────────────────────────────
    describe('preset methods', () => {
        it('getPresets delegates to presetRepository.getAll', async () => {
            await service.getPresets();
            expect(mockPresets.getAll).toHaveBeenCalled();
        });

        it('setPresets delegates to presetRepository.setAll', async () => {
            const presets = [{ id: '1' }] as any;
            await service.setPresets(presets);
            expect(mockPresets.setAll).toHaveBeenCalledWith(presets);
        });

        it('getPreset delegates to presetRepository.getById', async () => {
            await service.getPreset('id1');
            expect(mockPresets.getById).toHaveBeenCalledWith('id1');
        });

        it('updatePreset delegates to presetRepository.update', async () => {
            await service.updatePreset('id1', { enabled: true } as any);
            expect(mockPresets.update).toHaveBeenCalledWith('id1', { enabled: true });
        });

        it('deletePreset delegates to presetRepository.delete', async () => {
            await service.deletePreset('id1');
            expect(mockPresets.delete).toHaveBeenCalledWith('id1');
        });

        it('addPreset delegates to presetRepository.add', async () => {
            const data = { name: 'test' } as any;
            await service.addPreset(data);
            expect(mockPresets.add).toHaveBeenCalledWith(data);
        });

        it('setPresetEnabled delegates to presetRepository.setEnabled', async () => {
            await service.setPresetEnabled('id1', true);
            expect(mockPresets.setEnabled).toHaveBeenCalledWith('id1', true);
        });

        it('setPresetProxy delegates to presetRepository.setProxy', async () => {
            await service.setPresetProxy('id1', 'proxy1');
            expect(mockPresets.setProxy).toHaveBeenCalledWith('id1', 'proxy1');
        });

        it('reorderPresets delegates to presetRepository.reorder', async () => {
            await service.reorderPresets(['a', 'b']);
            expect(mockPresets.reorder).toHaveBeenCalledWith(['a', 'b']);
        });

        it('getActivePresets delegates to presetRepository.getActive', async () => {
            await service.getActivePresets();
            expect(mockPresets.getActive).toHaveBeenCalled();
        });

        it('getAllActiveDomains delegates to presetRepository.getAllActiveDomains', async () => {
            await service.getAllActiveDomains();
            expect(mockPresets.getAllActiveDomains).toHaveBeenCalled();
        });
    });

    // ── Proxy delegation ──────────────────────────────────────────────
    describe('proxy methods', () => {
        it('getProxies delegates to proxyRepository.getAll', async () => {
            await service.getProxies();
            expect(mockProxies.getAll).toHaveBeenCalled();
        });

        it('setProxies delegates to proxyRepository.setAll', async () => {
            const proxies = [{ id: '1' }] as any;
            await service.setProxies(proxies);
            expect(mockProxies.setAll).toHaveBeenCalledWith(proxies);
        });

        it('getProxy delegates to proxyRepository.getById', async () => {
            await service.getProxy('id1');
            expect(mockProxies.getById).toHaveBeenCalledWith('id1');
        });

        it('getDefaultProxy delegates to proxyRepository.getDefault', async () => {
            await service.getDefaultProxy();
            expect(mockProxies.getDefault).toHaveBeenCalled();
        });

        it('updateProxy delegates to proxyRepository.update', async () => {
            await service.updateProxy('id1', { host: '1.2.3.4' } as any);
            expect(mockProxies.update).toHaveBeenCalledWith('id1', { host: '1.2.3.4' });
        });

        it('deleteProxy delegates to proxyRepository.delete', async () => {
            await service.deleteProxy('id1');
            expect(mockProxies.delete).toHaveBeenCalledWith('id1');
        });

        it('addProxy delegates to proxyRepository.add', async () => {
            const data = { host: '1.2.3.4' } as any;
            await service.addProxy(data);
            expect(mockProxies.add).toHaveBeenCalledWith(data);
        });

        it('setDefaultProxy delegates to proxyRepository.setDefault', async () => {
            await service.setDefaultProxy('id1');
            expect(mockProxies.setDefault).toHaveBeenCalledWith('id1');
        });
    });

    // ── State methods ─────────────────────────────────────────────────
    describe('state methods', () => {
        it('getTargetState returns stored state', async () => {
            mockBackend.get.mockResolvedValue('connected');
            const state = await service.getTargetState();
            expect(state).toBe('connected');
        });

        it('getTargetState returns DISCONNECTED as default', async () => {
            mockBackend.get.mockResolvedValue(undefined);
            const state = await service.getTargetState();
            expect(state).toBe(ProxyState.DISCONNECTED);
        });

        it('setTargetState delegates to setTyped', async () => {
            await service.setTargetState('connected' as any);
            expect(mockBackend.set).toHaveBeenCalledWith(StorageKeys.TARGET_STATE, 'connected');
        });

        it('getCurrentState returns stored state', async () => {
            mockBackend.get.mockResolvedValue('connecting');
            const state = await service.getCurrentState();
            expect(state).toBe('connecting');
        });

        it('getCurrentState returns DISCONNECTED as default', async () => {
            mockBackend.get.mockResolvedValue(undefined);
            const state = await service.getCurrentState();
            expect(state).toBe(ProxyState.DISCONNECTED);
        });

        it('setCurrentState delegates to setTyped', async () => {
            await service.setCurrentState('error' as any);
            expect(mockBackend.set).toHaveBeenCalledWith(StorageKeys.CURRENT_STATE, 'error');
        });
    });

    // ── Settings methods ──────────────────────────────────────────────
    describe('settings methods', () => {
        it('getTheme returns stored theme', async () => {
            mockBackend.get.mockResolvedValue('dark');
            expect(await service.getTheme()).toBe('dark');
        });

        it('getTheme returns "light" as default', async () => {
            mockBackend.get.mockResolvedValue(undefined);
            expect(await service.getTheme()).toBe('light');
        });

        it('setTheme delegates to setTyped', async () => {
            await service.setTheme('dark');
            expect(mockBackend.set).toHaveBeenCalledWith(StorageKeys.THEME, 'dark');
        });

        it('getLanguage delegates to getTyped', async () => {
            mockBackend.get.mockResolvedValue('ru');
            expect(await service.getLanguage()).toBe('ru');
        });

        it('setLanguage delegates to setTyped', async () => {
            await service.setLanguage('ru');
            expect(mockBackend.set).toHaveBeenCalledWith(StorageKeys.LANGUAGE, 'ru');
        });

        it('getProxyByDefault returns stored value', async () => {
            mockBackend.get.mockResolvedValue(false);
            expect(await service.getProxyByDefault()).toBe(false);
        });

        it('getProxyByDefault returns true as default', async () => {
            mockBackend.get.mockResolvedValue(undefined);
            expect(await service.getProxyByDefault()).toBe(true);
        });

        it('setProxyByDefault delegates to setTyped', async () => {
            await service.setProxyByDefault(false);
            expect(mockBackend.set).toHaveBeenCalledWith(StorageKeys.PROXY_BY_DEFAULT, false);
        });

        it('getProxyCheckEnabled returns stored value', async () => {
            mockBackend.get.mockResolvedValue(false);
            expect(await service.getProxyCheckEnabled()).toBe(false);
        });

        it('getProxyCheckEnabled returns true as default', async () => {
            mockBackend.get.mockResolvedValue(undefined);
            expect(await service.getProxyCheckEnabled()).toBe(true);
        });

        it('setProxyCheckEnabled delegates to setTyped', async () => {
            await service.setProxyCheckEnabled(false);
            expect(mockBackend.set).toHaveBeenCalledWith(StorageKeys.PROXY_CHECK_ENABLED, false);
        });

        it('getPublicProxiesWarningDismissed returns stored value', async () => {
            mockBackend.get.mockResolvedValue(true);
            expect(await service.getPublicProxiesWarningDismissed()).toBe(true);
        });

        it('getPublicProxiesWarningDismissed returns false as default', async () => {
            mockBackend.get.mockResolvedValue(undefined);
            expect(await service.getPublicProxiesWarningDismissed()).toBe(false);
        });

        it('setPublicProxiesWarningDismissed delegates to setTyped', async () => {
            await service.setPublicProxiesWarningDismissed(true);
            expect(mockBackend.set).toHaveBeenCalledWith(StorageKeys.PUBLIC_PROXIES_WARNING_DISMISSED, true);
        });

        it('getPublicProxiesFiltersCollapsed returns stored value', async () => {
            mockBackend.get.mockResolvedValue(true);
            expect(await service.getPublicProxiesFiltersCollapsed()).toBe(true);
        });

        it('getPublicProxiesFiltersCollapsed returns false as default', async () => {
            mockBackend.get.mockResolvedValue(undefined);
            expect(await service.getPublicProxiesFiltersCollapsed()).toBe(false);
        });

        it('setPublicProxiesFiltersCollapsed delegates to setTyped', async () => {
            await service.setPublicProxiesFiltersCollapsed(true);
            expect(mockBackend.set).toHaveBeenCalledWith(StorageKeys.PUBLIC_PROXIES_FILTERS_COLLAPSED, true);
        });
    });

    // ── getSyncEnabled ────────────────────────────────────────────────
    describe('getSyncEnabled()', () => {
        it('should delegate to SyncService.isEnabled', async () => {
            mockSyncService.isEnabled.mockResolvedValue(true);
            const result = await service.getSyncEnabled();
            expect(result).toBe(true);
        });
    });

    // ── Import/Export ─────────────────────────────────────────────────
    describe('import/export methods', () => {
        it('exportAllData delegates to importExportService.exportAll', async () => {
            const exportData = { version: 1, data: {} };
            mockImportExport.exportAll.mockResolvedValue(exportData);
            const result = await service.exportAllData();
            expect(mockImportExport.exportAll).toHaveBeenCalled();
            expect(result).toEqual(exportData);
        });

        it('validateImportData delegates to importExportService.validateImportData', () => {
            const jsonString = '{"version":1}';
            mockImportExport.validateImportData.mockReturnValue({ valid: true });
            const result = service.validateImportData(jsonString);
            expect(mockImportExport.validateImportData).toHaveBeenCalledWith(jsonString);
            expect(result).toEqual({ valid: true });
        });

        it('importAllData delegates to importExportService.importAll', async () => {
            const data = { version: 1, data: {} } as any;
            await service.importAllData(data, 'merge');
            expect(mockImportExport.importAll).toHaveBeenCalledWith(data, 'merge');
        });

        it('importAllData defaults to replace mode', async () => {
            const data = { version: 1, data: {} } as any;
            await service.importAllData(data);
            expect(mockImportExport.importAll).toHaveBeenCalledWith(data, 'replace');
        });
    });
});
