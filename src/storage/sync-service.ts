import { StorageKey, StorageChanges, SyncStorageKey } from '../types';
import { ISyncService } from '../types/storage';
import { SYNC_STORAGE_KEYS } from '../shared/constants';

const SYNC_DEBOUNCE_DELAY = 1000;

class SyncServiceImpl implements ISyncService {
    private syncEnabled: boolean = false;
    private initialized: boolean = false;
    private syncDebounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    async init(): Promise<void> {
        const result = await chrome.storage.local.get('syncEnabled') as { syncEnabled?: boolean };
        if (result.syncEnabled === undefined) {
            this.syncEnabled = true;
            await chrome.storage.local.set({ syncEnabled: true });
        } else {
            this.syncEnabled = result.syncEnabled;
        }
        this.initialized = true;

        if (this.syncEnabled) {
            await this.syncFromCloud();
        }

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'sync' && this.syncEnabled) {
                this.handleSyncChanges(changes);
            }
        });
    }

    async isEnabled(): Promise<boolean> {
        const result = await chrome.storage.local.get('syncEnabled') as { syncEnabled?: boolean };
        return result.syncEnabled ?? true;
    }

    async setEnabled(enabled: boolean): Promise<void> {
        this.syncEnabled = enabled;
        this.initialized = true;
        await chrome.storage.local.set({ syncEnabled: enabled });
    }

    wasInitialized(): boolean {
        return this.initialized;
    }

    async syncFromCloud(): Promise<void> {
        const syncKeys = SYNC_STORAGE_KEYS.filter(k => k !== 'syncEnabled');
        const syncData = await new Promise<Record<string, unknown>>((resolve) => {
            chrome.storage.sync.get([...syncKeys], (result) => resolve(result));
        });
        
        if (Object.keys(syncData).length > 0) {
            await new Promise<void>((resolve) => {
                chrome.storage.local.set(syncData, resolve);
            });
            console.log('SyncService: Synced from cloud:', Object.keys(syncData));
        }
    }

    handleSyncChanges(changes: StorageChanges): void {
        const updates: Record<string, unknown> = {};
        for (const [key, change] of Object.entries(changes)) {
            if (change.newValue !== undefined) {
                updates[key] = change.newValue;
            }
        }
        if (Object.keys(updates).length > 0) {
            chrome.storage.local.set(updates);
        }
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

    isSyncKey(key: StorageKey): key is SyncStorageKey {
        return (SYNC_STORAGE_KEYS as readonly string[]).includes(key);
    }

    async setWithDebounce<K extends SyncStorageKey>(key: K, value: unknown): Promise<void> {
        await new Promise<void>((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });

        const existingTimer = this.syncDebounceTimers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(async () => {
            this.syncDebounceTimers.delete(key);

            try {
                await this.checkSyncQuota(key, value);

                await new Promise<void>((res) => {
                    chrome.storage.sync.set({ [key]: value }, res);
                });
                console.log(`SyncService: Synced ${key} to cloud`);
            } catch (error) {
                console.error(`SyncService: Failed to sync ${key}:`, error);
            }
        }, SYNC_DEBOUNCE_DELAY);

        this.syncDebounceTimers.set(key, timer);
    }
}

export const SyncService = new SyncServiceImpl();
