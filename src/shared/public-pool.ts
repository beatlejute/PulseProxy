import { PublicPoolConfig, NormalizedPublicProxy, PublicProxyCheckResults } from '../types';
import { PublicPoolCheckConfig } from './constants';

// Импорт ключа кеша результатов проверки (тот же формат, что и в storage-кеше)
import { publicProxyCacheKey } from '../storage/public-proxy-check-cache';

// Сигнатура пула участвует в хэше конфига PAC.
export interface PoolResolution {
    members: NormalizedPublicProxy[];   // попадают в PAC
    needsCheck: NormalizedPublicProxy[]; // подлежат (пере)проверке в ближайшем цикле
}

// Ключ члена пула: protocol://ip:port (совпадает с publicProxyCacheKey)
export function poolMemberKey(proxy: NormalizedPublicProxy): string {
    return publicProxyCacheKey(proxy);
}

// Сигнатура пула не зависит от порядка входного массива.
export function poolSignature(members: NormalizedPublicProxy[]): string {
    return members.map(poolMemberKey).sort().join(',');
}

// FNV-1a 32-bit: тот же хеш, что в PAC-скрипте (функция fnv1a в generatePacScript,
// proxy-manager.ts). Побитово совпадает с ним: беззнаковый сдвиг, Math.imul, charCodeAt.
function fnv1a32(input: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

// Ключ rendezvous-хеша: «*.example.com» и «example.com» дают один ключ
// (poolKey в PAC). Применяется внутри pickPoolChain, поэтому нормализация
// идемпотентна: уже нормализованный ключ не меняется.
function rendezvousKey(ruleKey: string): string {
    return ruleKey.indexOf('*.') === 0 ? ruleKey.substring(2) : ruleKey;
}

// Цепочка пула до CHAIN_LENGTH элементов для правила пресета.
// Участники ранжируются по убыванию FNV-1a от «ruleKey|строка PAC» — тем же
// правилом, что и pickFromPool в PAC-скрипте, поэтому цепочка TypeScript совпадает
// с цепочкой FindProxyForURL сгенерированного PAC. При равных хешах порядок
// исходного пула: сортировка в PAC устойчива, а сравнение по индексу даёт то же самое.
// Пустой пул даёт пустую цепочку: заглушку EMPTY_POOL_SENTINEL подставляет вызывающий
// код, как и в PAC, где пустой пул не должен выпускать трафик в DIRECT.
export function pickPoolChain(pool: string[], ruleKey: string): string[] {
    if (!pool || pool.length === 0) return [];

    const key = rendezvousKey(ruleKey);
    const scored = pool.map((proxy, index) => ({ proxy, index, hash: fnv1a32(key + '|' + proxy) }));
    scored.sort((a, b) => (b.hash - a.hash) || (a.index - b.index));

    return scored.slice(0, PublicPoolCheckConfig.CHAIN_LENGTH).map((entry) => entry.proxy);
}

// Дефолтная конфигурация публичного пула.
export const DEFAULT_PUBLIC_POOL_CONFIG: PublicPoolConfig = { protocols: ['socks5'] };

export function resolvePoolMembers(
    config: PublicPoolConfig,
    catalog: NormalizedPublicProxy[],
    results: PublicProxyCheckResults,
    now: number
): PoolResolution {
    // 1. Фильтр по протоколу, стране, типу соединения, мин. рейтингу.
    const protocols =
        Array.isArray(config.protocols) && config.protocols.length > 0
            ? config.protocols
            : PublicPoolCheckConfig.DEFAULT_PROTOCOLS;

    const countryLower = config.country ? config.country.toLowerCase() : undefined;
    const connectionType = config.connectionType;
    const minScore = config.minScore;
    const hasMinScore = typeof minScore === 'number' && !Number.isNaN(minScore);

    const candidates = catalog.filter((proxy) => {
        if (!protocols.includes(proxy.protocol)) return false;
        if (countryLower !== undefined && proxy.country.toLowerCase() !== countryLower) return false;
        if (connectionType !== undefined && proxy.connectionType !== connectionType) return false;
        if (hasMinScore && proxy.score < (minScore as number)) return false;
        return true;
    });

    // 2. Исключаем прокси со статусом 'dead'.
    const members = candidates.filter((proxy) => {
        const key = poolMemberKey(proxy);
        const entry = results[key];
        return !entry || entry.status !== 'dead';
    });

    // 3. Сортировка: score desc, затем key asc (детерминизм); обрезка до MAX_MEMBERS.
    members.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ka = poolMemberKey(a);
        const kb = poolMemberKey(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    if (members.length > PublicPoolCheckConfig.MAX_MEMBERS) {
        members.length = PublicPoolCheckConfig.MAX_MEMBERS;
    }

    // 4. needsCheck: нет результата или результат старше RECHECK_INTERVAL_MS.
    const needsCheck = members.filter((proxy) => {
        const key = poolMemberKey(proxy);
        const entry = results[key];
        if (!entry || typeof entry.checkedAt !== 'number') return true;
        return now - entry.checkedAt >= PublicPoolCheckConfig.RECHECK_INTERVAL_MS;
    });

    return { members, needsCheck };
}