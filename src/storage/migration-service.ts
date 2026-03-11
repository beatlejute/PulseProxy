import { IMigrationService } from '../types/storage';
import { IStorageBackend } from '../types/storage';
import { IPresetRepository } from '../types/storage';
import { ProxyServer } from '../types';

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
        // Получаем старые данные из обоих storage
        const [localDomains, syncDomains] = await Promise.all([
            this.storageBackend.get('domains') as Promise<string[] | undefined>,
            this.getSyncValue('domains') as Promise<string[] | undefined>
        ]);

        const legacyDomains: string[] = syncDomains || localDomains || [];

        // Создаём дефолтный пресет
        const customPreset = this.presetRepository.createDefaultPreset(legacyDomains);

        // Сохраняем пресеты
        await this.presetRepository.setAll([customPreset]);

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
     * Мигрировать данные из local storage в sync
     */
    async migrateToSync(): Promise<void> {
        const keysToMigrate = ['presets', 'proxies', 'theme', 'language', 'proxyByDefault', 'targetState', 'currentState'];
        
        const localData = await this.storageBackend.getMultiple(keysToMigrate);
        
        if (Object.keys(localData).length > 0) {
            for (const [key, value] of Object.entries(localData)) {
                if (value !== undefined) {
                    await this.setSyncValue(key, value);
                }
            }
        }
    }

    /**
     * Мигрировать данные из sync в local storage
     */
    async migrateToLocal(): Promise<void> {
        const keysToMigrate = ['presets', 'proxies', 'theme', 'language', 'proxyByDefault', 'targetState', 'currentState'];
        
        for (const key of keysToMigrate) {
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
     * Вспомогательный метод для установки значения в sync storage
     */
    private async setSyncValue(key: string, value: unknown): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ [key]: value }, resolve);
        });
    }

    /**
     * Вспомогательный метод для удаления значения из sync storage
     */
    private async removeSyncValue(key: string): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.sync.remove(key, resolve);
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
