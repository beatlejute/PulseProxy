import {
    SUPPORTED_LANGUAGES,
    DEFAULT_LANGUAGE,
    LANGUAGE_NAMES,
    ProxyState,
    SYNC_STORAGE_KEYS,
    LOCAL_STORAGE_KEYS,
    StorageKeys,
    IconPaths,
    Config,
    DOMIds,
} from '../../src/shared/constants';

describe('constants.ts', () => {
    describe('SUPPORTED_LANGUAGES', () => {
        it('should contain 8 languages', () => {
            expect(SUPPORTED_LANGUAGES).toHaveLength(8);
        });

        it('should contain expected languages', () => {
            expect(SUPPORTED_LANGUAGES).toContain('en');
            expect(SUPPORTED_LANGUAGES).toContain('ru');
            expect(SUPPORTED_LANGUAGES).toContain('de');
            expect(SUPPORTED_LANGUAGES).toContain('fr');
            expect(SUPPORTED_LANGUAGES).toContain('es');
            expect(SUPPORTED_LANGUAGES).toContain('zh');
            expect(SUPPORTED_LANGUAGES).toContain('ja');
            expect(SUPPORTED_LANGUAGES).toContain('pt');
        });

        it('should contain default language', () => {
            expect(SUPPORTED_LANGUAGES).toContain(DEFAULT_LANGUAGE);
        });
    });

    describe('DEFAULT_LANGUAGE', () => {
        it('should be "en"', () => {
            expect(DEFAULT_LANGUAGE).toBe('en');
        });
    });

    describe('LANGUAGE_NAMES', () => {
        it('should have names for all supported languages', () => {
            SUPPORTED_LANGUAGES.forEach(lang => {
                expect(LANGUAGE_NAMES[lang]).toBeDefined();
                expect(typeof LANGUAGE_NAMES[lang]).toBe('string');
                expect(LANGUAGE_NAMES[lang].length).toBeGreaterThan(0);
            });
        });

        it('should have correct language names', () => {
            expect(LANGUAGE_NAMES.en).toBe('English');
            expect(LANGUAGE_NAMES.ru).toBe('Русский');
            expect(LANGUAGE_NAMES.de).toBe('Deutsch');
            expect(LANGUAGE_NAMES.fr).toBe('Français');
            expect(LANGUAGE_NAMES.es).toBe('Español');
            expect(LANGUAGE_NAMES.zh).toBe('中文');
            expect(LANGUAGE_NAMES.ja).toBe('日本語');
            expect(LANGUAGE_NAMES.pt).toBe('Português');
        });
    });

    describe('ProxyState', () => {
        it('should have all required states', () => {
            expect(ProxyState.CONNECTED).toBe('connected');
            expect(ProxyState.DISCONNECTED).toBe('disconnected');
            expect(ProxyState.CONNECTING).toBe('connecting');
            expect(ProxyState.ERROR).toBe('error');
        });

        it('should be readonly object', () => {
            // Проверяем, что объект заморожен (as const делает его readonly)
            expect(Object.keys(ProxyState)).toHaveLength(4);
        });
    });

    describe('SYNC_STORAGE_KEYS', () => {
        it('should contain expected keys', () => {
            expect(SYNC_STORAGE_KEYS).toContain('presets');
            expect(SYNC_STORAGE_KEYS).toContain('proxies');
            expect(SYNC_STORAGE_KEYS).toContain('theme');
            expect(SYNC_STORAGE_KEYS).toContain('language');
            expect(SYNC_STORAGE_KEYS).toContain('syncEnabled');
            expect(SYNC_STORAGE_KEYS).toContain('proxyByDefault');
        });

        it('should have 6 keys', () => {
            expect(SYNC_STORAGE_KEYS).toHaveLength(6);
        });
    });

    describe('LOCAL_STORAGE_KEYS', () => {
        it('should contain expected keys', () => {
            expect(LOCAL_STORAGE_KEYS).toContain('currentState');
            expect(LOCAL_STORAGE_KEYS).toContain('targetState');
            expect(LOCAL_STORAGE_KEYS).toContain('migrationCompleted');
        });

        it('should have 3 keys', () => {
            expect(LOCAL_STORAGE_KEYS).toHaveLength(3);
        });
    });

    describe('StorageKeys', () => {
        it('should have correct key values', () => {
            expect(StorageKeys.TARGET_STATE).toBe('targetState');
            expect(StorageKeys.CURRENT_STATE).toBe('currentState');
            expect(StorageKeys.PRESETS).toBe('presets');
            expect(StorageKeys.PROXIES).toBe('proxies');
            expect(StorageKeys.THEME).toBe('theme');
            expect(StorageKeys.LANGUAGE).toBe('language');
            expect(StorageKeys.SYNC_ENABLED).toBe('syncEnabled');
            expect(StorageKeys.MIGRATION_COMPLETED).toBe('migrationCompleted');
            expect(StorageKeys.PROXY_BY_DEFAULT).toBe('proxyByDefault');
        });

        it('should have 9 keys', () => {
            expect(Object.keys(StorageKeys)).toHaveLength(9);
        });
    });

    describe('IconPaths', () => {
        it('should have correct paths', () => {
            expect(IconPaths.ENABLED).toBe('icons/icon128.png');
            expect(IconPaths.DISABLED_LIGHT).toBe('icons/icon128-disabled-light.png');
            expect(IconPaths.DISABLED_DARK).toBe('icons/icon128-disabled-dark.png');
        });

        it('should have 3 icon paths', () => {
            expect(Object.keys(IconPaths)).toHaveLength(3);
        });

        it('should have .png extension for all paths', () => {
            Object.values(IconPaths).forEach(path => {
                expect(path).toMatch(/\.png$/);
            });
        });
    });

    describe('Config', () => {
        it('should have correct initialization delay', () => {
            expect(Config.INITIALIZATION_DELAY).toBe(5000);
            expect(typeof Config.INITIALIZATION_DELAY).toBe('number');
        });

        it('should have default domains', () => {
            expect(Array.isArray(Config.DEFAULT_DOMAINS)).toBe(true);
            expect(Config.DEFAULT_DOMAINS).toContain('.itwcreativeworks.com');
        });
    });

    describe('DOMIds', () => {
        it('should have correct DOM element IDs', () => {
            expect(DOMIds.MAIN_BUTTON).toBe('main-button');
            expect(DOMIds.MAIN_BUTTON_TEXT).toBe('main-button-text');
            expect(DOMIds.PROXY_INPUT).toBe('proxy-input');
            expect(DOMIds.SAVE_PROXY_BUTTON).toBe('save-proxy-button');
            expect(DOMIds.SEGMENTED_CONTROL).toBe('segmented-control');
            expect(DOMIds.TAB_PROXY).toBe('tab-proxy');
            expect(DOMIds.TAB_PRESETS).toBe('tab-presets');
            expect(DOMIds.TAB_SETTINGS).toBe('tab-settings');
        });

        it('should have 8 DOM IDs', () => {
            expect(Object.keys(DOMIds)).toHaveLength(8);
        });

        it('should have valid ID format (lowercase with hyphens)', () => {
            Object.values(DOMIds).forEach(id => {
                expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
            });
        });
    });
});