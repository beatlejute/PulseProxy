import { PublicProxiesResponse, NormalizedPublicProxy, PublicProxyCatalogCache, ProxyType } from '../types';
import { Storage } from './storage';
import { fetchWithFallback, FetchWithFallbackOptions } from './fetch-with-fallback';
import { PublicPoolCheckConfig } from './constants';
import { poolMemberKey } from './public-pool';

// URLs for the public proxy catalog.
// Defined here so both background and popup share a single source of truth.
export const PUBLIC_PROXIES_PRIMARY_URL = 'https://raw.githubusercontent.com/beatlejute/PulseProxy/refs/heads/main/sources/proxys.json';
export const PUBLIC_PROXIES_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/beatlejute/PulseProxy@master/sources/proxys.json';

/**
 * Normalizes a raw CDN response into a flat, sorted list of proxies.
 *
 * Logic is identical to the one previously living in
 * `src/popup/public-proxies-modal.ts` — splits `ip:port`, lowercases the
 * connection type, and sorts by `score` descending.
 */
export function normalizeProxies(response: PublicProxiesResponse): NormalizedPublicProxy[] {
    const result: NormalizedPublicProxy[] = [];
    const protocols: (keyof PublicProxiesResponse)[] = ['http', 'https', 'socks4', 'socks5'];

    for (const protocol of protocols) {
        const proxies = response[protocol] || [];
        for (const proxy of proxies) {
            const [ip, portStr] = proxy.ip.split(':');
            const port = parseInt(portStr, 10);
            if (ip && !isNaN(port)) {
                result.push({
                    protocol: protocol as ProxyType,
                    ip,
                    port,
                    score: proxy.score,
                    connectionType: proxy.type.toLowerCase(),
                    country: proxy.country,
                });
            }
        }
    }

    return result.sort((a, b) => b.score - a.score);
}

/**
 * Shared loader for the public proxy catalog with a local cache.
 *
 * The cache lives in `chrome.storage.local` under the `publicProxyCatalog`
 * key. Freshness is governed by `CATALOG_TTL_MS` (6 hours by default).
 *
 * Parallel callers share a single in-flight promise: while a fetch is in
 * progress, every subsequent `get()` waits on the same promise instead of
 * spawning a second network request.
 */
export const PublicProxyCatalog = {
    /** In-flight promise shared by concurrent callers. */
    _inFlight: null as Promise<NormalizedPublicProxy[]> | null,

    async get(options?: { forceRefresh?: boolean; ttlMs?: number }): Promise<NormalizedPublicProxy[]> {
        const forceRefresh = options?.forceRefresh === true;
        const ttlMs = typeof options?.ttlMs === 'number' ? options.ttlMs : PublicPoolCheckConfig.CATALOG_TTL_MS;

        // Deduplicate parallel calls: if a fetch is already in flight,
        // return that promise instead of starting another one.
        if (this._inFlight) {
            return this._inFlight;
        }

        const promise = this._getInternal(forceRefresh, ttlMs);
        this._inFlight = promise;

        try {
            return await promise;
        } finally {
            this._inFlight = null;
        }
    },

    async _getInternal(forceRefresh: boolean, ttlMs: number): Promise<NormalizedPublicProxy[]> {
        // 1. Try the cache first.
        const cached = await Storage.getPublicProxyCatalog();
        const now = Date.now();

        if (!forceRefresh && cached && cached.proxies && (now - cached.fetchedAt) < ttlMs) {
            return cached.proxies;
        }

        // 2. Cache is stale (or missing) and we're not forced to skip the
        //    network — attempt a fresh download.
        try {
            const cacheBuster = `?_t=${now}`;
            const urls = [
                `${PUBLIC_PROXIES_PRIMARY_URL}${cacheBuster}`,
                `${PUBLIC_PROXIES_FALLBACK_URL}${cacheBuster}`,
            ];
            const opts: FetchWithFallbackOptions = {
                timeoutMs: PublicPoolCheckConfig.CATALOG_FETCH_TIMEOUT_MS,
            };
            const rawData = await fetchWithFallback<PublicProxiesResponse>(urls, opts);
            const proxies = normalizeProxies(rawData);

            const newCache: PublicProxyCatalogCache = {
                fetchedAt: now,
                proxies,
            };
            await Storage.setPublicProxyCatalog(newCache);

            try {
                const presentMemberKeys = proxies.map(poolMemberKey);
                const allPresets = await Storage.getPresets();
                const existingPresetIds = allPresets.map(p => p.id);
                await Storage.cleanGeoExclusions(presentMemberKeys, existingPresetIds);
            } catch (cleanupError) {
                console.error('[PublicProxyCatalog] Failed to clean geo exclusions:', cleanupError);
            }

            return proxies;
        } catch (error) {
            // 3. Network failed. If we have a stale cache, return it; otherwise
            //    propagate the error so callers can react.
            if (cached && cached.proxies) {
                return cached.proxies;
            }
            throw error;
        }
    },
};
