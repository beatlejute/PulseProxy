import { IStorageBackend } from '../types/storage';
import { ProxyServer, Preset } from '../types';
import { StorageKeys } from '../shared/constants';
import { withStorageLock } from './storage-lock';

export class ProxyRepository {
    private readonly storageBackend: IStorageBackend;

    constructor(storageBackend: IStorageBackend) {
        this.storageBackend = storageBackend;
    }

    async getAll(): Promise<ProxyServer[]> {
        const proxies = await this.storageBackend.get(StorageKeys.PROXIES) as ProxyServer[] | undefined;
        return proxies || [];
    }

    async setAll(proxies: ProxyServer[]): Promise<void> {
        await this.storageBackend.set(StorageKeys.PROXIES, proxies);
    }

    async getById(id: string): Promise<ProxyServer | undefined> {
        const proxies = await this.getAll();
        return proxies.find(p => p.id === id);
    }

    async getDefault(): Promise<ProxyServer | undefined> {
        const proxies = await this.getAll();
        return proxies.find(p => p.isDefault);
    }

    async update(id: string, updates: Partial<ProxyServer>): Promise<void> {
        return withStorageLock(StorageKeys.PROXIES, async () => {
            const proxies = await this.getAll();
            const index = proxies.findIndex(p => p.id === id);
            if (index !== -1) {
                proxies[index] = { ...proxies[index], ...updates, updatedAt: Date.now() };
                await this.setAll(proxies);
            }
        });
    }

    async delete(id: string): Promise<void> {
        // Каскадная чистка ссылок в пресетах и удаление прокси — две записи по
        // разным ключам. Лочим каждую на своём ключе последовательно (не вложенно),
        // чтобы не держать один лок при взятии другого.
        const presets = await this.storageBackend.get(StorageKeys.PRESETS) as Preset[] | undefined;
        if (Array.isArray(presets)) {
            const hasRef = presets.some(preset => preset.proxyId === id);
            if (hasRef) {
                await withStorageLock(StorageKeys.PRESETS, async () => {
                    // Перечитываем под локом — список мог измениться, пока считали ссылки
                    const current = await this.storageBackend.get(StorageKeys.PRESETS) as Preset[] | undefined;
                    if (!Array.isArray(current)) return;
                    const cleaned = current.map(preset =>
                        preset.proxyId === id
                            ? { ...preset, proxyId: null, updatedAt: Date.now() }
                            : preset
                    );
                    await this.storageBackend.set(StorageKeys.PRESETS, cleaned);
                });
            }
        }

        await withStorageLock(StorageKeys.PROXIES, async () => {
            const proxies = await this.getAll();
            const filtered = proxies.filter(p => p.id !== id);
            await this.setAll(filtered);
        });
    }

    async add(proxyData: Omit<ProxyServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProxyServer> {
        return withStorageLock(StorageKeys.PROXIES, async () => {
            const proxies = await this.getAll();
            const now = Date.now();
            const newProxy: ProxyServer = {
                ...proxyData,
                id: crypto.randomUUID(),
                createdAt: now,
                updatedAt: now,
            };
            proxies.push(newProxy);
            await this.setAll(proxies);
            return newProxy;
        });
    }

    async setDefault(id: string): Promise<void> {
        return withStorageLock(StorageKeys.PROXIES, async () => {
            const proxies = await this.getAll();
            for (const proxy of proxies) {
                proxy.isDefault = proxy.id === id;
            }
            await this.setAll(proxies);
        });
    }
}
