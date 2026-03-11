import { StorageData, StorageKey, ProxyStateType, ThemeType, SupportedLanguage, StorageChanges, SyncStorageKey, Preset, ProxyServer, ExportData, ImportValidationResult } from '../types';
import { IStorageBackend, ISettingsRepository, IPresetRepository, IProxyRepository, IMigrationService, IImportExportService } from '../types/storage';
import { StorageKeys, ProxyState } from '../shared/constants';
import { StorageBackend, PresetRepository } from './preset-repository';
import { ProxyRepository } from './proxy-repository';
import { MigrationService } from './migration-service';
import { ImportExportService } from './import-export-service';
import { SyncService } from './sync-service';

type StorageChangeCallback = (changes: StorageChanges, area: string) => void;

export class StorageService implements IStorageBackend, ISettingsRepository {
    private subscribers: StorageChangeCallback[] = [];
    constructor(
        private readonly storageBackend: IStorageBackend = StorageBackend,
        private readonly presetRepository: IPresetRepository = new PresetRepository(storageBackend),
        private readonly proxyRepository: IProxyRepository = new ProxyRepository(storageBackend),
        private readonly migrationService: IMigrationService = new MigrationService(storageBackend, new PresetRepository(storageBackend)),
        private readonly importExportService: IImportExportService = new ImportExportService(storageBackend, new PresetRepository(storageBackend), new ProxyRepository(storageBackend), {} as ISettingsRepository)
    ) {}

    async init(): Promise<void> {
        await (SyncService as any).init();
        if (await (SyncService as any).isEnabled()) {
            await (SyncService as any).syncFromCloud();
        }
        const migrationResult = await this.storageBackend.get('migrationCompleted');
        if (!migrationResult) {
            await this.migrationService.migrateFromLegacyDomains();
        }
    }

    async get<K extends string>(key: K): Promise<unknown> { return this.getTyped(key as StorageKey); }
    async set<K extends string>(key: K, value: unknown): Promise<void> { return this.setTyped(key as StorageKey, value as StorageData[StorageKey]); }
    async getMultiple<K extends string>(keys: K[]): Promise<Record<K, unknown>> { return this.getMultipleTyped(keys as StorageKey[]) as Promise<Record<K, unknown>>; }
    async remove(keys: string[]): Promise<void> { return this.storageBackend.remove(keys); }
    async checkSyncQuota(key: string, value: unknown): Promise<void> { return this.storageBackend.checkSyncQuota(key, value); }
    async getSyncBytesInUse(): Promise<number> { return this.storageBackend.getSyncBytesInUse(); }

    async getTyped<K extends StorageKey>(key: K): Promise<StorageData[K] | undefined> { return this.storageBackend.get(key) as Promise<StorageData[K] | undefined>; }

    async setTyped<K extends StorageKey>(key: K, value: StorageData[K]): Promise<void> {
        if (await (SyncService as any).isEnabled() && (SyncService as any).isSyncKey(key)) {
            return (SyncService as any).setWithDebounce(key as SyncStorageKey, value as StorageData[SyncStorageKey]);
        }
        return this.storageBackend.set(key, value);
    }

    async getMultipleTyped<K extends StorageKey>(keys: K[]): Promise<Partial<StorageData>> { return this.storageBackend.getMultiple(keys) as Promise<Partial<StorageData>>; }
    async getSyncEnabled(): Promise<boolean> { return (SyncService as any).isEnabled(); }

    async setSyncEnabled(enabled: boolean): Promise<void> {
        const currentEnabled = (SyncService as any).wasInitialized() ? await (SyncService as any).isEnabled() : false;
        if (enabled && !currentEnabled) { await this.migrationService.migrateToSync(); }
        else if (!enabled && currentEnabled) { await this.migrationService.migrateToLocal(); }
        await (SyncService as any).setEnabled(enabled);
    }

    subscribe(callback: StorageChangeCallback): () => void {
        this.subscribers.push(callback);
        return () => { const index = this.subscribers.indexOf(callback); if (index > -1) this.subscribers.splice(index, 1); };
    }

    onChange(callback: StorageChangeCallback): () => void {
        const listener = (changes: StorageChanges, areaName: string) => callback(changes, areaName);
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }

