import { StorageData, StorageKey, ProxyStateType, ThemeType, SupportedLanguage, StorageChanges, Preset, ProxyServer, ExportData, ImportValidationResult, PublicProxyCheckResults, PublicPoolConfig, PublicProxyCatalogCache, PublicPoolGeoExclusions, PublicPoolGeoSite, PublicPoolGeoSites, PublicPoolGeoSiteState } from '../types';
import { pruneCheckResults, mergeCheckResults } from '../storage/public-proxy-check-cache';
import { IStorageBackend, ISettingsRepository, SyncMergeStats } from '../types/storage';
import { StorageKeys, ProxyState, SYNC_STORAGE_KEYS, DEFAULT_PRESET_ID, GeoBlockConfig } from './constants';
import { PresetRepository, ChromeStorageBackend, StorageBackend } from '../storage/preset-repository';
import { MigrationService } from '../storage/migration-service';
import { ProxyRepository } from '../storage/proxy-repository';
import { SyncService } from '../storage/sync-service';
import { ImportExportService } from '../storage/import-export-service';

type StorageChangeCallback = (changes: StorageChanges, area: string) => void;

// Остановка сайта действует, пока не истёк срок: now - stoppedAt < SITE_STOP_MS.
// Время приходит параметром, чтобы тесты не зависели от часов.
function toGeoSiteState(site: PublicPoolGeoSite | undefined, now: number): PublicPoolGeoSiteState {
    const stoppedAt = site?.stoppedAt ?? null;
    return {
        streak: site?.streak ?? 0,
        stopped: stoppedAt !== null && now - stoppedAt < GeoBlockConfig.SITE_STOP_MS,
    };
}

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
    // Всегда пишем только в local: debounce-push sync-ключей в облако выполняет
    // background (SyncService.registerLocalToCloudSync) — таймер, заведённый в
    // контексте попапа, умирает вместе с ним, и отложенная запись терялась
    async setTyped<K extends StorageKey>(key: K, value: StorageData[K]): Promise<void> {
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

    async setSyncEnabled(enabled: boolean): Promise<SyncMergeStats | null> {
        const currentEnabled = await SyncService.wasInitialized()
            ? await SyncService.isEnabled()
            : false;

        let stats: SyncMergeStats | null = null;
        if (enabled && !currentEnabled) {
            // Включаем синхронизацию - сливаем данные с облаком без дублей
            stats = (await this.migrationService.migrateToSync()) ?? null;
        } else if (!enabled && currentEnabled) {
            // Отключаем синхронизацию - мигрируем данные в local
            await this.migrationService.migrateToLocal();
        }

        await SyncService.setEnabled(enabled);
        return stats;
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

    async setPresetPublicPool(id: string, config: PublicPoolConfig | null): Promise<void> {
        return this.presetRepository.setPublicPool(id, config);
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

    /**
     * Возвращает тему ровно так, как она сохранена: 'light' | 'dark' | undefined.
     * undefined означает «тема не задана вручную» — вызывающий код должен
     * унаследовать её от системных настроек ОС (см. resolveEffectiveTheme).
     */
    async getStoredTheme(): Promise<ThemeType | undefined> {
        return this.getTyped(StorageKeys.THEME as StorageKey) as Promise<ThemeType | undefined>;
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

    // === Предупреждение о публичных прокси (закрывается крестиком навсегда) ===

    async getPublicProxiesWarningDismissed(): Promise<boolean> {
        const value = await this.getTyped(StorageKeys.PUBLIC_PROXIES_WARNING_DISMISSED as StorageKey) as boolean | undefined;
        return value ?? false; // По умолчанию false - предупреждение показывается
    }

    async setPublicProxiesWarningDismissed(dismissed: boolean): Promise<void> {
        return this.setTyped(StorageKeys.PUBLIC_PROXIES_WARNING_DISMISSED as StorageKey, dismissed);
    }

    // === Кеш результатов фоновой проверки публичных прокси ===
    // Только local: результаты машинно-специфичны, TTL сутки.
    // Сама проверка управляется настройкой proxyCheckEnabled.

    async getPublicProxyCheckResults(): Promise<PublicProxyCheckResults> {
        const raw = await this.getTyped(StorageKeys.PUBLIC_PROXY_CHECK_RESULTS as StorageKey) as PublicProxyCheckResults | undefined;
        return pruneCheckResults(raw ?? {}, Date.now());
    }

    async getPublicProxyCatalog(): Promise<PublicProxyCatalogCache | undefined> {
        const raw = await this.getTyped(StorageKeys.PUBLIC_PROXY_CATALOG as StorageKey) as PublicProxyCatalogCache | undefined;
        if (!raw || typeof raw !== 'object' || typeof raw.fetchedAt !== 'number' || !Array.isArray(raw.proxies)) {
            return undefined;
        }
        return raw;
    }

    async setPublicProxyCatalog(cache: PublicProxyCatalogCache): Promise<void> {
        return this.setTyped(StorageKeys.PUBLIC_PROXY_CATALOG as StorageKey, cache);
    }

    async mergePublicProxyCheckResults(updates: PublicProxyCheckResults): Promise<void> {
        const current = await this.getPublicProxyCheckResults();
        return this.setTyped(StorageKeys.PUBLIC_PROXY_CHECK_RESULTS as StorageKey, mergeCheckResults(current, updates));
    }

    // === Исключения пула по гео-блоку ===
    // Только local. Ключ publicPoolGeoExclusions.

    async getPublicPoolGeoExclusions(): Promise<PublicPoolGeoExclusions> {
        const raw = await this.getTyped(StorageKeys.PUBLIC_POOL_GEO_EXCLUSIONS as StorageKey) as PublicPoolGeoExclusions | undefined;
        return raw ?? {};
    }

    async getPresetGeoExclusions(presetId: string): Promise<Record<string, number>> {
        const all = await this.getPublicPoolGeoExclusions();
        return all[presetId] ?? {};
    }

    async addPresetGeoExclusion(presetId: string, memberKey: string, excludedAt: number): Promise<void> {
        const all = await this.getPublicPoolGeoExclusions();
        const presetExclusions = all[presetId] ?? {};
        // Запись без изменения данных поднимает onChanged и пересобирает PAC впустую
        if (presetExclusions[memberKey] === excludedAt) {
            return;
        }
        const updated: PublicPoolGeoExclusions = {
            ...all,
            [presetId]: { ...presetExclusions, [memberKey]: excludedAt },
        };
        return this.setTyped(StorageKeys.PUBLIC_POOL_GEO_EXCLUSIONS as StorageKey, updated);
    }

    async deletePresetGeoExclusions(presetId: string): Promise<void> {
        const all = await this.getPublicPoolGeoExclusions();
        // Записи пресета нет — не пишем ключ: запись поднимает onChanged и пересборку PAC на пустом изменении
        if (all[presetId] === undefined) {
            return;
        }
        const updated = { ...all };
        delete updated[presetId];
        return this.setTyped(StorageKeys.PUBLIC_POOL_GEO_EXCLUSIONS as StorageKey, updated);
    }

    // Каталог обновился: остаются исключения прокси из каталога и пресетов из списка.
    async cleanGeoExclusions(presentMemberKeys: string[], existingPresetIds: string[]): Promise<void> {
        const all = await this.getPublicPoolGeoExclusions();
        const presentKeys = new Set(presentMemberKeys);
        const existingPresets = new Set(existingPresetIds);
        const updated: PublicPoolGeoExclusions = {};
        let removed = false;
        // Идём по исключениям, а не по каталогу: исключений единицы, каталог — сотни записей
        for (const [presetId, presetExclusions] of Object.entries(all)) {
            if (!existingPresets.has(presetId)) {
                removed = true;
                continue;
            }
            const cleaned: Record<string, number> = {};
            for (const [memberKey, excludedAt] of Object.entries(presetExclusions)) {
                if (presentKeys.has(memberKey)) {
                    cleaned[memberKey] = excludedAt;
                } else {
                    removed = true;
                }
            }
            if (Object.keys(cleaned).length > 0) {
                updated[presetId] = cleaned;
            }
        }
        // Ничего не удалено — ключ не трогаем, чтобы не поднимать onChanged
        if (!removed) {
            return;
        }
        return this.setTyped(StorageKeys.PUBLIC_POOL_GEO_EXCLUSIONS as StorageKey, updated);
    }

    // === Серии блокировок по сайтам ===
    // Только local. Ключ publicPoolGeoSites.

    async getPublicPoolGeoSites(): Promise<PublicPoolGeoSites> {
        const raw = await this.getTyped(StorageKeys.PUBLIC_POOL_GEO_SITES as StorageKey) as PublicPoolGeoSites | undefined;
        return raw ?? {};
    }

    async getPresetGeoSite(presetId: string, ruleKey: string, now: number): Promise<PublicPoolGeoSiteState> {
        const all = await this.getPublicPoolGeoSites();
        return toGeoSiteState(all[presetId]?.[ruleKey], now);
    }

    async incrementPresetGeoSite(presetId: string, ruleKey: string, now: number): Promise<PublicPoolGeoSiteState> {
        const all = await this.getPublicPoolGeoSites();
        const streak = toGeoSiteState(all[presetId]?.[ruleKey], now).streak + 1;
        // Порог серии достигнут — замены для сайта встают на SITE_STOP_MS
        const site: PublicPoolGeoSite = {
            streak,
            stoppedAt: streak >= GeoBlockConfig.SITE_STREAK_LIMIT ? now : null,
        };
        const updated: PublicPoolGeoSites = {
            ...all,
            [presetId]: { ...all[presetId], [ruleKey]: site },
        };
        await this.setTyped(StorageKeys.PUBLIC_POOL_GEO_SITES as StorageKey, updated);
        return { streak, stopped: site.stoppedAt !== null };
    }

    async resetPresetGeoSite(presetId: string, ruleKey: string): Promise<void> {
        const all = await this.getPublicPoolGeoSites();
        const presetSites = all[presetId];
        // Записи сайта нет — ключ не трогаем: запись поднимает onChanged без изменений
        if (presetSites === undefined || presetSites[ruleKey] === undefined) {
            return;
        }
        const sites = { ...presetSites };
        delete sites[ruleKey];
        return this.setTyped(StorageKeys.PUBLIC_POOL_GEO_SITES as StorageKey, { ...all, [presetId]: sites });
    }

    async deletePresetGeoSites(presetId: string): Promise<void> {
        const all = await this.getPublicPoolGeoSites();
        // Сайтов пресета нет — ключ не трогаем: запись поднимает onChanged без изменений
        if (all[presetId] === undefined) {
            return;
        }
        const updated = { ...all };
        delete updated[presetId];
        return this.setTyped(StorageKeys.PUBLIC_POOL_GEO_SITES as StorageKey, updated);
    }

    // === Свёрнутость блока фильтров публичных прокси ===

    async getPublicProxiesFiltersCollapsed(): Promise<boolean> {
        const value = await this.getTyped(StorageKeys.PUBLIC_PROXIES_FILTERS_COLLAPSED as StorageKey) as boolean | undefined;
        return value ?? false; // По умолчанию false - фильтры развёрнуты
    }

    async setPublicProxiesFiltersCollapsed(collapsed: boolean): Promise<void> {
        return this.setTyped(StorageKeys.PUBLIC_PROXIES_FILTERS_COLLAPSED as StorageKey, collapsed);
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