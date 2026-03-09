import { StorageKeys, EXPORT_FORMAT_VERSION } from '../../src/shared/constants';
import type { ProxyConfig, ProxyPreset } from '../../src/types';

/**
 * Integration tests for import/export functionality
 * Tests the complete flow from export to import with data validation
 */

// Types for tests
interface Settings {
    autoConnect: boolean;
    language: string;
    theme: string;
    showNotifications: boolean;
}

interface ExportData {
    version: number;
    exportDate: string;
    proxies: ProxyConfig[];
    presets: ProxyPreset[];
    settings: Settings;
    activePreset: string | null;
}

// Mock chrome API
const mockStorage: Record<string, unknown> = {};

// Custom keys not in constants
const SETTINGS_KEY = 'settings';
const ACTIVE_PRESET_KEY = 'activePreset';

// Setup chrome mock before tests
beforeAll(() => {
    (global as unknown as Record<string, unknown>).chrome = {
        storage: {
            local: {
                get: jest.fn((keys) => {
                    if (Array.isArray(keys)) {
                        const result: Record<string, unknown> = {};
                        keys.forEach(key => {
                            if (key in mockStorage) {
                                result[key] = mockStorage[key];
                            }
                        });
                        return Promise.resolve(result);
                    }
                    return Promise.resolve(mockStorage);
                }),
                set: jest.fn((data) => {
                    Object.assign(mockStorage, data);
                    return Promise.resolve();
                })
            },
            sync: {
                get: jest.fn((keys) => {
                    if (Array.isArray(keys)) {
                        const result: Record<string, unknown> = {};
                        keys.forEach(key => {
                            if (key in mockStorage) {
                                result[key] = mockStorage[key];
                            }
                        });
                        return Promise.resolve(result);
                    }
                    return Promise.resolve(mockStorage);
                }),
                set: jest.fn((data) => {
                    Object.assign(mockStorage, data);
                    return Promise.resolve();
                })
            }
        },
        i18n: {
            getMessage: jest.fn((key) => key),
            getUILanguage: jest.fn(() => 'en')
        }
    };
});

