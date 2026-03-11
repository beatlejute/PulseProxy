import { IStorageBackend } from '../types/storage';
import { ProxyServer } from '../types';
import { StorageKeys } from '../shared/constants';

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
        const defaultProxy = proxies.find(p => p.isDefault);
        if (defaultProxy) {
            return defaultProxy;
        }
        return proxies[0];
    }

    async update(id: string, updates: Partial<ProxyServer>): Promise<void> {
        const proxies = await this.getAll();
        const index = proxies.findIndex(p => p.id === id);
        if (index !== -1) {
            proxies[index] = { ...proxies[index], ...updates, updatedAt: Date.now() };
            await this.setAll(proxies);
        }
    }

    async delete(id: string): Promise<void> {
        const proxies = await this.getAll();
        const filtered = proxies.filter(p => p.id !== id);
        await this.setAll(filtered);
    }

    async add(proxyData: Omit<ProxyServer, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProxyServer> {
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
    }

    async setDefault(id: string): Promise<void> {
        const proxies = await this.getAll();
        for (const proxy of proxies) {
            proxy.isDefault = proxy.id === id;
        }
        await this.setAll(proxies);
    }
}