    async getPresets(): Promise<Preset[]> { return this.presetRepository.getAll(); }
    async setPresets(presets: Preset[]): Promise<void> { return this.presetRepository.setAll(presets); }
    async getPreset(id: string): Promise<Preset | undefined> { return this.presetRepository.getById(id); }
    async updatePreset(id: string, updates: Partial<Preset>): Promise<void> { return this.presetRepository.update(id, updates); }
    async deletePreset(id: string): Promise<void> { return this.presetRepository.delete(id); }
    async addPreset(presetData: Omit<Preset, 'id' | 'createdAt' | 'updatedAt'>): Promise<Preset> { return this.presetRepository.add(presetData); }
    async setPresetEnabled(id: string, enabled: boolean): Promise<void> { return this.presetRepository.setEnabled(id, enabled); }
    async setPresetProxy(id: string, proxyId: string | null): Promise<void> { return this.presetRepository.setProxy(id, proxyId); }
    async reorderPresets(orderedIds: string[]): Promise<void> { return this.presetRepository.reorder(orderedIds); }
    async getActivePresets(): Promise<Preset[]> { return this.presetRepository.getActive(); }
    async getAllActiveDomains(): Promise<string[]> { return this.presetRepository.getAllActiveDomains(); }

    async getProxies(): Promise<ProxyServer[]> { return this.proxyRepository.getAll(); }
    async setProxies(proxies: ProxyServer[]): Promise<void> { return this.proxyRepository.setAll(proxies); }
    async getProxy(id: string): Promise<ProxyServer | undefined> { return this.proxyRepository.getById(id); }
    async getDefaultProxy(): Promise<ProxyServer | undefined> { return this.proxyRepository.getDefault(); }
    async updateProxy(id: string, updates: Partial<ProxyServer>): Promise<void> { return this.proxyRepository.update(id, updates); }
    async deleteProxy(id: string): Promise<void> { return this.proxyRepository.delete(id); }
    async addProxy(proxyData: Omit<ProxyServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProxyServer> { return this.proxyRepository.add(proxyData); }
    async setDefaultProxy(id: string): Promise<void> { return this.proxyRepository.setDefault(id); }

    async getTargetState(): Promise<ProxyStateType> { const state = await this.getTyped(StorageKeys.TARGET_STATE as StorageKey) as ProxyStateType | undefined; return state || ProxyState.DISCONNECTED; }
    async setTargetState(state: ProxyStateType): Promise<void> { return this.setTyped(StorageKeys.TARGET_STATE as StorageKey, state); }
    async getCurrentState(): Promise<ProxyStateType> { const state = await this.getTyped(StorageKeys.CURRENT_STATE as StorageKey) as ProxyStateType | undefined; return state || ProxyState.DISCONNECTED; }
    async setCurrentState(state: ProxyStateType): Promise<void> { return this.setTyped(StorageKeys.CURRENT_STATE as StorageKey, state); }

    async getTheme(): Promise<ThemeType> { const theme = await this.getTyped(StorageKeys.THEME as StorageKey) as ThemeType | undefined; return theme || 'light'; }
    async setTheme(theme: ThemeType): Promise<void> { return this.setTyped(StorageKeys.THEME as StorageKey, theme); }
    async getLanguage(): Promise<SupportedLanguage | undefined> { return this.getTyped(StorageKeys.LANGUAGE as StorageKey) as Promise<SupportedLanguage | undefined>; }
    async setLanguage(lang: SupportedLanguage): Promise<void> { return this.setTyped(StorageKeys.LANGUAGE as StorageKey, lang); }
    async getProxyByDefault(): Promise<boolean> { const value = await this.getTyped(StorageKeys.PROXY_BY_DEFAULT as StorageKey) as boolean | undefined; return value ?? true; }
    async setProxyByDefault(enabled: boolean): Promise<void> { return this.setTyped(StorageKeys.PROXY_BY_DEFAULT as StorageKey, enabled); }

    async exportAllData(): Promise<ExportData> { return this.importExportService.exportAll(); }
    validateImportData(jsonString: string): ImportValidationResult { return this.importExportService.validateImportData(jsonString); }
    async importAllData(exportData: ExportData, mode: 'replace' | 'merge' = 'replace'): Promise<void> { return this.importExportService.importAll(exportData, mode); }
}

export const Storage = new StorageService();
