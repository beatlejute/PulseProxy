import { StorageData, StorageKey, ProxyStateType, ThemeType, SupportedLanguage, StorageChanges, SyncStorageKey, Preset, ProxyServer, ExportData, ImportValidationResult } from '../types';
import { IStorageBackend, ISettingsRepository } from '../types/storage';
import { StorageKeys, ProxyState, SYNC_STORAGE_KEYS, DEFAULT_PRESET_ID } from './constants';
import { PresetRepository, ChromeStorageBackend, StorageBackend } from '../storage/preset-repository';
import { MigrationService } from '../storage/migration-service';
import { ProxyRepository } from '../storage/proxy-repository';
import { SyncService } from '../storage/sync-service';
import { ImportExportService } from '../storage/import-export-service';

type StorageChangeCallback = (changes: StorageChanges, area: string) => void;

// Debounce delay для sync storage (мс)
const SYNC_DEBOUNCE_DELAY = 1000;

class StorageService implements IStorageBackend, ISettingsRepository {
    private subscribers: StorageChangeCallback[] = [];
    private presetRepository: PresetRepository;
    private proxyRepository: ProxyRepository;
    private migrationService: MigrationService;
    private importExportService: ImportExportService;

    constructor() {
        this.presetRepository = new PresetRepository(this);
        this.proxyRepository = new ProxyRepository(this);
        this.migrationService = new MigrationService(this, this.presetRepository);
        this.importExportService = new ImportExportService(this, this.presetRepository, this.proxyRepository, this);
    }

    // ============================================================================
    // IStorageBackend реализация (для PresetRepository)
    // Методы работают напрямую с chrome.storage.local без debounce логики
    // ============================================================================

    async get<K extends string>(key: K): Promise<unknown> {
        return this.getTyped(key as StorageKey);
    }

    async set<K extends string>(key: K, value: unknown): Promise<void> {
        return this.setTyped(key as StorageKey, value as StorageData[StorageKey]);
    }

    async getMultiple<K extends string>(keys: K[]): Promise<Record<K, unknown>> {
        return this.getMultipleTyped(keys as StorageKey[]) as Promise<Record<K, unknown>>;
    }

