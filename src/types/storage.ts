/**
 * Интерфейсы для компонентов Storage-сервиса
 * 
 * Эти контракты определяют API для всех модулей, извлечённых из StorageService.
 * Используются для декомпозиции god-класса на отдельные сервисы.
 */

import { ProxyServer, Preset, ExportData, ImportValidationResult, ThemeType, SupportedLanguage, ProxyStateType } from './index';

// ============================================================================
// IStorageBackend - низкоуровневый доступ к chrome.storage
// ============================================================================

/**
 * Низкоуровневый интерфейс для работы с chrome.storage
 * Абстрагирует прямые вызовы chrome.storage API
 */
export interface IStorageBackend {
    /**
     * Получить значение по ключу из local storage
     */
    get<K extends string>(key: K): Promise<unknown>;

    /**
     * Установить значение в storage
     */
    set<K extends string>(key: K, value: unknown): Promise<void>;

    /**
     * Получить несколько значений по ключам
     */
    getMultiple<K extends string>(keys: K[]): Promise<Record<K, unknown>>;

    /**
     * Удалить значения по ключам
     */
    remove(keys: string[]): Promise<void>;

    /**
     * Проверка квоты sync storage
     */
    checkSyncQuota(key: string, value: unknown): Promise<void>;

    /**
     * Получить bytesInUse из sync storage
     */
    getSyncBytesInUse(): Promise<number>;
}

// ============================================================================
// IPresetRepository - CRUD для пресетов
// ============================================================================

/**
 * Интерфейс репозитория для управления пресетами
 * Отвечает за все операции CRUD с пресетами
 */
export interface IPresetRepository {
    /**
     * Получить все пресеты (отсортированные: isDefault сначала, затем по order)
     */
    getAll(): Promise<Preset[]>;

    /**
     * Установить все пресеты
     */
    setAll(presets: Preset[]): Promise<void>;

    /**
     * Получить пресет по ID
     */
    getById(id: string): Promise<Preset | undefined>;

    /**
     * Обновить пресет по ID
     */
    update(id: string, updates: Partial<Preset>): Promise<void>;

    /**
     * Удалить пресет по ID
     */
    delete(id: string): Promise<void>;

    /**
     * Добавить новый пресет (с автоматической генерацией ID и timestamps)
     */
    add(presetData: Omit<Preset, 'id' | 'createdAt' | 'updatedAt'>): Promise<Preset>;

    /**
     * Установить enabled флаг для пресета
     */
    setEnabled(id: string, enabled: boolean): Promise<void>;

    /**
     * Установить proxyId для пресета
     */
    setProxy(id: string, proxyId: string | null): Promise<void>;

    /**
     * Переупорядочить пресеты по массиву ID
     */
    reorder(orderedIds: string[]): Promise<void>;

    /**
     * Получить все активные пресеты (enabled = true)
     */
    getActive(): Promise<Preset[]>;

    /**
     * Получить все домены из активных пресетов (уникальные)
     */
    getAllActiveDomains(): Promise<string[]>;

    /**
     * Создать дефолтный пресет
     */
    createDefaultPreset(domains?: string[]): Preset;
}

// ============================================================================
// IProxyRepository - CRUD для прокси-серверов
// ============================================================================

/**
 * Интерфейс репозитория для управления прокси-серверами
 * Отвечает за все операции CRUD с прокси
 */
export interface IProxyRepository {
    /**
     * Получить все прокси-серверы
     */
    getAll(): Promise<ProxyServer[]>;

    /**
     * Установить все прокси-серверы
     */
    setAll(proxies: ProxyServer[]): Promise<void>;

    /**
     * Получить прокси по ID
     */
    getById(id: string): Promise<ProxyServer | undefined>;

    /**
     * Получить дефолтный прокси (isDefault = true) или первый в списке
     */
    getDefault(): Promise<ProxyServer | undefined>;

    /**
     * Обновить прокси по ID
     */
    update(id: string, updates: Partial<ProxyServer>): Promise<void>;

