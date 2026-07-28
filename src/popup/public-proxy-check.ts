/**
 * Фоновая проверка публичных прокси из модалки.
 *
 * Очередь строится с приоритетами:
 *   1. Прокси, запрошенные вручную кнопкой «Проверить»
 *   2. Прокси, попадающие под текущий фильтр модалки
 *   3. Остальные
 * Внутри групп 2 и 3 порядок «в разброс» — двухуровневый round-robin по
 * подсетям (/16 → /24), чтобы соседние проверки шли из максимально разных
 * сетей и мёртвая подсеть не занимала целый батч.
 *
 * Сессия гонит батчи по PublicProxyCheckConfig.BATCH_SIZE через background
 * ('checkProxyBatch'), пишет результаты в кеш (TTL сутки) и дёргает onUpdate
 * для пересортировки списка. Пока пользователь проверяет прокси перед
 * добавлением, сессия приостанавливается (suspendForUserCheck/resume).
 */

import {
    CheckProxyBatchResponse,
    NormalizedPublicProxy,
    PublicProxyCheckResults,
    PublicProxyLiveStatus,
} from '../types';
import { PublicProxyCheckConfig } from '../shared/constants';
import { Storage } from '../shared/storage';
import { publicProxyCacheKey } from '../storage/public-proxy-check-cache';

export { publicProxyCacheKey };

// Порядок сортировки списка: рабочие → непроверенные/проверяемые → нерабочие.
// Внутри групп сохраняется исходный порядок (sort стабилен).
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

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface PublicProxyCheckSessionOptions {
    /** Полный список прокси из фида */
    proxies: NormalizedPublicProxy[];
    /** Статусы по ключу `protocol://ip:port` (общая с UI мапа) */
    statuses: Map<string, PublicProxyLiveStatus>;
    /** Матчер текущего фильтра модалки (читается перед каждым батчем) */
    getFilterMatcher: () => (proxy: NormalizedPublicProxy) => boolean;
    /** Жива ли модалка; false — сессия завершает работу */
    isAlive: () => boolean;
    /** Вызывается после изменения статусов — пересортировать/перерисовать список */
    onUpdate: () => void;
}

export class PublicProxyCheckSession {
    private stopped = false;
    private suspended = false;
    private loopPromise: Promise<void> | null = null;
    private inFlight: Promise<unknown> | null = null;
    private priorityKeys: string[] = [];

    constructor(private readonly opts: PublicProxyCheckSessionOptions) {}

    getStatus(proxy: NormalizedPublicProxy): PublicProxyLiveStatus {
        return this.opts.statuses.get(publicProxyCacheKey(proxy)) ?? 'unchecked';
    }

    /** Запускает цикл проверки; промис резолвится, когда очередь исчерпана */
    start(): Promise<void> {
        return this.runLoop();
    }

    stop(): void {
        this.stopped = true;
    }

    /**
     * Приостанавливает сессию на время пользовательской проверки перед
     * добавлением: снимает активный батч в background и дожидается его
     * завершения, чтобы одиночный чек не получил занятый mutex.
     */
    async suspendForUserCheck(): Promise<void> {
        this.suspended = true;
        try {
            await chrome.runtime.sendMessage({ action: 'abortCheckBatch' });
        } catch {
            // Background недоступен — активный батч завершится сам
        }
        if (this.inFlight) {
            await this.inFlight;
        }
    }

    resume(): void {
        this.suspended = false;
        void this.runLoop();
    }

    /** Ручная проверка по кнопке: прокси уходит в начало очереди */
    requestPriorityCheck(proxy: NormalizedPublicProxy): void {
        const key = publicProxyCacheKey(proxy);
        if (this.opts.statuses.get(key) === 'checking') {
            return;
        }
        // Спиннер сразу; в очередь элемент попадёт через priorityKeys
        this.opts.statuses.set(key, 'checking');
        this.priorityKeys.push(key);
        this.opts.onUpdate();
        // Текущий батч снимаем, чтобы приоритетный прокси не ждал до 15 секунд
        if (this.inFlight && !this.suspended) {
            void Promise.resolve(chrome.runtime.sendMessage({ action: 'abortCheckBatch' })).catch(() => undefined);
        }
        void this.runLoop();
    }

    private nextBatch(): NormalizedPublicProxy[] {
        const prioritySet = new Set(this.priorityKeys);
        const matcher = this.opts.getFilterMatcher();
        const queue = buildCheckQueue(
            this.opts.proxies,
            matcher,
            proxy => {
                const key = publicProxyCacheKey(proxy);
                const status = this.opts.statuses.get(key) ?? 'unchecked';
                // 'checking' у приоритетных — визуальный маркер, чек ещё не шёл
                return status === 'unchecked' || (status === 'checking' && prioritySet.has(key));
            },
            this.priorityKeys
        );
        const batch = queue.slice(0, PublicProxyCheckConfig.BATCH_SIZE);
        const batchKeys = new Set(batch.map(publicProxyCacheKey));
        this.priorityKeys = this.priorityKeys.filter(key => !batchKeys.has(key));
        return batch;
    }

    // Единственный экземпляр цикла: повторные вызовы возвращают текущий промис
    private runLoop(): Promise<void> {
        if (!this.loopPromise) {
            this.loopPromise = this.loopBody().finally(() => {
                this.loopPromise = null;
            });
        }
        return this.loopPromise;
    }

    private async loopBody(): Promise<void> {
        while (this.opts.isAlive() && !this.stopped) {
            if (this.suspended) {
                await delay(PublicProxyCheckConfig.SUSPEND_POLL_MS);
                continue;
            }

            const batch = this.nextBatch();
            if (batch.length === 0) {
                break;
            }

            batch.forEach(proxy => this.opts.statuses.set(publicProxyCacheKey(proxy), 'checking'));
            this.opts.onUpdate();

            let response: CheckProxyBatchResponse | undefined;
            const request = Promise.resolve(chrome.runtime.sendMessage({
                action: 'checkProxyBatch',
                proxies: batch.map(proxy => ({ type: proxy.protocol, host: proxy.ip, port: proxy.port })),
            }) as Promise<CheckProxyBatchResponse>);
            this.inFlight = request.catch(() => undefined);
            try {
                response = await request;
            } catch {
                response = undefined;
            } finally {
                this.inFlight = null;
            }

            if (!response || response.busy) {
                // Mutex занят (идёт одиночная проверка) — вернём батч в очередь
                batch.forEach(proxy => this.opts.statuses.set(publicProxyCacheKey(proxy), 'unchecked'));
                this.opts.onUpdate();
                await delay(PublicProxyCheckConfig.BUSY_RETRY_DELAY_MS);
                continue;
            }

            const updates: PublicProxyCheckResults = {};
            const now = Date.now();
            batch.forEach((proxy, index) => {
                const key = publicProxyCacheKey(proxy);
                const result = response?.results?.[index];
                if (result === 'ok') {
                    this.opts.statuses.set(key, 'alive');
                    updates[key] = { status: 'alive', checkedAt: now };
                } else if (result === 'error' || result === 'timeout') {
                    this.opts.statuses.set(key, 'dead');
                    updates[key] = { status: 'dead', checkedAt: now };
                } else {
                    // 'aborted' или ответ без результата — вернётся в очередь
                    this.opts.statuses.set(key, 'unchecked');
                }
            });

            if (Object.keys(updates).length > 0) {
                await Storage.mergePublicProxyCheckResults(updates);
            }
            this.opts.onUpdate();
        }
    }
}
