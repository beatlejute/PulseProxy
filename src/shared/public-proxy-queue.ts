import { NormalizedPublicProxy, PublicProxyLiveStatus } from '../types';
import { publicProxyCacheKey } from '../storage/public-proxy-check-cache';

/** Порядок сортировки списка: рабочие → непроверенные/проверяемые → нерабочие. */
const STATUS_ORDER: Record<PublicProxyLiveStatus, number> = {
    alive: 0,
    checking: 1,
    unchecked: 1,
    dead: 2,
};

export function sortByLiveStatus(
    proxies: NormalizedPublicProxy[],
    getStatus: (proxy: NormalizedPublicProxy) => PublicProxyLiveStatus
): NormalizedPublicProxy[] {
    return [...proxies].sort((a, b) => STATUS_ORDER[getStatus(a)] - STATUS_ORDER[getStatus(b)]);
}

function subnet16(ip: string): string {
    return ip.split('.').slice(0, 2).join('.');
}

function subnet24(ip: string): string {
    return ip.split('.').slice(0, 3).join('.');
}

// Поочерёдно берёт по элементу из каждой группы, пока группы не исчерпаны
function roundRobin<T>(groups: T[][]): T[] {
    const result: T[] = [];
    for (let i = 0; groups.some(group => i < group.length); i++) {
        for (const group of groups) {
            if (i < group.length) {
                result.push(group[i]);
            }
        }
    }
    return result;
}

// Двухуровневый round-robin по подсетям: /16 → /24 — соседние элементы
// результата принадлежат максимально разным подсетям
export function interleaveBySubnet(proxies: NormalizedPublicProxy[]): NormalizedPublicProxy[] {
    const bySubnet16 = new Map<string, Map<string, NormalizedPublicProxy[]>>();
    for (const proxy of proxies) {
        const key16 = subnet16(proxy.ip);
        let by24 = bySubnet16.get(key16);
        if (!by24) {
            by24 = new Map();
            bySubnet16.set(key16, by24);
        }
        const key24 = subnet24(proxy.ip);
        const group = by24.get(key24);
        if (group) {
            group.push(proxy);
        } else {
            by24.set(key24, [proxy]);
        }
    }
    const groups16 = [...bySubnet16.values()].map(by24 => roundRobin([...by24.values()]));
    return roundRobin(groups16);
}

/**
 * Строит очередь проверки: приоритетные (ручные) → под фильтром → остальные.
 *
 * @param proxies - Полный список публичных прокси
 * @param matchesFilter - Попадает ли прокси под текущий фильтр модалки
 * @param needsCheck - Требуется ли прокси проверка (нет свежего результата)
 * @param priorityKeys - Ключи прокси, запрошенных вручную (в порядке кликов)
 */
export function buildCheckQueue(
    proxies: NormalizedPublicProxy[],
    matchesFilter: (proxy: NormalizedPublicProxy) => boolean,
    needsCheck: (proxy: NormalizedPublicProxy) => boolean,
    priorityKeys: readonly string[] = []
): NormalizedPublicProxy[] {
    const pending = new Map<string, NormalizedPublicProxy>();
    for (const proxy of proxies) {
        if (needsCheck(proxy)) {
            pending.set(publicProxyCacheKey(proxy), proxy);
        }
    }

    const priority: NormalizedPublicProxy[] = [];
    for (const key of priorityKeys) {
        const proxy = pending.get(key);
        if (proxy) {
            priority.push(proxy);
            pending.delete(key);
        }
    }

    const matched: NormalizedPublicProxy[] = [];
    const rest: NormalizedPublicProxy[] = [];
    for (const proxy of pending.values()) {
        (matchesFilter(proxy) ? matched : rest).push(proxy);
    }

    return [...priority, ...interleaveBySubnet(matched), ...interleaveBySubnet(rest)];
}
