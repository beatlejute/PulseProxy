import { IImportExportService } from '../types/storage';
import { IStorageBackend } from '../types/storage';
import { IPresetRepository } from '../types/storage';
import { IProxyRepository } from '../types/storage';
import { ISettingsRepository } from '../types/storage';
import { ExportData, ImportValidationResult, Preset, ProxyServer, ThemeType, SupportedLanguage } from '../types';
import { EXPORT_FORMAT_VERSION, SUPPORTED_LANGUAGES } from '../shared/constants';

const VALID_PROXY_TYPES = ['http', 'https', 'socks4', 'socks5'];

function isValidLanguage(value: unknown): value is SupportedLanguage {
    return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function isValidTheme(value: unknown): value is ThemeType {
    return value === 'light' || value === 'dark';
}

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
        const [presets, proxies, theme, language, proxyByDefault, proxyCheckEnabled] = await Promise.all([
            this.presetRepository.getAll(),
            this.proxyRepository.getAll(),
            this.settingsRepository.getTheme(),
            this.settingsRepository.getLanguage(),
            this.settingsRepository.getProxyByDefault(),
            this.settingsRepository.getProxyCheckEnabled()
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
                proxyByDefault,
                proxyCheckEnabled
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

        // Настройки: раньше не проверялись вовсе и писались как есть — объект вместо
        // theme/language ломал i18n и рендер настроек. Проверяем тип, если поле есть
        // (поля опциональны — отсутствие допустимо, importAll подставит дефолты).
        if (innerData.theme !== undefined && !isValidTheme(innerData.theme)) {
            errors.push('invalidTheme');
        }
        if (innerData.language !== undefined && !isValidLanguage(innerData.language)) {
            errors.push('invalidLanguage');
        }
        if (innerData.proxyByDefault !== undefined && typeof innerData.proxyByDefault !== 'boolean') {
            errors.push('invalidProxyByDefault');
        }
        if (innerData.proxyCheckEnabled !== undefined && typeof innerData.proxyCheckEnabled !== 'boolean') {
            errors.push('invalidProxyCheckEnabled');
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
        const { presets, proxies, theme, language, proxyByDefault, proxyCheckEnabled } = exportData.data;

        if (mode === 'replace') {
            // Настройки применяем только если они валидны (validateImportData уже
            // отсеял неверные типы; здесь дополнительно не пишем undefined при
            // отсутствии поля — сохраняем текущее значение пользователя).
            const tasks: Promise<void>[] = [
                this.presetRepository.setAll(presets),
                this.proxyRepository.setAll(proxies),
                this.settingsRepository.setProxyCheckEnabled(
                    typeof proxyCheckEnabled === 'boolean' ? proxyCheckEnabled : true
                ),
            ];
            if (isValidTheme(theme)) {
                tasks.push(this.settingsRepository.setTheme(theme));
            }
            if (isValidLanguage(language)) {
                tasks.push(this.settingsRepository.setLanguage(language));
            }
            if (typeof proxyByDefault === 'boolean') {
                tasks.push(this.settingsRepository.setProxyByDefault(proxyByDefault));
            }
            await Promise.all(tasks);
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
            // Каждый домен обязан быть строкой: не-строка (объект/число) доходила бы
            // до matchesDomain/toASCII в background и роняла роутинг на каждом запросе.
            p.domains.every((d) => typeof d === 'string') &&
            typeof p.enabled === 'boolean' &&
            typeof p.isDefault === 'boolean' &&
            typeof p.order === 'number' &&
            // proxyId опционален, но если задан — строка или null
            (p.proxyId === undefined || p.proxyId === null || typeof p.proxyId === 'string')
        );
    }

    private isValidProxy(proxy: unknown): proxy is ProxyServer {
        if (!proxy || typeof proxy !== 'object') return false;
        const p = proxy as Record<string, unknown>;
        return (
            typeof p.id === 'string' &&
            typeof p.type === 'string' &&
            VALID_PROXY_TYPES.includes(p.type as string) &&
            // Непустой host и порт-целое в допустимом диапазоне: раньше проходили
            // пустой host, порт 99999/-1/1.5/NaN — из них генерировался нерабочий PAC.
            typeof p.host === 'string' &&
            p.host.trim().length > 0 &&
            typeof p.port === 'number' &&
            Number.isInteger(p.port) &&
            p.port >= 1 &&
            p.port <= 65535 &&
            typeof p.isDefault === 'boolean' &&
            // Креды опциональны, но если заданы — строки
            (p.username === undefined || typeof p.username === 'string') &&
            (p.password === undefined || typeof p.password === 'string')
        );
    }
}
