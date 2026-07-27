import { fetchWithFallback } from './fetch-with-fallback';

export interface RemoteConfig {
    referralLink: string;
}

const CONFIG_PRIMARY_URL = 'https://raw.githubusercontent.com/beatlejute/PulseProxy/refs/heads/main/sources/config.json';
const CONFIG_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/beatlejute/PulseProxy@master/sources/config.json';

const DEFAULT_CONFIG: RemoteConfig = {
    referralLink: '#',
};

const CONFIG_CACHE_KEY = 'remoteConfigCache';

export class RemoteConfigService {
    private config: RemoteConfig = DEFAULT_CONFIG;
    private loaded = false;

    async init(): Promise<void> {
        // Сначала кэш: даже без сети реферальные ссылки останутся рабочими
        await this.loadFromCache();
        try {
            this.config = await this.fetchConfig();
            await this.saveToCache();
        } catch (error) {
            console.warn('RemoteConfig: Failed to load config, using cached/defaults:', error);
        }
        this.loaded = true;
    }

    private async loadFromCache(): Promise<void> {
        try {
            const stored = await chrome.storage.local.get(CONFIG_CACHE_KEY);
            const cached = stored[CONFIG_CACHE_KEY] as RemoteConfig | undefined;
            if (cached && typeof cached.referralLink === 'string') {
                this.config = cached;
            }
        } catch (error) {
            console.warn('RemoteConfig: Failed to read config cache:', error);
        }
    }

    private async saveToCache(): Promise<void> {
        try {
            await chrome.storage.local.set({ [CONFIG_CACHE_KEY]: this.config });
        } catch (error) {
            console.warn('RemoteConfig: Failed to write config cache:', error);
        }
    }

    private async fetchConfig(): Promise<RemoteConfig> {
        const cacheBuster = `?_t=${Date.now()}`;
        const urls = [
            `${CONFIG_PRIMARY_URL}${cacheBuster}`,
            `${CONFIG_FALLBACK_URL}${cacheBuster}`,
        ];
        return fetchWithFallback<RemoteConfig>(urls);
    }

    get referralLink(): string {
        return this.config.referralLink;
    }

    get isLoaded(): boolean {
        return this.loaded;
    }
}

export const RemoteConfig = new RemoteConfigService();