    async remove(keys: string[]): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, resolve);
        });
    }

    async checkSyncQuota(key: string, value: unknown): Promise<void> {
        return SyncService.checkSyncQuota(key, value);
    }

    async getSyncBytesInUse(): Promise<number> {
        return SyncService.getSyncBytesInUse();
    }

    // ============================================================================
    // StorageService методы (с debounce и типизацией)
    // ============================================================================

    // Инициализация сервиса
    async init(): Promise<void> {
        // Инициализируем SyncService
        await SyncService.init();

        // Если sync включён, подтягиваем данные из sync в local (для кэширования)
        if (await SyncService.isEnabled()) {
            await SyncService.syncFromCloud();
        }

        // Проверка и выполнение миграции
        const migrationResult = await chrome.storage.local.get('migrationCompleted');
        if (!migrationResult.migrationCompleted) {
            await this.migrationService.migrateFromLegacyDomains();
        }
    }

    // Подтянуть данные из sync storage в local storage
    private async syncFromCloud(): Promise<void> {
        const syncKeys = SYNC_STORAGE_KEYS.filter(k => k !== 'syncEnabled');
        const syncData = await new Promise<Record<string, unknown>>((resolve) => {
            chrome.storage.sync.get([...syncKeys], (result) => resolve(result));
        });
        
        // Записываем в local только те ключи, которые есть в sync
        if (Object.keys(syncData).length > 0) {
            await new Promise<void>((resolve) => {
                chrome.storage.local.set(syncData, resolve);
            });
            console.log('Storage: Synced from cloud:', Object.keys(syncData));
        }
    }

    // Получить значение по ключу (типизированная версия для StorageService)
    // Всегда читаем из local storage, т.к. туда пишем сразу (sync идёт с debounce)
    async getTyped<K extends StorageKey>(key: K): Promise<StorageData[K] | undefined> {
        return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => {
                resolve(result[key] as StorageData[K] | undefined);
            });
        });
    }

    // Установить значение (типизированная версия для StorageService)
    async setTyped<K extends StorageKey>(key: K, value: StorageData[K]): Promise<void> {
        // Используем debounce для sync storage через SyncService
        if (await SyncService.isEnabled() && SyncService.isSyncKey(key)) {
            return SyncService.setWithDebounce(key as SyncStorageKey, value as StorageData[SyncStorageKey]);
        }

        // Для local storage - записываем сразу
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });
    }

    // Получить несколько значений (типизированная версия для StorageService)
    // Всегда читаем из local storage
    async getMultipleTyped<K extends StorageKey>(keys: K[]): Promise<Partial<StorageData>> {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (result) => {
                resolve(result as Partial<StorageData>);
            });
        });
    }



    // Управление синхронизацией
    async getSyncEnabled(): Promise<boolean> {
        return SyncService.isEnabled();
    }

    async setSyncEnabled(enabled: boolean): Promise<void> {
        const currentEnabled = await SyncService.wasInitialized() 
            ? await SyncService.isEnabled()
            : false;
        
        if (enabled && !currentEnabled) {
            // Включаем синхронизацию - мигрируем данные в sync
            await this.migrationService.migrateToSync();
        } else if (!enabled && currentEnabled) {
            // Отключаем синхронизацию - мигрируем данные в local
            await this.migrationService.migrateToLocal();
        }

        await SyncService.setEnabled(enabled);
    }

    // Уведомление подписчиков об изменениях
    private notifySubscribers(changes: StorageChanges): void {
        this.subscribers.forEach(callback => callback(changes, 'sync'));
    }

    // === Методы для работы с пресетами (делегирование к PresetRepository) ===

    async getPresets(): Promise<Preset[]> {
        return this.presetRepository.getAll();
    }

    async setPresets(presets: Preset[]): Promise<void> {
        return this.presetRepository.setAll(presets);
    }

    async getPreset(id: string): Promise<Preset | undefined> {
        return this.presetRepository.getById(id);
    }

    async updatePreset(id: string, updates: Partial<Preset>): Promise<void> {
        return this.presetRepository.update(id, updates);
    }

    async deletePreset(id: string): Promise<void> {
        return this.presetRepository.delete(id);
    }

    async addPreset(presetData: Omit<Preset, 'id' | 'createdAt' | 'updatedAt'>): Promise<Preset> {
        return this.presetRepository.add(presetData);
    }

    async setPresetEnabled(id: string, enabled: boolean): Promise<void> {
        return this.presetRepository.setEnabled(id, enabled);
    }

    async setPresetProxy(id: string, proxyId: string | null): Promise<void> {
        return this.presetRepository.setProxy(id, proxyId);
    }

    async reorderPresets(orderedIds: string[]): Promise<void> {
        return this.presetRepository.reorder(orderedIds);
    }

    async getActivePresets(): Promise<Preset[]> {
        return this.presetRepository.getActive();
    }

    async getAllActiveDomains(): Promise<string[]> {
        return this.presetRepository.getAllActiveDomains();
    }

    // === Методы для работы с прокси серверами (делегирование к ProxyRepository) ===

    // Получить все прокси
    async getProxies(): Promise<ProxyServer[]> {
        return this.proxyRepository.getAll();
    }

    // Установить все прокси
    async setProxies(proxies: ProxyServer[]): Promise<void> {
        return this.proxyRepository.setAll(proxies);
    }

    // Получить прокси по ID
    async getProxy(id: string): Promise<ProxyServer | undefined> {
        return this.proxyRepository.getById(id);
    }

    // Получить дефолтный прокси
    async getDefaultProxy(): Promise<ProxyServer | undefined> {
        return this.proxyRepository.getDefault();
    }

    // Обновить прокси
    async updateProxy(id: string, updates: Partial<ProxyServer>): Promise<void> {
        return this.proxyRepository.update(id, updates);
    }

    // Удалить прокси
    async deleteProxy(id: string): Promise<void> {
        return this.proxyRepository.delete(id);
    }

    // Добавить прокси (с автоматическим генерированием ID и timestamps)
    async addProxy(proxyData: Omit<ProxyServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProxyServer> {
        return this.proxyRepository.add(proxyData);
    }

    // Установить дефолтный прокси
    async setDefaultProxy(id: string): Promise<void> {
        return this.proxyRepository.setDefault(id);
    }

    // === Состояние прокси ===

    async getTargetState(): Promise<ProxyStateType> {
        const state = await this.getTyped(StorageKeys.TARGET_STATE as StorageKey) as ProxyStateType | undefined;
        return state || ProxyState.DISCONNECTED;
    }

    async setTargetState(state: ProxyStateType): Promise<void> {
        return this.setTyped(StorageKeys.TARGET_STATE as StorageKey, state);
    }

    async getCurrentState(): Promise<ProxyStateType> {
        const state = await this.getTyped(StorageKeys.CURRENT_STATE as StorageKey) as ProxyStateType | undefined;
        return state || ProxyState.DISCONNECTED;
    }

    async setCurrentState(state: ProxyStateType): Promise<void> {
        return this.setTyped(StorageKeys.CURRENT_STATE as StorageKey, state);
    }

    // === Настройки ===

    async getTheme(): Promise<ThemeType> {
        const theme = await this.getTyped(StorageKeys.THEME as StorageKey) as ThemeType | undefined;
        return theme || 'light';
    }

    async setTheme(theme: ThemeType): Promise<void> {
        return this.setTyped(StorageKeys.THEME as StorageKey, theme);
    }

    async getLanguage(): Promise<SupportedLanguage | undefined> {
        return this.getTyped(StorageKeys.LANGUAGE as StorageKey) as Promise<SupportedLanguage | undefined>;
    }

    async setLanguage(lang: SupportedLanguage): Promise<void> {
        return this.setTyped(StorageKeys.LANGUAGE as StorageKey, lang);
    }

    // === Настройка проксирования по умолчанию ===

    async getProxyByDefault(): Promise<boolean> {
        const value = await this.getTyped(StorageKeys.PROXY_BY_DEFAULT as StorageKey) as boolean | undefined;
        return value ?? true; // По умолчанию true - все сайты проксируются
    }

    async setProxyByDefault(enabled: boolean): Promise<void> {
        return this.setTyped(StorageKeys.PROXY_BY_DEFAULT as StorageKey, enabled);
    }

    // === Настройка проверки прокси перед добавлением ===

    async getProxyCheckEnabled(): Promise<boolean> {
        const value = await this.getTyped(StorageKeys.PROXY_CHECK_ENABLED as StorageKey) as boolean | undefined;
        return value ?? true; // По умолчанию true - проверяем прокси
    }

    async setProxyCheckEnabled(enabled: boolean): Promise<void> {
        return this.setTyped(StorageKeys.PROXY_CHECK_ENABLED as StorageKey, enabled);
    }

    // === Подписки на изменения ===

    subscribe(callback: StorageChangeCallback): () => void {
        this.subscribers.push(callback);
        return () => {
            const index = this.subscribers.indexOf(callback);
            if (index > -1) {
                this.subscribers.splice(index, 1);
            }
        };
    }

    // Алиас для subscribe для совместимости
    onChange(callback: StorageChangeCallback): () => void {
        // Подписка на chrome.storage.onChanged напрямую
        const listener = (changes: StorageChanges, areaName: string) => {
            callback(changes, areaName);
        };
        chrome.storage.onChanged.addListener(listener);
        return () => {
            chrome.storage.onChanged.removeListener(listener);
        };
    }

    // === Импорт/Экспорт (делегирование к ImportExportService) ===

    async exportAllData(): Promise<ExportData> {
        return this.importExportService.exportAll();
    }

    validateImportData(jsonString: string): ImportValidationResult {
        return this.importExportService.validateImportData(jsonString);
    }

    async importAllData(
        exportData: ExportData,
        mode: 'replace' | 'merge' = 'replace'
    ): Promise<void> {
        return this.importExportService.importAll(exportData, mode);
    }
}

export const Storage = new StorageService();