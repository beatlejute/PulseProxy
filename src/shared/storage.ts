import { StorageData, StorageKey, ProxyStateType, ThemeType, SupportedLanguage, StorageChanges, SyncStorageKey, Preset, ProxyServer, ExportData, ImportValidationResult } from '../types';
import { StorageKeys, ProxyState, SYNC_STORAGE_KEYS, DEFAULT_PRESET_ID, EXPORT_FORMAT_VERSION } from './constants';

type StorageChangeCallback = (changes: StorageChanges, area: string) => void;

// Debounce delay для sync storage (мс)
const SYNC_DEBOUNCE_DELAY = 1000;

class StorageService {
    private syncEnabled: boolean = false;
    private subscribers: StorageChangeCallback[] = [];
    
    // Debounce таймеры для sync storage записей
    private syncDebounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    // Инициализация сервиса
    async init(): Promise<void> {
        const result = await chrome.storage.local.get('syncEnabled') as { syncEnabled?: boolean };
        // Если syncEnabled не установлен, включаем синхронизацию по умолчанию
        if (result.syncEnabled === undefined) {
            this.syncEnabled = true;
            await chrome.storage.local.set({ syncEnabled: true });
        } else {
            this.syncEnabled = result.syncEnabled;
        }
        
        // Если sync включён, подтягиваем данные из sync в local (для кэширования)
        if (this.syncEnabled) {
            await this.syncFromCloud();
        }
        
        // Проверка и выполнение миграции
        const migrationResult = await chrome.storage.local.get('migrationCompleted');
        if (!migrationResult.migrationCompleted) {
            await this.migrateFromLegacyDomains();
        }
        
        // Подписка на изменения из sync storage
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'sync' && this.syncEnabled) {
                // Обновляем local storage при изменениях в sync
                this.handleSyncChanges(changes);
                this.notifySubscribers(changes);
            }
        });
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

    // Обработка изменений из sync storage
    private handleSyncChanges(changes: StorageChanges): void {
        const updates: Record<string, unknown> = {};
        for (const [key, change] of Object.entries(changes)) {
            if (change.newValue !== undefined) {
                updates[key] = change.newValue;
            }
        }
        if (Object.keys(updates).length > 0) {
            chrome.storage.local.set(updates);
        }
    }

    // Проверка, является ли ключ синхронизируемым
    private isSyncKey(key: StorageKey): key is SyncStorageKey {
        return (SYNC_STORAGE_KEYS as readonly string[]).includes(key);
    }

    // Получить значение по ключу
    // Всегда читаем из local storage, т.к. туда пишем сразу (sync идёт с debounce)
    async get<K extends StorageKey>(key: K): Promise<StorageData[K] | undefined> {
        return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => {
                resolve(result[key] as StorageData[K] | undefined);
            });
        });
    }

    // Установить значение
    async set<K extends StorageKey>(key: K, value: StorageData[K]): Promise<void> {
        // Используем debounce для sync storage
        if (this.syncEnabled && this.isSyncKey(key)) {
            return this.setWithDebounce(key as SyncStorageKey, value as StorageData[SyncStorageKey]);
        }
        
        // Для local storage - записываем сразу
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });
    }

    // Запись в sync storage с debounce
    // Сначала записываем в local для немедленного чтения, потом с debounce в sync
    private async setWithDebounce<K extends SyncStorageKey>(key: K, value: StorageData[K]): Promise<void> {
        // Сначала записываем в local storage для немедленного доступа
        await new Promise<void>((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });

        // Сбрасываем предыдущий таймер для sync
        const existingTimer = this.syncDebounceTimers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Устанавливаем новый таймер для записи в sync (fire-and-forget)
        const timer = setTimeout(async () => {
            this.syncDebounceTimers.delete(key);

            try {
                // Проверка квоты
                await this.checkSyncQuota(key, value);
                
                // Записываем в sync storage
                await new Promise<void>((res) => {
                    chrome.storage.sync.set({ [key]: value }, res);
                });
                console.log(`Storage: Synced ${key} to cloud`);
            } catch (error) {
                console.error(`Storage: Failed to sync ${key}:`, error);
            }
        }, SYNC_DEBOUNCE_DELAY);

        this.syncDebounceTimers.set(key, timer);
    }

    // Получить несколько значений
    // Всегда читаем из local storage
    async getMultiple<K extends StorageKey>(keys: K[]): Promise<Partial<StorageData>> {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (result) => {
                resolve(result as Partial<StorageData>);
            });
        });
    }

    // Проверка квоты sync storage
    private async checkSyncQuota<K extends SyncStorageKey>(key: K, value: StorageData[K]): Promise<void> {
        const serialized = JSON.stringify({ [key]: value });
        const bytes = new Blob([serialized]).size;

        // Максимальный размер одного элемента - 8KB
        if (bytes > 8192) {
            throw new Error(`Sync storage item too large: ${bytes} bytes (max 8192)`);
        }

        // Проверка общей квоты - 100KB
        const bytesInUse = await chrome.storage.sync.getBytesInUse();
        if (bytesInUse + bytes > 102400) {
            throw new Error('Sync storage quota exceeded');
        }
    }

    // Управление синхронизацией
    async getSyncEnabled(): Promise<boolean> {
        const result = await chrome.storage.local.get('syncEnabled') as { syncEnabled?: boolean };
        return result.syncEnabled ?? true;
    }

    async setSyncEnabled(enabled: boolean): Promise<void> {
        if (enabled && !this.syncEnabled) {
            // Включаем синхронизацию - мигрируем данные в sync
            await this.migrateToSync();
        } else if (!enabled && this.syncEnabled) {
            // Отключаем синхронизацию - мигрируем данные в local
            await this.migrateToLocal();
        }
        
        this.syncEnabled = enabled;
        await chrome.storage.local.set({ syncEnabled: enabled });
    }

    // Миграция данных в sync storage
    async migrateToSync(): Promise<void> {
        const keysToMigrate = SYNC_STORAGE_KEYS.filter(k => k !== 'syncEnabled');
        const localData = await chrome.storage.local.get([...keysToMigrate]);
        
        if (Object.keys(localData).length > 0) {
            await chrome.storage.sync.set(localData);
        }
    }

    // Миграция данных в local storage
    async migrateToLocal(): Promise<void> {
        const keysToMigrate = SYNC_STORAGE_KEYS.filter(k => k !== 'syncEnabled');
        const syncData = await chrome.storage.sync.get([...keysToMigrate]);
        
        if (Object.keys(syncData).length > 0) {
            await chrome.storage.local.set(syncData);
        }
    }

    // Уведомление подписчиков об изменениях
    private notifySubscribers(changes: StorageChanges): void {
        this.subscribers.forEach(callback => callback(changes, 'sync'));
    }

    // Миграция из старой структуры domains в пресеты
    async migrateFromLegacyDomains(): Promise<void> {
        // Получаем старые данные из обоих storage
        const [localData, syncData] = await Promise.all([
            chrome.storage.local.get(['domains']) as Promise<{ domains?: string[] }>,
            chrome.storage.sync.get(['domains']) as Promise<{ domains?: string[] }>
        ]);

        const legacyDomains: string[] = syncData.domains || localData.domains || [];
        
        // Создаём дефолтный пресет
        const customPreset = this.createDefaultPreset(legacyDomains);

        // Сохраняем пресеты
        await this.setPresets([customPreset]);

        // Удаляем старые поля domains
        await chrome.storage.local.remove('domains');
        await chrome.storage.sync.remove('domains');

        // Миграция из старого формата selfProxy
        await this.migrateFromLegacyProxy();

        // Устанавливаем флаг завершения миграции
        await chrome.storage.local.set({ migrationCompleted: true });
    }

    // Создание дефолтного пресета Ignore List
    private createDefaultPreset(domains: string[] = []): Preset {
        const now = Date.now();
        return {
            id: DEFAULT_PRESET_ID,
            name: 'Ignore List',
            domains: domains,
            enabled: true,
            isDefault: true,
            order: 0,
            proxyId: null,
            createdAt: now,
            updatedAt: now,
        };
    }

    // Миграция из старого формата selfProxy в новый формат proxies
    private async migrateFromLegacyProxy(): Promise<void> {
        const [localData, syncData] = await Promise.all([
            chrome.storage.local.get(['selfProxy']),
            chrome.storage.sync.get(['selfProxy'])
        ]);

        const legacyProxy = syncData.selfProxy || localData.selfProxy;
        if (!legacyProxy || typeof legacyProxy !== 'string') return;

        // Парсим старый формат host:port
        const [host, portStr] = legacyProxy.split(':');
        const port = parseInt(portStr, 10);

        if (host && port && !isNaN(port)) {
            const now = Date.now();
            const newProxy: ProxyServer = {
                id: crypto.randomUUID(),
                type: 'http',  // По умолчанию HTTP
                host,
                port,
                isDefault: true,
                createdAt: now,
                updatedAt: now,
            };

            await this.setProxies([newProxy]);
        }

        // Удаляем старые данные
        await chrome.storage.local.remove('selfProxy');
        await chrome.storage.sync.remove('selfProxy');
    }

    // === Методы для работы с пресетами ===

    // Получить все пресеты
    async getPresets(): Promise<Preset[]> {
        const presets = await this.get(StorageKeys.PRESETS as StorageKey) as Preset[] | undefined;
        
        // Если пресеты существуют и массив не пуст
        if (Array.isArray(presets) && presets.length > 0) {
            // Сортируем: сначала isDefault (Custom) всегда сверху, затем по order
            return [...presets].sort((a: Preset, b: Preset) => {
                // isDefault пресеты всегда первые
                if (a.isDefault && !b.isDefault) return -1;
                if (!a.isDefault && b.isDefault) return 1;
                // Остальные сортируем по order
                return a.order - b.order;
            });
        }
        
        // Если пресетов нет или массив пуст - создаём дефолтный пресет
        console.log('Storage: No presets found, creating default Custom preset');
        const defaultPreset = this.createDefaultPreset();
        await this.setPresets([defaultPreset]);
        return [defaultPreset];
    }

    // Установить все пресеты
    async setPresets(presets: Preset[]): Promise<void> {
        return this.set(StorageKeys.PRESETS as StorageKey, presets);
    }

    // Получить пресет по ID
    async getPreset(id: string): Promise<Preset | undefined> {
        const presets = await this.getPresets();
        return presets.find(p => p.id === id);
    }

    // Обновить пресет
    async updatePreset(id: string, updates: Partial<Preset>): Promise<void> {
        const presets = await this.getPresets();
        const index = presets.findIndex(p => p.id === id);
        if (index !== -1) {
            presets[index] = { ...presets[index], ...updates, updatedAt: Date.now() };
            await this.setPresets(presets);
        }
    }

    // Удалить пресет
    async deletePreset(id: string): Promise<void> {
        const presets = await this.getPresets();
        const filtered = presets.filter(p => p.id !== id);
        await this.setPresets(filtered);
    }

    // Добавить пресет (с автоматическим генерированием ID и timestamps)
    async addPreset(presetData: Omit<Preset, 'id' | 'createdAt' | 'updatedAt'>): Promise<Preset> {
        const presets = await this.getPresets();
        const now = Date.now();
        const newPreset: Preset = {
            ...presetData,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
        };
        presets.push(newPreset);
        await this.setPresets(presets);
        return newPreset;
    }

    // Установить enabled для пресета
    async setPresetEnabled(id: string, enabled: boolean): Promise<void> {
        await this.updatePreset(id, { enabled });
    }

    // Установить прокси для пресета
    async setPresetProxy(id: string, proxyId: string | null): Promise<void> {
        await this.updatePreset(id, { proxyId });
    }

    // Переупорядочить пресеты по массиву ID
    async reorderPresets(orderedIds: string[]): Promise<void> {
        const presets = await this.getPresets();
        const presetsMap = new Map(presets.map(p => [p.id, p]));
        
        // Устанавливаем order для каждого пресета согласно его позиции в orderedIds
        orderedIds.forEach((id, index) => {
            const preset = presetsMap.get(id);
            if (preset) {
                preset.order = index;
                preset.updatedAt = Date.now();
            }
        });
        
        // Сохраняем пресеты, отсортированные по новому order
        const sortedPresets = [...presets].sort((a, b) => {
            // isDefault всегда первый
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.order - b.order;
        });
        
        await this.setPresets(sortedPresets);
    }

    // Получить активные пресеты (enabled = true)
    async getActivePresets(): Promise<Preset[]> {
        const presets = await this.getPresets();
        return presets.filter(p => p.enabled);
    }

    // Получить все домены из активных пресетов
    async getAllActiveDomains(): Promise<string[]> {
        const activePresets = await this.getActivePresets();
        const allDomains: string[] = [];
        for (const preset of activePresets) {
            allDomains.push(...preset.domains);
        }
        // Возвращаем уникальные домены
        return [...new Set(allDomains)];
    }

    // === Методы для работы с прокси серверами ===

    // Получить все прокси
    async getProxies(): Promise<ProxyServer[]> {
        const proxies = await this.get(StorageKeys.PROXIES as StorageKey) as ProxyServer[] | undefined;
        return proxies || [];
    }

    // Установить все прокси
    async setProxies(proxies: ProxyServer[]): Promise<void> {
        return this.set(StorageKeys.PROXIES as StorageKey, proxies);
    }

    // Получить прокси по ID
    async getProxy(id: string): Promise<ProxyServer | undefined> {
        const proxies = await this.getProxies();
        return proxies.find(p => p.id === id);
    }

    // Получить дефолтный прокси
    async getDefaultProxy(): Promise<ProxyServer | undefined> {
        const proxies = await this.getProxies();
        return proxies.find(p => p.isDefault) || proxies[0];
    }

    // Обновить прокси
    async updateProxy(id: string, updates: Partial<ProxyServer>): Promise<void> {
        const proxies = await this.getProxies();
        const index = proxies.findIndex(p => p.id === id);
        if (index !== -1) {
            proxies[index] = { ...proxies[index], ...updates, updatedAt: Date.now() };
            await this.setProxies(proxies);
        }
    }

    // Удалить прокси
    async deleteProxy(id: string): Promise<void> {
        const proxies = await this.getProxies();
        const filtered = proxies.filter(p => p.id !== id);
        await this.setProxies(filtered);
    }

    // Добавить прокси (с автоматическим генерированием ID и timestamps)
    async addProxy(proxyData: Omit<ProxyServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProxyServer> {
        const proxies = await this.getProxies();
        const now = Date.now();
        const newProxy: ProxyServer = {
            ...proxyData,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
        };
        proxies.push(newProxy);
        await this.setProxies(proxies);
        return newProxy;
    }

    // Установить дефолтный прокси
    async setDefaultProxy(id: string): Promise<void> {
        const proxies = await this.getProxies();
        for (const proxy of proxies) {
            proxy.isDefault = proxy.id === id;
        }
        await this.setProxies(proxies);
    }

    // === Состояние прокси ===

    async getTargetState(): Promise<ProxyStateType> {
        const state = await this.get(StorageKeys.TARGET_STATE as StorageKey) as ProxyStateType | undefined;
        return state || ProxyState.DISCONNECTED;
    }

    async setTargetState(state: ProxyStateType): Promise<void> {
        return this.set(StorageKeys.TARGET_STATE as StorageKey, state);
    }

    async getCurrentState(): Promise<ProxyStateType> {
        const state = await this.get(StorageKeys.CURRENT_STATE as StorageKey) as ProxyStateType | undefined;
        return state || ProxyState.DISCONNECTED;
    }

    async setCurrentState(state: ProxyStateType): Promise<void> {
        return this.set(StorageKeys.CURRENT_STATE as StorageKey, state);
    }

    // === Настройки ===

    async getTheme(): Promise<ThemeType> {
        const theme = await this.get(StorageKeys.THEME as StorageKey) as ThemeType | undefined;
        return theme || 'light';
    }

    async setTheme(theme: ThemeType): Promise<void> {
        return this.set(StorageKeys.THEME as StorageKey, theme);
    }

    async getLanguage(): Promise<SupportedLanguage | undefined> {
        return this.get(StorageKeys.LANGUAGE as StorageKey) as Promise<SupportedLanguage | undefined>;
    }

    async setLanguage(lang: SupportedLanguage): Promise<void> {
        return this.set(StorageKeys.LANGUAGE as StorageKey, lang);
    }

    // === Настройка проксирования по умолчанию ===

    async getProxyByDefault(): Promise<boolean> {
        const value = await this.get(StorageKeys.PROXY_BY_DEFAULT as StorageKey) as boolean | undefined;
        return value ?? true; // По умолчанию true - все сайты проксируются
    }

    async setProxyByDefault(enabled: boolean): Promise<void> {
        return this.set(StorageKeys.PROXY_BY_DEFAULT as StorageKey, enabled);
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

    // === Импорт/Экспорт ===

    // Экспорт всех данных
    async exportAllData(): Promise<ExportData> {
        const [presets, proxies, theme, language, proxyByDefault] = await Promise.all([
            this.getPresets(),
            this.getProxies(),
            this.getTheme(),
            this.getLanguage(),
            this.getProxyByDefault()
        ]);

        return {
            version: EXPORT_FORMAT_VERSION,
            exportedAt: new Date().toISOString(),
            extensionVersion: chrome.runtime.getManifest().version,
            data: {
                presets,
                proxies,
                theme,
                language: language || 'en',
                proxyByDefault
            }
        };
    }

    // Валидация импортируемых данных
    validateImportData(jsonString: string): ImportValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Парсинг JSON
        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonString);
        } catch {
            return { valid: false, errors: ['invalidJson'], warnings: [] };
        }
        
        // Проверка базовой структуры
        if (!parsed || typeof parsed !== 'object') {
            return { valid: false, errors: ['invalidStructure'], warnings: [] };
        }
        
        const data = parsed as Record<string, unknown>;
        
        // Проверка версии формата
        if (typeof data.version !== 'number') {
            errors.push('missingVersion');
        } else if (data.version > EXPORT_FORMAT_VERSION) {
            warnings.push('newerVersion');
        }
        
        // Проверка наличия data
        if (!data.data || typeof data.data !== 'object') {
            return { valid: false, errors: ['missingData'], warnings };
        }
        
        const innerData = data.data as Record<string, unknown>;
        
        // Валидация пресетов
        if (!Array.isArray(innerData.presets)) {
            errors.push('invalidPresets');
        } else {
            for (const preset of innerData.presets) {
                if (!this.isValidPreset(preset)) {
                    errors.push('invalidPresetStructure');
                    break;
                }
            }
        }
        
        // Валидация прокси
        if (!Array.isArray(innerData.proxies)) {
            errors.push('invalidProxies');
        } else {
            for (const proxy of innerData.proxies) {
                if (!this.isValidProxy(proxy)) {
                    errors.push('invalidProxyStructure');
                    break;
                }
            }
        }
        
        if (errors.length > 0) {
            return { valid: false, errors, warnings };
        }
        
        return {
            valid: true,
            errors: [],
            warnings,
            data: data as unknown as ExportData
        };
    }

    // Проверка валидности пресета
    private isValidPreset(preset: unknown): preset is Preset {
        if (!preset || typeof preset !== 'object') return false;
        const p = preset as Record<string, unknown>;
        return (
            typeof p.id === 'string' &&
            typeof p.name === 'string' &&
            Array.isArray(p.domains) &&
            typeof p.enabled === 'boolean' &&
            typeof p.isDefault === 'boolean' &&
            typeof p.order === 'number'
        );
    }

    // Проверка валидности прокси
    private isValidProxy(proxy: unknown): proxy is ProxyServer {
        if (!proxy || typeof proxy !== 'object') return false;
        const p = proxy as Record<string, unknown>;
        return (
            typeof p.id === 'string' &&
            typeof p.type === 'string' &&
            ['http', 'https', 'socks4', 'socks5'].includes(p.type as string) &&
            typeof p.host === 'string' &&
            typeof p.port === 'number' &&
            typeof p.isDefault === 'boolean'
        );
    }

    // Импорт данных (с заменой или слиянием)
    async importAllData(
        exportData: ExportData,
        mode: 'replace' | 'merge' = 'replace'
    ): Promise<void> {
        const { presets, proxies, theme, language, proxyByDefault } = exportData.data;
        
        if (mode === 'replace') {
            // Полная замена всех данных
            await Promise.all([
                this.setPresets(presets),
                this.setProxies(proxies),
                this.setTheme(theme),
                this.setLanguage(language),
                this.setProxyByDefault(proxyByDefault)
            ]);
        } else {
            // Слияние: добавляем только новые элементы
            const existingPresets = await this.getPresets();
            const existingProxies = await this.getProxies();
            
            const existingPresetIds = new Set(existingPresets.map(p => p.id));
            const existingProxyIds = new Set(existingProxies.map(p => p.id));
            
            const newPresets = presets.filter(p => !existingPresetIds.has(p.id));
            const newProxies = proxies.filter(p => !existingProxyIds.has(p.id));
            
            await Promise.all([
                this.setPresets([...existingPresets, ...newPresets]),
                this.setProxies([...existingProxies, ...newProxies])
            ]);
        }
    }
}

export const Storage = new StorageService();