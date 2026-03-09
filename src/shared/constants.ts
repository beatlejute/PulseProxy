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
    CONNECTED: 'connected' as ProxyStateType,
    DISCONNECTED: 'disconnected' as ProxyStateType,
    CONNECTING: 'connecting' as ProxyStateType,
    ERROR: 'error' as ProxyStateType,
} as const;

// Ключи для синхронизируемых данных (chrome.storage.sync)
export const SYNC_STORAGE_KEYS = ['presets', 'proxies', 'theme', 'language', 'syncEnabled', 'proxyByDefault'] as const;

// Ключи для локальных данных (chrome.storage.local)
export const LOCAL_STORAGE_KEYS = ['currentState', 'targetState', 'migrationCompleted', 'errorProxy'] as const;

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
    ERROR_PROXY: 'errorProxy',
} as const;

// Пути к иконкам
export const IconPaths = {
    ENABLED: 'icons/icon128.png',
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
} as const;

// Версия формата экспорта
export const EXPORT_FORMAT_VERSION = 1;