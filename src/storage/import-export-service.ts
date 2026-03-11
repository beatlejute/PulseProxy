import { IImportExportService } from '../types/storage';
import { IStorageBackend } from '../types/storage';
import { IPresetRepository } from '../types/storage';
import { IProxyRepository } from '../types/storage';
import { ISettingsRepository } from '../types/storage';
import { ExportData, ImportValidationResult, Preset, ProxyServer, ThemeType, SupportedLanguage } from '../types';
import { EXPORT_FORMAT_VERSION } from '../shared/constants';

export class ImportExportService implements IImportExportService {
    private storageBackend: IStorageBackend;
    private presetRepository: IPresetRepository;
    private proxyRepository: IProxyRepository;
    private settingsRepository: ISettingsRepository;

    constructor(
        storageBackend: IStorageBackend,
        presetRepository: IPresetRepository,
        proxyRepository: IProxyRepository,
        settingsRepository: ISettingsRepository
    ) {
        this.storageBackend = storageBackend;
        this.presetRepository = presetRepository;
        this.proxyRepository = proxyRepository;
        this.settingsRepository = settingsRepository;
    }

    async exportAll(): Promise<ExportData> {
        const [presets, proxies, theme, language, proxyByDefault] = await Promise.all([
            this.presetRepository.getAll(),
            this.proxyRepository.getAll(),
            this.settingsRepository.getTheme(),
            this.settingsRepository.getLanguage(),
            this.settingsRepository.getProxyByDefault()
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

    validateImportData(jsonString: string): ImportValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonString);
        } catch {
            return { valid: false, errors: ['invalidJson'], warnings: [] };
        }

        if (!parsed || typeof parsed !== 'object') {
            return { valid: false, errors: ['invalidStructure'], warnings: [] };
        }

        const data = parsed as Record<string, unknown>;

        if (typeof data.version !== 'number') {
            errors.push('missingVersion');
        } else if (data.version > EXPORT_FORMAT_VERSION) {
            warnings.push('newerVersion');
        }

        if (!data.data || typeof data.data !== 'object') {
            return { valid: false, errors: ['missingData'], warnings };
        }

        const innerData = data.data as Record<string, unknown>;

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

    async importAll(exportData: ExportData, mode: 'replace' | 'merge'): Promise<void> {
        const { presets, proxies, theme, language, proxyByDefault } = exportData.data;

        if (mode === 'replace') {
            await Promise.all([
                this.presetRepository.setAll(presets),
                this.proxyRepository.setAll(proxies),
                this.settingsRepository.setTheme(theme),
                this.settingsRepository.setLanguage(language),
                this.settingsRepository.setProxyByDefault(proxyByDefault)
            ]);
        } else {
            const existingPresets = await this.presetRepository.getAll();
            const existingProxies = await this.proxyRepository.getAll();

            const existingPresetIds = new Set(existingPresets.map(p => p.id));
            const existingProxyIds = new Set(existingProxies.map(p => p.id));

            const newPresets = presets.filter(p => !existingPresetIds.has(p.id));
            const newProxies = proxies.filter(p => !existingProxyIds.has(p.id));

            await Promise.all([
                this.presetRepository.setAll([...existingPresets, ...newPresets]),
                this.proxyRepository.setAll([...existingProxies, ...newProxies])
            ]);
        }
    }

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
}
