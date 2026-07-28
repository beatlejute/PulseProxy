import { PublicProxyCheckResults } from '../types';
import { PublicProxyCheckConfig } from '../shared/constants';

// Ключ кеша результата проверки публичного прокси
export function publicProxyCacheKey(proxy: { protocol: string; ip: string; port: number }): string {
    return `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
}

// Отбрасывает просроченные (старше TTL) и повреждённые записи кеша
export function pruneCheckResults(
    results: PublicProxyCheckResults,
    now: number,
    ttlMs: number = PublicProxyCheckConfig.CACHE_TTL_MS
): PublicProxyCheckResults {
    const fresh: PublicProxyCheckResults = {};
    for (const [key, entry] of Object.entries(results)) {
        if (!entry || typeof entry.checkedAt !== 'number') continue;
        if (entry.status !== 'alive' && entry.status !== 'dead') continue;
        if (now - entry.checkedAt >= ttlMs) continue;
        fresh[key] = entry;
    }
    return fresh;
}

// Сливает новые результаты поверх существующих
export function mergeCheckResults(
    existing: PublicProxyCheckResults,
    updates: PublicProxyCheckResults
): PublicProxyCheckResults {
    return { ...existing, ...updates };
}
