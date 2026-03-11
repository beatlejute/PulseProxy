/**
 * TDD тесты для ImportExportService
 * Тестируют функциональность импорта/экспорта данных
 */

import { mockHelpers } from '../setup';
import { ImportExportService } from '../../src/storage/import-export-service';
import { EXPORT_FORMAT_VERSION } from '../../src/shared/constants';
import type { ExportData, Preset, ProxyServer, ThemeType, SupportedLanguage } from '../../src/types';

let ImportExportServiceConstructor: typeof ImportExportService;
let MockPresetRepository: {
    getAll: jest.Mock;
    setAll: jest.Mock;
};
let MockProxyRepository: {
    getAll: jest.Mock;
    setAll: jest.Mock;
};
let MockSettingsRepository: {
    getTheme: jest.Mock;
    setTheme: jest.Mock;
    getLanguage: jest.Mock;
    setLanguage: jest.Mock;
    getProxyByDefault: jest.Mock;
    setProxyByDefault: jest.Mock;
};
let MockStorageBackend: {
    get: jest.Mock;
    set: jest.Mock;
    getMultiple: jest.Mock;
    remove: jest.Mock;
    checkSyncQuota: jest.Mock;
    getSyncBytesInUse: jest.Mock;
};

describe('ImportExportService', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();

        const module = await import('../../src/storage/import-export-service');
        ImportExportServiceConstructor = module.ImportExportService;

        MockPresetRepository = {
            getAll: jest.fn(),
            setAll: jest.fn(),
        };

        MockProxyRepository = {
            getAll: jest.fn(),
            setAll: jest.fn(),
        };

        MockSettingsRepository = {
            getTheme: jest.fn().mockResolvedValue('dark'),
            setTheme: jest.fn().mockResolvedValue(undefined),
            getLanguage: jest.fn().mockResolvedValue('en'),
            setLanguage: jest.fn().mockResolvedValue(undefined),
            getProxyByDefault: jest.fn().mockResolvedValue(false),
            setProxyByDefault: jest.fn().mockResolvedValue(undefined),
        };

        MockStorageBackend = {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue(undefined),
            getMultiple: jest.fn().mockResolvedValue({}),
            remove: jest.fn().mockResolvedValue(undefined),
            checkSyncQuota: jest.fn().mockResolvedValue(undefined),
            getSyncBytesInUse: jest.fn().mockResolvedValue(0),
        };

        const mockChrome = {
            runtime: {
                getManifest: jest.fn().mockReturnValue({ version: '1.0.0' }),
            },
        };
        (global as unknown as Record<string, unknown>).chrome = mockChrome;
    });

    const createMockPreset = (overrides?: Partial<Preset>): Preset => ({
        id: 'preset-1',
        name: 'Test Preset',
        domains: ['example.com'],
        enabled: true,
        isDefault: false,
        order: 0,
        proxyId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    });

    const createMockProxy = (overrides?: Partial<ProxyServer>): ProxyServer => ({
        id: 'proxy-1',
        type: 'http',
        host: 'proxy.example.com',
        port: 8080,
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...overrides,
    });

    const createValidExportData = (): ExportData => ({
        version: EXPORT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        extensionVersion: '1.0.0',
        data: {
            presets: [createMockPreset()],
            proxies: [createMockProxy()],
            theme: 'dark' as ThemeType,
            language: 'en' as SupportedLanguage,
            proxyByDefault: false,
        },
    });

    describe('exportAll()', () => {
        it('should export all data with correct structure', async () => {
            const presets = [createMockPreset({ id: 'preset-1', name: 'Custom Preset' })];
            const proxies = [createMockProxy({ id: 'proxy-1', host: 'test.com', port: 8080 })];

            MockPresetRepository.getAll.mockResolvedValue(presets);
            MockProxyRepository.getAll.mockResolvedValue(proxies);

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = await service.exportAll();

            expect(result.version).toBe(EXPORT_FORMAT_VERSION);
            expect(result.data.presets).toEqual(presets);
            expect(result.data.proxies).toEqual(proxies);
            expect(result.extensionVersion).toBe('1.0.0');
            expect(result.exportedAt).toBeDefined();
        });

        it('should export empty arrays when no data exists', async () => {
            MockPresetRepository.getAll.mockResolvedValue([]);
            MockProxyRepository.getAll.mockResolvedValue([]);

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = await service.exportAll();

            expect(result.data.presets).toHaveLength(0);
            expect(result.data.proxies).toHaveLength(0);
        });

        it('should use default language when not set', async () => {
            MockPresetRepository.getAll.mockResolvedValue([]);
            MockProxyRepository.getAll.mockResolvedValue([]);
            MockSettingsRepository.getLanguage.mockResolvedValue(null);

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = await service.exportAll();

            expect(result.data.language).toBe('en');
        });
    });

    describe('validateImportData()', () => {
        it('should validate correct JSON data', () => {
            const validData = createValidExportData();
            const jsonString = JSON.stringify(validData);

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(jsonString);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
            expect(result.data).toEqual(validData);
        });

        it('should reject invalid JSON', () => {
            const invalidJson = '{ invalid json }';

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(invalidJson);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('invalidJson');
        });

        it('should reject empty string', () => {
            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData('');

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('invalidJson');
        });

        it('should reject non-object JSON', () => {
            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData('"just a string"');

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('invalidStructure');
        });

        it('should reject data without version', () => {
            const invalidData = {
                exportedAt: new Date().toISOString(),
                extensionVersion: '1.0.0',
                data: {
                    presets: [],
                    proxies: [],
                    theme: 'dark',
                    language: 'en',
                    proxyByDefault: false,
                },
            };

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(invalidData));

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('missingVersion');
        });

        it('should warn about newer version', () => {
            const dataWithNewerVersion = {
                version: EXPORT_FORMAT_VERSION + 1,
                exportedAt: new Date().toISOString(),
                extensionVersion: '1.0.0',
                data: {
                    presets: [],
                    proxies: [],
                    theme: 'dark',
                    language: 'en',
                    proxyByDefault: false,
                },
            };

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(dataWithNewerVersion));

            expect(result.valid).toBe(true);
            expect(result.warnings).toContain('newerVersion');
        });

        it('should reject data without data field', () => {
            const invalidData = {
                version: EXPORT_FORMAT_VERSION,
                exportedAt: new Date().toISOString(),
                extensionVersion: '1.0.0',
            };

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(invalidData));

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('missingData');
        });

        it('should reject invalid presets structure', () => {
            const invalidData = {
                version: EXPORT_FORMAT_VERSION,
                exportedAt: new Date().toISOString(),
                extensionVersion: '1.0.0',
                data: {
                    presets: [{ id: 'invalid' }],
                    proxies: [],
                    theme: 'dark',
                    language: 'en',
                    proxyByDefault: false,
                },
            };

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(invalidData));

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('invalidPresetStructure');
        });

        it('should reject invalid proxies structure', () => {
            const invalidData = {
                version: EXPORT_FORMAT_VERSION,
                exportedAt: new Date().toISOString(),
                extensionVersion: '1.0.0',
                data: {
                    presets: [],
                    proxies: [{ id: 'invalid' }],
                    theme: 'dark',
                    language: 'en',
                    proxyByDefault: false,
                },
            };

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(invalidData));

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('invalidProxyStructure');
        });

        it('should accept valid presets and proxies', () => {
            const validData = {
                version: EXPORT_FORMAT_VERSION,
                exportedAt: new Date().toISOString(),
                extensionVersion: '1.0.0',
                data: {
                    presets: [
                        {
                            id: 'preset-1',
                            name: 'Test',
                            domains: ['example.com'],
                            enabled: true,
                            isDefault: false,
                            order: 0,
                            proxyId: null,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                        },
                    ],
                    proxies: [
                        {
                            id: 'proxy-1',
                            type: 'http',
                            host: 'test.com',
                            port: 8080,
                            isDefault: true,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                        },
                    ],
                    theme: 'dark',
                    language: 'en',
                    proxyByDefault: false,
                },
            };

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(validData));

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should handle empty arrays for presets and proxies', () => {
            const validData = createValidExportData();
            validData.data.presets = [];
            validData.data.proxies = [];

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(validData));

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('importAll()', () => {
        it('should replace all data in replace mode', async () => {
            const exportData = createValidExportData();
            exportData.data.presets = [createMockPreset({ id: 'new-preset' })];
            exportData.data.proxies = [createMockProxy({ id: 'new-proxy' })];
            exportData.data.theme = 'light';
            exportData.data.language = 'ru';

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            await service.importAll(exportData, 'replace');

            expect(MockPresetRepository.setAll).toHaveBeenCalledWith(exportData.data.presets);
            expect(MockProxyRepository.setAll).toHaveBeenCalledWith(exportData.data.proxies);
            expect(MockSettingsRepository.setTheme).toHaveBeenCalledWith('light');
            expect(MockSettingsRepository.setLanguage).toHaveBeenCalledWith('ru');
            expect(MockSettingsRepository.setProxyByDefault).toHaveBeenCalledWith(false);
        });

        it('should merge data in merge mode', async () => {
            const existingPresets = [createMockPreset({ id: 'existing-preset' })];
            const existingProxies = [createMockProxy({ id: 'existing-proxy' })];
            const newPresets = [createMockPreset({ id: 'new-preset' })];
            const newProxies = [createMockProxy({ id: 'new-proxy' })];

            MockPresetRepository.getAll.mockResolvedValue(existingPresets);
            MockProxyRepository.getAll.mockResolvedValue(existingProxies);

            const exportData = createValidExportData();
            exportData.data.presets = newPresets;
            exportData.data.proxies = newProxies;

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            await service.importAll(exportData, 'merge');

            expect(MockPresetRepository.setAll).toHaveBeenCalledWith([
                ...existingPresets,
                ...newPresets,
            ]);
            expect(MockProxyRepository.setAll).toHaveBeenCalledWith([
                ...existingProxies,
                ...newProxies,
            ]);
        });

        it('should filter out duplicates in merge mode', async () => {
            const existingPresets = [createMockPreset({ id: 'preset-1' })];
            const existingProxies = [createMockProxy({ id: 'proxy-1' })];

            MockPresetRepository.getAll.mockResolvedValue(existingPresets);
            MockProxyRepository.getAll.mockResolvedValue(existingProxies);

            const exportData = createValidExportData();
            exportData.data.presets = [createMockPreset({ id: 'preset-1' })];
            exportData.data.proxies = [createMockProxy({ id: 'proxy-1' })];

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            await service.importAll(exportData, 'merge');

            expect(MockPresetRepository.setAll).toHaveBeenCalledWith(existingPresets);
            expect(MockProxyRepository.setAll).toHaveBeenCalledWith(existingProxies);
        });

        it('should handle empty import in merge mode', async () => {
            MockPresetRepository.getAll.mockResolvedValue([]);
            MockProxyRepository.getAll.mockResolvedValue([]);

            const exportData = createValidExportData();
            exportData.data.presets = [];
            exportData.data.proxies = [];

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            await service.importAll(exportData, 'merge');

            expect(MockPresetRepository.setAll).toHaveBeenCalledWith([]);
            expect(MockProxyRepository.setAll).toHaveBeenCalledWith([]);
        });
    });

    describe('edge cases', () => {
        it('should handle large preset array validation', () => {
            const largePresets = Array.from({ length: 1000 }, (_, i) =>
                createMockPreset({ id: `preset-${i}`, name: `Preset ${i}` })
            );

            const data = createValidExportData();
            data.data.presets = largePresets;

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(data));

            expect(result.valid).toBe(true);
            expect(result.data?.data.presets).toHaveLength(1000);
        });

        it('should handle unexpected fields in import data', () => {
            const dataWithExtraFields = {
                version: EXPORT_FORMAT_VERSION,
                exportedAt: new Date().toISOString(),
                extensionVersion: '1.0.0',
                extraField: 'should be ignored',
                data: {
                    presets: [createMockPreset()],
                    proxies: [createMockProxy()],
                    theme: 'dark',
                    language: 'en',
                    proxyByDefault: false,
                    extraData: 'also ignored',
                },
            };

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(dataWithExtraFields));

            expect(result.valid).toBe(true);
        });

        it('should handle unicode in preset and proxy names', () => {
            const dataWithUnicode = createValidExportData();
            dataWithUnicode.data.presets = [
                createMockPreset({ id: 'preset-1', name: 'Тестовый пресет' }),
            ];
            dataWithUnicode.data.proxies = [
                createMockProxy({ id: 'proxy-1', name: 'Прокси сервер' }),
            ];

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(dataWithUnicode));

            expect(result.valid).toBe(true);
            expect(result.data?.data.presets[0].name).toBe('Тестовый пресет');
        });

        it('should handle all supported proxy types', () => {
            const dataWithAllProxyTypes = createValidExportData();
            dataWithAllProxyTypes.data.proxies = [
                createMockProxy({ id: 'proxy-1', type: 'http' }),
                createMockProxy({ id: 'proxy-2', type: 'https' }),
                createMockProxy({ id: 'proxy-3', type: 'socks4' }),
                createMockProxy({ id: 'proxy-4', type: 'socks5' }),
            ];

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(dataWithAllProxyTypes));

            expect(result.valid).toBe(true);
        });

        it('should reject invalid proxy type', () => {
            const dataWithInvalidProxyType = createValidExportData();
            dataWithInvalidProxyType.data.proxies = [
                createMockProxy({ id: 'proxy-1', type: 'invalid' as any }),
            ];

            const service = new ImportExportServiceConstructor(
                MockStorageBackend as any,
                MockPresetRepository as any,
                MockProxyRepository as any,
                MockSettingsRepository as any
            );

            const result = service.validateImportData(JSON.stringify(dataWithInvalidProxyType));

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('invalidProxyStructure');
        });
    });
});
