// Состояния прокси
export type ProxyStateType = 'connected' | 'disconnected' | 'connecting' | 'error';

// Типы прокси-серверов
export type ProxyType = 'http' | 'https' | 'socks4' | 'socks5';

// Интерфейс прокси-сервера
export interface ProxyServer {
    id: string;              // Уникальный UUID
    type: ProxyType;         // Тип прокси
    host: string;            // IP адрес или домен
    port: number;            // Порт
    username?: string;       // Логин (опционально)
    password?: string;       // Пароль (опционально)
    name?: string;           // Человекочитаемое имя (опционально)
    color?: string;          // Цветовой маркер (hex, опционально)
    isDefault: boolean;      // Прокси по умолчанию
    createdAt: number;       // Timestamp создания
    updatedAt: number;       // Timestamp обновления
}

// Темы
export type ThemeType = 'light' | 'dark';

// Поддерживаемые языки
export type SupportedLanguage = 'en' | 'ru' | 'de' | 'fr' | 'es' | 'zh' | 'ja' | 'pt';

// Идентификаторы вкладок
export type TabId = 'proxy' | 'presets' | 'settings';

// Интерфейс пресета
export interface Preset {
    id: string;           // Уникальный идентификатор (UUID)
    name: string;         // Название пресета
    domains: string[];    // Список доменов
    enabled: boolean;     // Активен ли пресет
    isDefault: boolean;   // Является ли пресетом по умолчанию (Custom)
    order: number;        // Порядковый номер для сортировки
    proxyId: string | null; // ID прокси или null для использования default
    createdAt: number;    // Timestamp создания
    updatedAt: number;    // Timestamp последнего обновления
}

// Шаблон предустановленного пресета (загружается с GitHub)
export interface PresetTemplate {
    name: string;
    domains: string[];
}

// Структура файла presets.json с GitHub
export interface PresetTemplatesResponse {
    presets: PresetTemplate[];
}

// Синхронизируемые данные (через chrome.storage.sync)
export interface SyncStorageData {
    presets: Preset[];           // Массив пресетов (заменяет domains)
    proxies: ProxyServer[];      // Массив прокси-серверов (заменяет selfProxy)
    theme: ThemeType;
    language: SupportedLanguage;
    syncEnabled: boolean;
    proxyByDefault: boolean;     // Использовать прокси по умолчанию для сайтов вне пресетов
    proxyCheckEnabled: boolean;  // Проверять прокси перед добавлением
}

// Локальные данные (только chrome.storage.local)
export interface LocalStorageData {
    targetState: ProxyStateType;
    currentState: ProxyStateType;
}

// Объединённый тип данных хранилища
export interface StorageData extends SyncStorageData, LocalStorageData {}

// Ключи хранилища
export type StorageKey = keyof StorageData;
export type SyncStorageKey = keyof SyncStorageData;
export type LocalStorageKey = keyof LocalStorageData;

// Сообщения между popup и background
export interface ExtensionMessage {
    action: 'toggleProxy' | 'updateIcon' | 'checkProxy';
    iconPath?: string;
    proxy?: { type: ProxyType; host: string; port: number; username?: string; password?: string };
}

export type CheckProxyResult = 'ok' | 'error' | 'timeout';

// Конфигурация прокси
export interface ProxyConfig {
    host: string;
    port: number;
}

// Изменения в storage
export interface StorageChanges {
    [key: string]: chrome.storage.StorageChange;
}

