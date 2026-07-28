import { IStorageBackend, IPresetRepository } from '../types/storage';
import { Preset } from '../types';
import { StorageKeys, DEFAULT_PRESET_ID } from '../shared/constants';
import { withStorageLock } from './storage-lock';

export class ChromeStorageBackend implements IStorageBackend {
    async get<K extends string>(key: K): Promise<unknown> {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(key, (result) => {
                // Не глотаем ошибку молча: раньше сбой чтения резолвился undefined,
                // из-за чего getAll принимал его за «пусто» и затирал данные дефолтом.
                if (chrome.runtime.lastError) {
                    reject(new Error(`storage.get("${key}") failed: ${chrome.runtime.lastError.message}`));
                    return;
                }
                resolve(result[key]);
            });
        });
    }

    async set<K extends string>(key: K, value: unknown): Promise<void> {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`storage.set("${key}") failed: ${chrome.runtime.lastError.message}`));
                    return;
                }
                resolve();
            });
        });
    }

    async getMultiple<K extends string>(keys: K[]): Promise<Record<K, unknown>> {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`storage.getMultiple failed: ${chrome.runtime.lastError.message}`));
                    return;
                }
                resolve(result as Record<K, unknown>);
            });
        });
    }

    async remove(keys: string[]): Promise<void> {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove(keys, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`storage.remove failed: ${chrome.runtime.lastError.message}`));
                    return;
                }
                resolve();
            });
        });
    }

    async checkSyncQuota(key: string, value: unknown): Promise<void> {
        const serialized = JSON.stringify({ [key]: value });
        const bytes = new Blob([serialized]).size;

        if (bytes > 8192) {
            throw new Error(`Sync storage item too large: ${bytes} bytes (max 8192)`);
        }

        const bytesInUse = await chrome.storage.sync.getBytesInUse();
        if (bytesInUse + bytes > 102400) {
            throw new Error('Sync storage quota exceeded');
        }
    }

    async getSyncBytesInUse(): Promise<number> {
        return chrome.storage.sync.getBytesInUse();
    }
}

export const StorageBackend = new ChromeStorageBackend();

export class PresetRepository implements IPresetRepository {
    private readonly storageBackend: IStorageBackend;

    constructor(storageBackend: IStorageBackend) {
        this.storageBackend = storageBackend;
    }

    async getAll(): Promise<Preset[]> {
        const presets = await this.storageBackend.get(StorageKeys.PRESETS) as Preset[] | undefined;

        if (Array.isArray(presets) && presets.length > 0) {
            return [...presets].sort((a: Preset, b: Preset) => {
                if (a.isDefault && !b.isDefault) return -1;
                if (!a.isDefault && b.isDefault) return 1;
                return a.order - b.order;
            });
        }

        // Пусто (сбой чтения теперь бросает выше и сюда не доходит) — возвращаем
        // дефолт БЕЗ записи. Раньше здесь был setAll([default]); при транзиентном
        // сбое чтения это уничтожало реальные пресеты. Персист случится при первой
        // реальной мутации (migration/add/update).
        console.log('Storage: No presets found, returning default Custom preset (not persisted)');
        return [this.createDefaultPreset()];
    }

    async setAll(presets: Preset[]): Promise<void> {
        await this.storageBackend.set(StorageKeys.PRESETS, presets);
    }

    async getById(id: string): Promise<Preset | undefined> {
        const presets = await this.getAll();
        return presets.find(p => p.id === id);
    }

    async update(id: string, updates: Partial<Preset>): Promise<void> {
        // Весь read-modify-write под локом ключа presets, чтобы конкурентные
        // мутации в этом контексте не затирали друг друга.
        return withStorageLock(StorageKeys.PRESETS, async () => {
            const presets = await this.getAll();
            const index = presets.findIndex(p => p.id === id);
            if (index !== -1) {
                presets[index] = { ...presets[index], ...updates, updatedAt: Date.now() };
                await this.setAll(presets);
            }
        });
    }

    async delete(id: string): Promise<void> {
        return withStorageLock(StorageKeys.PRESETS, async () => {
            const presets = await this.getAll();
            const filtered = presets.filter(p => p.id !== id);
            await this.setAll(filtered);
        });
    }

    async add(presetData: Omit<Preset, 'id' | 'createdAt' | 'updatedAt'>): Promise<Preset> {
        return withStorageLock(StorageKeys.PRESETS, async () => {
            const presets = await this.getAll();
            const now = Date.now();
            const newPreset: Preset = {
                ...presetData,
                id: crypto.randomUUID(),
                createdAt: now,
                updatedAt: now,
            };
            presets.push(newPreset);
            await this.setAll(presets);
            return newPreset;
        });
    }

    async setEnabled(id: string, enabled: boolean): Promise<void> {
        await this.update(id, { enabled });
    }

    async setProxy(id: string, proxyId: string | null): Promise<void> {
        await this.update(id, { proxyId });
    }

    async reorder(orderedIds: string[]): Promise<void> {
        return withStorageLock(StorageKeys.PRESETS, async () => {
            const presets = await this.getAll();
            const presetsMap = new Map(presets.map(p => [p.id, p]));

            orderedIds.forEach((id, index) => {
                const preset = presetsMap.get(id);
                if (preset) {
                    preset.order = index;
                    preset.updatedAt = Date.now();
                }
            });

            const sortedPresets = [...presets].sort((a, b) => {
                if (a.isDefault && !b.isDefault) return -1;
                if (!a.isDefault && b.isDefault) return 1;
                return a.order - b.order;
            });

            await this.setAll(sortedPresets);
        });
    }

    async getActive(): Promise<Preset[]> {
        const presets = await this.getAll();
        return presets.filter(p => p.enabled);
    }

    async getAllActiveDomains(): Promise<string[]> {
        const activePresets = await this.getActive();
        const allDomains: string[] = [];
        for (const preset of activePresets) {
            allDomains.push(...preset.domains);
        }
        return [...new Set(allDomains)];
    }

    createDefaultPreset(domains: string[] = []): Preset {
        const now = Date.now();
        return {
            id: DEFAULT_PRESET_ID,
            name: 'Ignore List',
            domains: domains,
            enabled: true,
            isDefault: true,
            order: 0,
            proxyId: null,
            createdAt: now,
            updatedAt: now,
        };
    }
}