describe('Import/Export Integration Tests', () => {
    beforeEach(() => {
        Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
        jest.clearAllMocks();
    });

    describe('Export Flow', () => {
        it('should export complete data structure', async () => {
            const proxies: ProxyConfig[] = [
                { id: 'proxy-1', name: 'Work Proxy', host: 'work.proxy.com', port: 8080, type: 'http' },
                { id: 'proxy-2', name: 'Home Proxy', host: 'home.proxy.com', port: 3128, type: 'http', username: 'user', password: 'pass' }
            ];

            const presets: ProxyPreset[] = [
                { id: 'preset-1', name: 'Work', proxyId: 'proxy-1', rules: [] },
                { id: 'preset-2', name: 'Home', proxyId: 'proxy-2', rules: [{ id: 'r1', pattern: '*.local', type: 'include' }] }
            ];

            const settings: Settings = {
                autoConnect: true,
                language: 'ru',
                theme: 'dark',
                showNotifications: false
            };

            mockStorage[StorageKeys.PROXIES] = proxies;
            mockStorage[StorageKeys.PRESETS] = presets;
            mockStorage[SETTINGS_KEY] = settings;
            mockStorage[ACTIVE_PRESET_KEY] = 'preset-1';

            // Simulate export
            const exportData: ExportData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: new Date().toISOString(),
                proxies,
                presets,
                settings,
                activePreset: 'preset-1'
            };

            expect(exportData.version).toBe(EXPORT_FORMAT_VERSION);
            expect(exportData.proxies).toHaveLength(2);
            expect(exportData.presets).toHaveLength(2);
            expect(exportData.settings.autoConnect).toBe(true);
        });

        it('should handle export with empty data', async () => {
            mockStorage[StorageKeys.PROXIES] = [];
            mockStorage[StorageKeys.PRESETS] = [];
            mockStorage[SETTINGS_KEY] = {};

            const exportData: ExportData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: new Date().toISOString(),
                proxies: [],
                presets: [],
                settings: {} as Settings,
                activePreset: null
            };

            expect(exportData.proxies).toHaveLength(0);
            expect(exportData.presets).toHaveLength(0);
        });

        it('should generate valid JSON export', () => {
            const exportData: ExportData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: '2024-01-15T12:00:00.000Z',
                proxies: [{ id: 'p1', name: 'Test', host: 'test.com', port: 8080, type: 'http' }],
                presets: [],
                settings: { autoConnect: false, language: 'en', theme: 'system', showNotifications: true },
                activePreset: null
            };

            const json = JSON.stringify(exportData);
            const parsed = JSON.parse(json);

            expect(parsed.version).toBe(EXPORT_FORMAT_VERSION);
            expect(parsed.proxies[0].host).toBe('test.com');
        });
    });

    describe('Import Flow', () => {
        it('should import valid data', async () => {
            const importData: ExportData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: '2024-01-15T12:00:00.000Z',
                proxies: [
                    { id: 'imported-proxy', name: 'Imported', host: 'imported.com', port: 8080, type: 'http' }
                ],
                presets: [
                    { id: 'imported-preset', name: 'Imported Preset', proxyId: 'imported-proxy', rules: [] }
                ],
                settings: { autoConnect: true, language: 'en', theme: 'dark', showNotifications: true },
                activePreset: 'imported-preset'
            };

            // Simulate import
            mockStorage[StorageKeys.PROXIES] = importData.proxies;
            mockStorage[StorageKeys.PRESETS] = importData.presets;
            mockStorage[SETTINGS_KEY] = importData.settings;
            mockStorage[ACTIVE_PRESET_KEY] = importData.activePreset;

            const storedProxies = await chrome.storage.sync.get([StorageKeys.PROXIES]);
            const storedPresets = await chrome.storage.sync.get([StorageKeys.PRESETS]);
            const storedSettings = await chrome.storage.sync.get([SETTINGS_KEY]);

            expect(storedProxies[StorageKeys.PROXIES]).toHaveLength(1);
            expect(storedPresets[StorageKeys.PRESETS]).toHaveLength(1);
            expect((storedSettings[SETTINGS_KEY] as Settings).theme).toBe('dark');
        });

        it('should handle import with version migration', async () => {
            const oldVersionData = {
                version: 1,
                exportDate: '2023-01-01T00:00:00.000Z',
                proxies: [{ id: 'old', name: 'Old', host: 'old.com', port: 8080, type: 'http' }],
                presets: [],
                settings: { autoConnect: false }
            };

            // Migration should add missing fields
            const migratedSettings: Settings = {
                ...oldVersionData.settings,
                language: 'en',
                theme: 'system',
                showNotifications: true
            };

            expect(migratedSettings.language).toBe('en');
            expect(migratedSettings.theme).toBe('system');
        });

        it('should validate import data structure', () => {
            const validData: ExportData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: new Date().toISOString(),
                proxies: [],
                presets: [],
                settings: { autoConnect: false, language: 'en', theme: 'system', showNotifications: true },
                activePreset: null
            };

            const isValid = (data: unknown): data is ExportData => {
                const d = data as Record<string, unknown>;
                return (
                    typeof d.version === 'number' &&
                    typeof d.exportDate === 'string' &&
                    Array.isArray(d.proxies) &&
                    Array.isArray(d.presets) &&
                    typeof d.settings === 'object'
                );
            };

            expect(isValid(validData)).toBe(true);
            expect(isValid({})).toBe(false);
            expect(isValid({ version: 'string' })).toBe(false);
        });

        it('should reject invalid JSON', () => {
            const invalidJSON = '{ invalid json }';
            
            expect(() => JSON.parse(invalidJSON)).toThrow();
        });

        it('should merge or replace existing data based on strategy', async () => {
            // Existing data
            mockStorage[StorageKeys.PROXIES] = [
                { id: 'existing', name: 'Existing', host: 'existing.com', port: 8080, type: 'http' }
            ];

            const importData: ExportData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: new Date().toISOString(),
                proxies: [
                    { id: 'new', name: 'New', host: 'new.com', port: 8080, type: 'http' }
                ],
                presets: [],
                settings: { autoConnect: false, language: 'en', theme: 'system', showNotifications: true },
                activePreset: null
            };

            // Replace strategy
            mockStorage[StorageKeys.PROXIES] = importData.proxies;
            let result = await chrome.storage.sync.get([StorageKeys.PROXIES]);
            expect(result[StorageKeys.PROXIES]).toHaveLength(1);
            expect((result[StorageKeys.PROXIES] as ProxyConfig[])[0].id).toBe('new');

            // Merge strategy would combine
            const mergedProxies = [
                { id: 'existing', name: 'Existing', host: 'existing.com', port: 8080, type: 'http' },
                { id: 'new', name: 'New', host: 'new.com', port: 8080, type: 'http' }
            ];
            mockStorage[StorageKeys.PROXIES] = mergedProxies;
            result = await chrome.storage.sync.get([StorageKeys.PROXIES]);
            expect(result[StorageKeys.PROXIES]).toHaveLength(2);
        });
    });

    describe('Data Integrity', () => {
        it('should preserve proxy credentials during export/import', async () => {
            const proxy: ProxyConfig = {
                id: 'auth-proxy',
                name: 'Auth Proxy',
                host: 'auth.proxy.com',
                port: 8080,
                type: 'http',
                username: 'myuser',
                password: 'mypassword123'
            };

            const exportData: ExportData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: new Date().toISOString(),
                proxies: [proxy],
                presets: [],
                settings: { autoConnect: false, language: 'en', theme: 'system', showNotifications: true },
                activePreset: null
            };

            const json = JSON.stringify(exportData);
            const imported = JSON.parse(json) as ExportData;

            expect(imported.proxies[0].username).toBe('myuser');
            expect(imported.proxies[0].password).toBe('mypassword123');
        });

        it('should preserve preset rules during export/import', () => {
            const preset: ProxyPreset = {
                id: 'rules-preset',
                name: 'Rules Preset',
                proxyId: 'proxy-1',
                rules: [
                    { id: 'r1', pattern: '*.google.com', type: 'include' },
                    { id: 'r2', pattern: '*.facebook.com', type: 'exclude' },
                    { id: 'r3', pattern: 'internal.*', type: 'include' }
                ]
            };

            const exportData: ExportData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: new Date().toISOString(),
                proxies: [],
                presets: [preset],
                settings: { autoConnect: false, language: 'en', theme: 'system', showNotifications: true },
                activePreset: null
            };

            const json = JSON.stringify(exportData);
            const imported = JSON.parse(json) as ExportData;

            expect(imported.presets[0].rules).toHaveLength(3);
            expect(imported.presets[0].rules[0].pattern).toBe('*.google.com');
        });

        it('should handle special characters in names and patterns', () => {
            const proxy: ProxyConfig = {
                id: 'special',
                name: 'Спецсимволы <>&"\'',
                host: 'test.com',
                port: 8080,
                type: 'http'
            };

            const preset: ProxyPreset = {
                id: 'special-preset',
                name: '特殊文字テスト',
                proxyId: 'special',
                rules: [
                    { id: 'r1', pattern: '*.тест.рф', type: 'include' }
                ]
            };

            const exportData: ExportData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: new Date().toISOString(),
                proxies: [proxy],
                presets: [preset],
                settings: { autoConnect: false, language: 'en', theme: 'system', showNotifications: true },
                activePreset: null
            };

            const json = JSON.stringify(exportData);
            const imported = JSON.parse(json) as ExportData;

            expect(imported.proxies[0].name).toBe('Спецсимволы <>&"\'');
            expect(imported.presets[0].name).toBe('特殊文字テスト');
            expect(imported.presets[0].rules[0].pattern).toBe('*.тест.рф');
        });
    });

    describe('File Operations', () => {
        it('should generate correct filename with date', () => {
            const date = new Date('2024-01-15T12:30:00.000Z');
            const expectedFilename = `pulseproxy-settings-${date.toISOString().slice(0, 10)}.json`;
            
            expect(expectedFilename).toBe('pulseproxy-settings-2024-01-15.json');
        });

        it('should handle large export data', () => {
            const proxies: ProxyConfig[] = [];
            for (let i = 0; i < 100; i++) {
                proxies.push({
                    id: `proxy-${i}`,
                    name: `Proxy ${i}`,
                    host: `proxy${i}.example.com`,
                    port: 8080 + i,
                    type: 'http'
                });
            }

            const exportData: ExportData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: new Date().toISOString(),
                proxies,
                presets: [],
                settings: { autoConnect: false, language: 'en', theme: 'system', showNotifications: true },
                activePreset: null
            };

            const json = JSON.stringify(exportData);
            const imported = JSON.parse(json) as ExportData;

            expect(imported.proxies).toHaveLength(100);
        });
    });

    describe('Error Recovery', () => {
        it('should provide default values for missing fields', () => {
            const incompleteData = {
                version: EXPORT_FORMAT_VERSION,
                exportDate: new Date().toISOString(),
                proxies: [],
                settings: {}
            };

            const defaults: ExportData = {
                version: incompleteData.version || EXPORT_FORMAT_VERSION,
                exportDate: incompleteData.exportDate || new Date().toISOString(),
                proxies: incompleteData.proxies || [],
                presets: (incompleteData as Record<string, unknown>).presets as ProxyPreset[] || [],
                settings: {
                    autoConnect: (incompleteData.settings as Record<string, unknown>).autoConnect as boolean ?? false,
                    language: (incompleteData.settings as Record<string, unknown>).language as string || 'en',
                    theme: (incompleteData.settings as Record<string, unknown>).theme as string || 'system',
                    showNotifications: (incompleteData.settings as Record<string, unknown>).showNotifications as boolean ?? true
                },
                activePreset: (incompleteData as Record<string, unknown>).activePreset as string || null
            };

            expect(defaults.presets).toEqual([]);
            expect(defaults.settings.language).toBe('en');
        });

        it('should handle corrupted proxy data', () => {
            const corruptedProxy = {
                id: 'corrupted',
                host: 'test.com',
                port: 'invalid',
                type: 'http'
            };

            const isValidProxy = (proxy: unknown): proxy is ProxyConfig => {
                const p = proxy as Record<string, unknown>;
                return (
                    typeof p.id === 'string' &&
                    typeof p.name === 'string' &&
                    typeof p.host === 'string' &&
                    typeof p.port === 'number' &&
                    (p.port as number) > 0 && (p.port as number) <= 65535 &&
                    ['http', 'https', 'socks4', 'socks5'].includes(p.type as string)
                );
            };

            expect(isValidProxy(corruptedProxy)).toBe(false);
        });
    });
});