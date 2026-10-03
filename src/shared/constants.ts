import { ProxyStateType, ProxyType, SupportedLanguage } from '../types';

// Типы прокси для выбора
export const PROXY_TYPES: ProxyType[] = ['http', 'https', 'socks4', 'socks5'];

// Поддерживаемые языки
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['en', 'ru', 'de', 'fr', 'es', 'zh', 'ja', 'pt'];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
    en: 'English',
    ru: 'Русский',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    zh: '中文',
    ja: '日本語',
    pt: 'Português',
};

// Состояния прокси
export const ProxyState = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    ERROR: 'error',
} as const satisfies Record<string, ProxyStateType>;

// Ключи для синхронизируемых данных (chrome.storage.sync)
export const SYNC_STORAGE_KEYS = ['presets', 'proxies', 'theme', 'language', 'syncEnabled', 'proxyByDefault', 'proxyCheckEnabled'] as const;

// Ключи для локальных данных (chrome.storage.local)
export const LOCAL_STORAGE_KEYS = ['currentState', 'targetState', 'migrationCompleted', 'errorProxy', 'publicProxiesWarningDismissed', 'publicProxiesFiltersCollapsed', 'publicProxyCheckResults', 'publicProxyCatalog', 'publicPoolGeoExclusions', 'publicPoolGeoSites'] as const;

// ID пресета по умолчанию (Custom)
export const DEFAULT_PRESET_ID = 'default-custom-preset';

// Ключи хранилища
export const StorageKeys = {
    TARGET_STATE: 'targetState',
    CURRENT_STATE: 'currentState',
    PRESETS: 'presets',
    PROXIES: 'proxies',
    THEME: 'theme',
    LANGUAGE: 'language',
    SYNC_ENABLED: 'syncEnabled',
    MIGRATION_COMPLETED: 'migrationCompleted',
    PROXY_BY_DEFAULT: 'proxyByDefault',
    PROXY_CHECK_ENABLED: 'proxyCheckEnabled',
    ERROR_PROXY: 'errorProxy',
    PUBLIC_PROXIES_WARNING_DISMISSED: 'publicProxiesWarningDismissed',
    PUBLIC_PROXIES_FILTERS_COLLAPSED: 'publicProxiesFiltersCollapsed',
    PUBLIC_PROXY_CHECK_RESULTS: 'publicProxyCheckResults',
    PUBLIC_PROXY_CATALOG: 'publicProxyCatalog',
    // Исключения пула по гео-блоку: машинно-специфичны, в SYNC_STORAGE_KEYS не попадают
    PUBLIC_POOL_GEO_EXCLUSIONS: 'publicPoolGeoExclusions',
    // Серии блокировок по сайтам: машинно-специфичны, в SYNC_STORAGE_KEYS не попадают
    PUBLIC_POOL_GEO_SITES: 'publicPoolGeoSites',
} as const;

// Фоновая проверка публичных прокси
export const PublicProxyCheckConfig = {
    BATCH_SIZE: 20,                      // Прокси в одном батче (параллельные проверки)
    CACHE_TTL_MS: 24 * 60 * 60 * 1000,   // Срок жизни результата проверки — сутки
    BUSY_RETRY_DELAY_MS: 2000,           // Пауза перед повтором, если mutex проверки занят
    SUSPEND_POLL_MS: 300,                // Период опроса флага приостановки сессии
} as const;

export const PublicPoolCheckConfig = {
    ALARM_NAME: 'public_pool_check',
    CHECK_INTERVAL_MIN: 15,
    RECHECK_INTERVAL_MS: 15 * 60 * 1000,
    MAX_PER_CYCLE: 100,
    BUSY_RETRIES: 3,
    ERROR_RECHECK_DEBOUNCE_MS: 60 * 1000,
    MAX_MEMBERS: 200,
    CHAIN_LENGTH: 3,
    CATALOG_TTL_MS: 6 * 60 * 60 * 1000,
    CATALOG_FETCH_TIMEOUT_MS: 10000,
    EMPTY_POOL_SENTINEL: 'PROXY 127.0.0.1:9',
    DEFAULT_PROTOCOLS: ['socks5'] as ProxyType[],
    BADGE_TEXT: '🌐',
    BADGE_COLOR: '#845EF7',
} as const;

