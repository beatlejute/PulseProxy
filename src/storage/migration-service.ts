import { IMigrationService, SyncMergeStats } from '../types/storage';
import { IStorageBackend } from '../types/storage';
import { IPresetRepository } from '../types/storage';
import { Preset, ProxyServer } from '../types';
import { SYNC_STORAGE_KEYS } from '../shared/constants';
import { mergePresets, mergeProxies } from './merge-utils';

// Sync-ключи, участвующие в миграции; сам флаг syncEnabled живёт только в local
const KEYS_TO_MIGRATE = SYNC_STORAGE_KEYS.filter((key) => key !== 'syncEnabled');

// Ключи состояния устройства, ошибочно попадавшие в облако в старых версиях
const LEGACY_SYNC_KEYS = ['targetState', 'currentState'];

/**
 * MigrationService отвечает за миграцию данных между форматами storage
 * и версиями схемы данных
 */
export class MigrationService implements IMigrationService {
    private storageBackend: IStorageBackend;
    private presetRepository: IPresetRepository;

    constructor(storageBackend: IStorageBackend, presetRepository: IPresetRepository) {
        this.storageBackend = storageBackend;
        this.presetRepository = presetRepository;
    }

    /**
     * Выполнить миграцию из старой структуры domains в пресеты
     */
    async migrateFromLegacyDomains(): Promise<void> {
        // Получаем старые данные из обоих storage + уже существующие пресеты
        const [existingPresets, localDomains, syncDomains] = await Promise.all([
            this.storageBackend.get('presets') as Promise<Preset[] | undefined>,
            this.storageBackend.get('domains') as Promise<string[] | undefined>,
            this.getSyncValue('domains') as Promise<string[] | undefined>
        ]);

        const legacyDomains: string[] = syncDomains || localDomains || [];

        // Флаг migrationCompleted живёт только в local, поэтому на втором устройстве
        // (или после переустановки) миграция запускается заново — уже ПОВЕРХ пресетов,
        // синхронизированных из облака. Безусловный setAll затирал их пустым дефолтом,
        // а background затем пушил потерю обратно в облако. Не трогаем пресеты, если
        // они уже есть — создаём дефолтный только на действительно чистом старте.
        const hasModernPresets = Array.isArray(existingPresets) && existingPresets.length > 0;
        if (!hasModernPresets) {
            const customPreset = this.presetRepository.createDefaultPreset(legacyDomains);
            await this.presetRepository.setAll([customPreset]);
        }

        // Удаляем старые поля domains
        await Promise.all([
            this.storageBackend.remove(['domains']),
            this.removeSyncValue('domains')
        ]);

        // Миграция из старого формата selfProxy
        await this.migrateFromLegacyProxy();

        // Устанавливаем флаг завершения миграции
        await this.storageBackend.set('migrationCompleted', true);
    }

    /**
     * Выполнить миграцию из старого формата selfProxy в proxies
     */
    async migrateFromLegacyProxy(): Promise<void> {
        const [localProxy, syncProxy] = await Promise.all([
            this.storageBackend.get('selfProxy') as Promise<string | undefined>,
            this.getSyncValue('selfProxy') as Promise<string | undefined>
        ]);

        const legacyProxy = syncProxy || localProxy;
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

            await this.setProxy(newProxy);
        }

        // Удаляем старые данные
        await Promise.all([
            this.storageBackend.remove(['selfProxy']),
            this.removeSyncValue('selfProxy')
        ]);
    }

    /**
     * Мигрировать данные из local storage в sync при включении синхронизации.
     *
     * Облако не перезаписывается: списки presets/proxies сливаются с облачными
     * без дублей (merge-utils), скаляры берутся локальные (undefined не затирает
     * облачное значение). Квота проверяется до первой записи — при превышении
     * облако остаётся нетронутым, ошибка всплывает в UI (settings.ts).
     */
    async migrateToSync(): Promise<SyncMergeStats> {
        const [localData, cloudData] = await Promise.all([
            this.storageBackend.getMultiple([...KEYS_TO_MIGRATE]),
            this.getSyncValues([...KEYS_TO_MIGRATE]),
        ]);

        const proxyMerge = mergeProxies(
            (cloudData.proxies as ProxyServer[] | undefined) ?? [],
            (localData.proxies as ProxyServer[] | undefined) ?? [],
        );
        const presetMerge = mergePresets(
            (cloudData.presets as Preset[] | undefined) ?? [],
            (localData.presets as Preset[] | undefined) ?? [],
            proxyMerge,
        );
        const mergedPresets = presetMerge.merged;

        const toSync: Record<string, unknown> = {};
        if (proxyMerge.merged.length > 0) toSync.proxies = proxyMerge.merged;
        if (mergedPresets.length > 0) toSync.presets = mergedPresets;
        for (const key of KEYS_TO_MIGRATE) {
            if (key === 'presets' || key === 'proxies') continue;
            const localValue = localData[key];
            if (localValue !== undefined) {
                toSync[key] = localValue;
            }
        }

        for (const [key, value] of Object.entries(toSync)) {
            await this.storageBackend.checkSyncQuota(key, value);
        }

        for (const [key, value] of Object.entries(toSync)) {
            await this.setSyncValue(key, value);
        }

        await this.removeSyncValue(LEGACY_SYNC_KEYS);

        // Слитые списки видны устройству сразу, не дожидаясь syncFromCloud;
        // echo guard в SyncService не даст повторно записать их в облако
        if (toSync.proxies !== undefined) {
            await this.storageBackend.set('proxies', proxyMerge.merged);
        }
        if (toSync.presets !== undefined) {
            await this.storageBackend.set('presets', mergedPresets);
        }

        return {
            received: proxyMerge.received + presetMerge.received,
            added: proxyMerge.added + presetMerge.added,
        };
    }

    /**
     * Мигрировать данные из sync в local storage
     */
    async migrateToLocal(): Promise<void> {
        for (const key of KEYS_TO_MIGRATE) {
            const value = await this.getSyncValue(key);
            if (value !== undefined) {
                await this.storageBackend.set(key, value);
            }
        }
    }

    /**
     * Вспомогательный метод для получения значения из sync storage
     */
    private async getSyncValue(key: string): Promise<unknown> {
        return new Promise((resolve) => {
            chrome.storage.sync.get(key, (result) => {
                resolve(result[key]);
            });
        });
    }

    /**
     * Вспомогательный метод для получения нескольких значений из sync storage
     */
    private async getSyncValues(keys: string[]): Promise<Record<string, unknown>> {
        return new Promise((resolve) => {
            chrome.storage.sync.get(keys, (result) => {
                resolve(result);
            });
        });
    }

    /**
     * Вспомогательный метод для установки значения в sync storage
     */
    private async setSyncValue(key: string, value: unknown): Promise<void> {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Sync write failed for "${key}": ${chrome.runtime.lastError.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Вспомогательный метод для удаления значений из sync storage
     */
    private async removeSyncValue(keys: string | string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.remove(keys, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Sync remove failed: ${chrome.runtime.lastError.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Вспомогательный метод для установки прокси (использует storageBackend напрямую)
     */
    private async setProxy(proxy: ProxyServer): Promise<void> {
        const proxies = await this.getProxies();
        proxies.push(proxy);
        await this.storageBackend.set('proxies', proxies);
    }

    /**
     * Вспомогательный метод для получения всех прокси
     */
    private async getProxies(): Promise<ProxyServer[]> {
        const proxies = await this.storageBackend.get('proxies') as ProxyServer[] | undefined;
        return proxies || [];
    }
}