// Ключи локализации
export type I18nKey =
    | 'extensionName'
    | 'extensionDescription'
    | 'buttonConnect'
    | 'buttonConnected'
    | 'buttonConnecting'
    | 'buttonError'
    | 'labelDomains'
    | 'labelProxy'
    | 'buttonSaveDomains'
    | 'buttonSaveProxy'
    | 'statusSaved'
    | 'labelLanguage'
    | 'placeholderDomain'
    | 'placeholderProxy'
    | 'labelSync'
    | 'syncEnableConfirm'
    | 'syncDisableConfirm'
    | 'syncEnabled'
    | 'syncDisabled'
    | 'labelPresets'
    | 'buttonAddPreset'
    | 'presetNamePlaceholder'
    | 'presetDefault'
    | 'buttonDeletePreset'
    | 'confirmDeletePreset'
    | 'tabProxy'
    | 'tabPresets'
    | 'tabSettings'
    | 'buttonAddProxy'
    | 'labelProxyType'
    | 'labelProxyHost'
    | 'labelProxyPort'
    | 'labelProxyUsername'
    | 'labelProxyPassword'
    | 'labelProxyName'
    | 'labelSelectProxy'
    | 'proxyDefault'
    | 'proxyNone'
    | 'buttonSetDefault'
    | 'confirmDeleteProxy'
    | 'proxyTypeHttp'
    | 'proxyTypeHttps'
    | 'proxyTypeSocks4'
    | 'proxyTypeSocks5'
    | 'buttonSaveProxyServer'
    | 'buttonCancelProxy'
    | 'buttonEditProxy'
    | 'buttonDeleteProxy'
    | 'editProxy'
    | 'addProxy'
    | 'proxyValidationError'
    | 'deleteProxyConfirm'
    | 'proxyServersTitle'
    | 'defaultProxy'
    | 'setDefault'
    | 'proxyName'
    | 'proxyColor'
    | 'proxyType'
    | 'proxyHost'
    | 'proxyPort'
    | 'proxyAuth'
    | 'proxyUsername'
    | 'proxyPassword'
    | 'cancel'
    | 'continue'
    | 'save'
    | 'noProxiesConfigured'
    | 'labelProxyByDefault'
    | 'labelProxyByDefaultActive'
    | 'ignoreListName'
    | 'placeholderIgnoreList'
    | 'labelImportExport'
    | 'buttonExport'
    | 'buttonImport'
    | 'exportError'
    | 'importValidationError'
    | 'importConfirm'
    | 'importSuccess'
    | 'invalidJson'
    | 'invalidStructure'
    | 'missingVersion'
    | 'newerVersion'
    | 'newerVersionConfirm'
    | 'missingData'
    | 'invalidPresets'
    | 'invalidPresetStructure'
    | 'invalidProxies'
    | 'invalidProxyStructure'
    | 'presetTypeDialogTitle'
    | 'presetTypeCreateOwn'
    | 'presetTypeSelectPreset'
    | 'presetListTitle'
    | 'presetSearchPlaceholder'
    | 'presetListLoading'
    | 'presetListError'
    | 'presetListEmpty'
    | 'presetListRetry'
    | 'alertTitle'
    | 'confirmTitle'
    | 'ok'
    | 'presetDomainsCount'
    | 'proxyTypeDialogTitle'
    | 'proxyTypeAddOwn'
    | 'proxyTypeSelectPublic'
    | 'publicProxiesTitle'
    | 'filterProtocol'
    | 'filterConnectionType'
    | 'filterCountry'
    | 'filterMinScore'
    | 'filterAll'
    | 'connectionTypeResidential'
    | 'connectionTypeCorporate'
    | 'connectionTypeMobile'
    | 'publicProxySearchPlaceholder'
    | 'publicProxiesLoading'
    | 'publicProxiesError'
    | 'publicProxiesEmpty'
    | 'publicProxiesRetry'
    | 'publicProxiesWarning'
    | 'publicProxiesRecommendation'
    | 'checkProxy'
    | 'checkProxyChecking'
    | 'checkProxyOk'
    | 'checkProxyError'
    | 'checkProxyTimeout'
    | 'proxyCheckFailedTitle'
    | 'saveAnyway'
    | 'labelProxyCheck'
    | 'labelVersion';

// Структура экспортируемых данных
export interface ExportData {
    version: number;                    // Версия формата для совместимости
    exportedAt: string;                 // ISO timestamp экспорта
    extensionVersion: string;           // Версия расширения
    data: {
        presets: Preset[];              // Все пресеты
        proxies: ProxyServer[];         // Все прокси-серверы
        theme: ThemeType;               // Тема оформления
        language: SupportedLanguage;    // Язык интерфейса
        proxyByDefault: boolean;        // Настройка прокси по умолчанию
        proxyCheckEnabled: boolean;     // Проверка прокси перед добавлением
    };
}

// Результат валидации импорта
export interface ImportValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    data?: ExportData;
}

// Публичный прокси из JSON (CDN)
export interface PublicProxy {
    ip: string;      // "41.223.119.156:3128"
    score: number;   // 3.6 - рейтинг
    type: string;    // "Mobile" | "Residential" | "Corporate"
    country: string; // "ZM" - ISO 3166-1 alpha-2 код страны
}

// Структура ответа от CDN
export interface PublicProxiesResponse {
    http: PublicProxy[];
    https: PublicProxy[];
    socks4: PublicProxy[];
    socks5: PublicProxy[];
}

// Нормализованный прокси для отображения
export interface NormalizedPublicProxy {
    protocol: ProxyType;    // http, https, socks4, socks5
    ip: string;             // IP адрес
    port: number;           // Порт
    score: number;          // Рейтинг
    connectionType: string; // residential, corporate, mobile (lowercase)
    country: string;        // Код страны ISO
}

// Состояние фильтров публичных прокси
export interface PublicProxyFilters {
    protocol?: ProxyType | '';
    connectionType?: string;
    country?: string;
    minScore?: number;
}