// Пути к иконкам
export const IconPaths = {
    ENABLED: 'icons/icon128.png',
    CONNECTING: 'icons/icon128-connecting.png',
    DISABLED_LIGHT: 'icons/icon128-disabled-light.png',
    DISABLED_DARK: 'icons/icon128-disabled-dark.png',
} as const;

// Конфигурация
export const Config = {
    INITIALIZATION_DELAY: 5000,
    DEFAULT_DOMAINS: ['.itwcreativeworks.com'],
} as const;

// ID элементов DOM
export const DOMIds = {
    MAIN_BUTTON: 'main-button',
    MAIN_BUTTON_TEXT: 'main-button-text',
    PROXY_INPUT: 'proxy-input',
    SAVE_PROXY_BUTTON: 'save-proxy-button',
    SEGMENTED_CONTROL: 'segmented-control',
    TAB_PROXY: 'tab-proxy',
    TAB_PRESETS: 'tab-presets',
    TAB_SETTINGS: 'tab-settings',
    OPEN_IN_TAB_BUTTON: 'open-in-tab-button',
} as const;

// Предопределённые цвета маркеров для прокси
export const PROXY_COLORS = [
    '#FF6B6B', // красный
    '#FF922B', // оранжевый
    '#FCC419', // жёлтый
    '#51CF66', // зелёный
    '#22B8CF', // голубой
    '#339AF0', // синий
    '#845EF7', // фиолетовый
    '#E64980', // розовый
] as const;

// Версия формата экспорта
export const EXPORT_FORMAT_VERSION = 1;
// Гео-блок: константы классификатора
export const GeoBlockConfig = {
  POOL_STATUS_CODES: [403, 451] as number[],
  OWN_STATUS_CODES: [451] as number[],
  CHALLENGE_HEADER: 'cf-mitigated',
  CHALLENGE_VALUE: 'challenge',
  SITE_STREAK_LIMIT: 5,
  SITE_STOP_MS: 24 * 60 * 60 * 1000,
  BADGE_TEXT: '⛔',
  BADGE_COLOR: '#FF6969',
} as const;

export interface GeoBlockSignature {
  id: string;
  service: string;
  hosts: string[];
  routes: ('pool' | 'own')[];
  requestType: 'main_frame' | 'any';
  signalType: 'status' | 'redirect';
  statusCode?: number;
  redirectHost?: string;
  redirectHostStartsWith?: string;
  redirectPathRegex?: RegExp;
}

export const GeoBlockSignatures: GeoBlockSignature[] = [
  { id: 'chatgpt', service: 'ChatGPT', hosts: ['chatgpt.com'], routes: ['pool', 'own'], requestType: 'main_frame', signalType: 'status', statusCode: 403 },
  { id: 'openai-api', service: 'OpenAI API', hosts: ['api.openai.com'], routes: ['pool', 'own'], requestType: 'any', signalType: 'status', statusCode: 403 },
  { id: 'anthropic-api', service: 'Anthropic API', hosts: ['api.anthropic.com'], routes: ['pool', 'own'], requestType: 'any', signalType: 'status', statusCode: 403 },
  { id: 'claude', service: 'Claude', hosts: ['claude.ai'], routes: ['pool', 'own'], requestType: 'main_frame', signalType: 'redirect', redirectHostStartsWith: 'https://claude.com/app-unavailable-in-region', statusCode: 302 },
  { id: 'netflix', service: 'Netflix', hosts: ['www.netflix.com', 'help.netflix.com'], routes: ['pool', 'own'], requestType: 'main_frame', signalType: 'status', statusCode: 403 },
  { id: 'spotify', service: 'Spotify', hosts: ['accounts.spotify.com'], routes: ['pool', 'own'], requestType: 'main_frame', signalType: 'redirect', redirectHost: 'www.spotify.com', redirectPathRegex: /^\/[^/]+\/why-not-available\//, statusCode: 301 },
  { id: 'any-451', service: 'Any site', hosts: ['*'], routes: ['pool', 'own'], requestType: 'main_frame', signalType: 'status', statusCode: 451 },
  { id: 'any-403-pool', service: 'Any site (pool)', hosts: ['*'], routes: ['pool'], requestType: 'main_frame', signalType: 'status', statusCode: 403 },
];