    /**
     * Удалить прокси по ID
     */
    delete(id: string): Promise<void>;

    /**
     * Добавить новый прокси (с автоматической генерацией ID и timestamps)
     */
    add(proxyData: Omit<ProxyServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProxyServer>;

    /**
     * Установить прокси как дефолтный
     */
    setDefault(id: string): Promise<void>;
}

// ============================================================================
// IMigrationService - сервис миграций данных
// ============================================================================

/**
 * Интерфейс сервиса для миграции данных между форматами storage
 */
export interface IMigrationService {
    /**
     * Выполнить миграцию из старой структуры domains в пресеты
     */
    migrateFromLegacyDomains(): Promise<void>;

    /**
     * Выполнить миграцию из старого формата selfProxy в proxies
     */
    migrateFromLegacyProxy(): Promise<void>;

    /**
     * Мигрировать данные из local storage в sync
     */
    migrateToSync(): Promise<void>;

    /**
     * Мигрировать данные из sync в local storage
     */
    migrateToLocal(): Promise<void>;
}

// ============================================================================
// IImportExportService - сервис импорта/экспорта данных
// ============================================================================

/**
 * Интерфейс сервиса для импорта и экспорта данных расширения
 */
export interface IImportExportService {
    /**
     * Экспортировать все данные расширения
     */
    exportAll(): Promise<ExportData>;

    /**
     * Валидировать импортируемые JSON данные
     */
    validateImportData(jsonString: string): ImportValidationResult;

    /**
     * Импортировать данные (replace = полная замена, merge = слияние)
     */
    importAll(exportData: ExportData, mode: 'replace' | 'merge'): Promise<void>;
}

// ============================================================================
// ISyncService - сервис синхронизации между storage area
// ============================================================================

/**
 * Интерфейс сервиса для управления синхронизацией между local и sync storage
 */
export interface ISyncService {
    /**
     * Получить статус синхронизации (включена/выключена)
     */
    isEnabled(): Promise<boolean>;

    /**
     * Установить статус синхронизации
     */
    setEnabled(enabled: boolean): Promise<void>;

    /**
     * Подтянуть данные из sync storage в local (для кэширования)
     */
    syncFromCloud(): Promise<void>;

    /**
     * Обработать изменения из sync storage и обновить local
     */
    handleSyncChanges(changes: Record<string, chrome.storage.StorageChange>): void;
}

// ============================================================================
// ISettingsRepository - репозиторий для настроек расширения
// ============================================================================

/**
 * Интерфейс репозитория для управления настройками расширения
 * Тема, язык, proxyByDefault и другие пользовательские настройки
 */
export interface ISettingsRepository {
    /**
     * Получить текущую тему
     */
    getTheme(): Promise<ThemeType>;

    /**
     * Установить тему
     */
    setTheme(theme: ThemeType): Promise<void>;

    /**
     * Получить текущий язык
     */
    getLanguage(): Promise<SupportedLanguage | undefined>;

    /**
     * Установить язык
     */
    setLanguage(lang: SupportedLanguage): Promise<void>;

    /**
     * Получить настройку proxyByDefault
     */
    getProxyByDefault(): Promise<boolean>;

    /**
     * Установить настройку proxyByDefault
     */
    setProxyByDefault(enabled: boolean): Promise<void>;
}

// ============================================================================
// IStateRepository - репозиторий для состояния прокси
// ============================================================================

/**
 * Интерфейс репозитория для управления состоянием прокси
 * Target state (желаемое) и current state (фактическое)
 */
export interface IStateRepository {
    /**
     * Получить целевое состояние прокси
     */
    getTargetState(): Promise<ProxyStateType>;

    /**
     * Установить целевое состояние прокси
     */
    setTargetState(state: ProxyStateType): Promise<void>;

    /**
     * Получить текущее фактическое состояние прокси
     */
    getCurrentState(): Promise<ProxyStateType>;

    /**
     * Установить текущее фактическое состояние прокси
     */
    setCurrentState(state: ProxyStateType): Promise<void>;
}
