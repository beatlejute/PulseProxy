import { fetchWithFallback } from './fetch-with-fallback';

export interface RemoteConfig {
    referralLink: string;
}

const CONFIG_PRIMARY_URL = 'https://raw.githubusercontent.com/beatlejute/PulseProxy/refs/heads/main/sources/config.json';
const CONFIG_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/beatlejute/PulseProxy@master/sources/config.json';

const DEFAULT_CONFIG: RemoteConfig = {
    referralLink: '#',
};

export class RemoteConfigService {
    private config: RemoteConfig = DEFAULT_CONFIG;
    private loaded = false;

    async init(): Promise<void> {
        try {
            this.config = await this.fetchConfig();
        } catch (error) {
            console.warn('RemoteConfig: Failed to load config, using defaults:', error);
        }
        this.loaded = true;
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
