import { Preset, ProxyServer } from '../types';

/**
 * Результат слияния списков прокси: объединённый список и карта переименования
 * id локальных дублей в выжившие облачные id (для починки ссылок preset.proxyId)
 */
export interface ProxyMergeResult {
    merged: ProxyServer[];
    idRemap: Map<string, string>;
    /** Сколько облачных записей отсутствовало локально (устройство их получило) */
    received: number;
    /** Сколько локальных записей отсутствовало в облаке (добавлены в облако) */
    added: number;
}

/**
 * Результат слияния списков пресетов
 */
export interface PresetMergeResult {
    merged: Preset[];
    /** Сколько облачных записей отсутствовало локально (устройство их получило) */
    received: number;
    /** Сколько локальных записей отсутствовало в облаке (добавлены в облако) */
    added: number;
}

// Контентный ключ прокси: один и тот же сервер, созданный независимо
// на разных устройствах под разными UUID
function proxyContentKey(proxy: ProxyServer): string {
    return `${proxy.type}|${proxy.host.toLowerCase()}|${proxy.port}|${proxy.username ?? ''}`;
}

function presetContentKey(preset: Preset): string {
    return (preset.name ?? '').trim().toLowerCase();
}

// Арбитр конфликтов: побеждает более свежая версия, при равенстве — облачная
function newer<T extends { updatedAt: number }>(cloud: T, local: T): T {
    return local.updatedAt > cloud.updatedAt ? local : cloud;
}

function unionDomains(cloud: string[] | undefined, local: string[] | undefined): string[] {
    return Array.from(new Set([...(cloud ?? []), ...(local ?? [])]));
}

/**
 * Слить облачный и локальный списки прокси без дублей.
 *
 * Дедупликация в два уровня: по id (ранее синхронизированные сущности),
 * затем по контенту (type|host|port|username — сервер, добавленный на двух
 * устройствах независимо). При контентном дубле выживает облачный id — его
 * уже знают другие устройства; выброшенные локальные id попадают в idRemap.
 * Инвариант: не более одного isDefault, приоритет у локального кандидата.
 * Входные массивы не мутируются.
 */
export function mergeProxies(cloud: ProxyServer[], local: ProxyServer[]): ProxyMergeResult {
    const merged: ProxyServer[] = [];
    const indexById = new Map<string, number>();
    const indexByContent = new Map<string, number>();
    const idRemap = new Map<string, string>();
    const matchedCloud = new Set<number>();
    let added = 0;

    const append = (proxy: ProxyServer): void => {
        indexById.set(proxy.id, merged.length);
        indexByContent.set(proxyContentKey(proxy), merged.length);
        merged.push({ ...proxy });
    };

    cloud.forEach(append);

    for (const proxy of local) {
        const byId = indexById.get(proxy.id);
        if (byId !== undefined) {
            if (byId < cloud.length) matchedCloud.add(byId);
            replaceAt(merged, indexByContent, byId, { ...newer(merged[byId], proxy) }, proxyContentKey);
            continue;
        }
        const byContent = indexByContent.get(proxyContentKey(proxy));
        if (byContent !== undefined) {
            if (byContent < cloud.length) matchedCloud.add(byContent);
            const survivorId = merged[byContent].id;
            replaceAt(merged, indexByContent, byContent, { ...newer(merged[byContent], proxy), id: survivorId }, proxyContentKey);
            idRemap.set(proxy.id, survivorId);
            continue;
        }
        append(proxy);
        added++;
    }

    const localDefault = local.find((proxy) => proxy.isDefault);
    const preferredId = localDefault ? idRemap.get(localDefault.id) ?? localDefault.id : undefined;
    enforceSingleDefault(merged, preferredId);

    return { merged, idRemap, received: cloud.length - matchedCloud.size, added };
}

// Заменить элемент, поддерживая актуальность контентного индекса:
// победившая версия могла изменить контентный ключ записи
function replaceAt<T>(
    items: T[],
    indexByContent: Map<string, number>,
    index: number,
    next: T,
    contentKey: (item: T) => string
): void {
    const prevKey = contentKey(items[index]);
    items[index] = next;
    const nextKey = contentKey(next);
    if (nextKey !== prevKey) {
        if (indexByContent.get(prevKey) === index) {
            indexByContent.delete(prevKey);
        }
        indexByContent.set(nextKey, index);
    }
}

function enforceSingleDefault(merged: ProxyServer[], preferredId: string | undefined): void {
    const hasPreferred = preferredId !== undefined && merged.some((proxy) => proxy.id === preferredId);
    let defaultTaken = false;
    for (let i = 0; i < merged.length; i++) {
        const isDefault: boolean = hasPreferred
            ? merged[i].id === preferredId
            : merged[i].isDefault && !defaultTaken;
        defaultTaken = defaultTaken || isDefault;
        merged[i] = { ...merged[i], isDefault };
    }
}

/**
 * Слить облачный и локальный списки пресетов без дублей.
 *
 * Дедупликация: по id (в т.ч. дефолтный Custom-пресет, существующий на обеих
 * сторонах под фиксированным id), затем по нормализованному имени. У дублей
 * домены объединяются (union без потерь), остальные поля — у более свежей
 * версии, выживает облачный id. Ссылки proxyId ремапятся по результату
 * mergeProxies, битые ссылки обнуляются (null = default proxy). order
 * перенумеровывается последовательно: облачные пресеты, затем локальные.
 * Входные массивы не мутируются.
 */
export function mergePresets(cloud: Preset[], local: Preset[], proxyMerge: ProxyMergeResult): PresetMergeResult {
    const merged: Preset[] = [];
    const indexById = new Map<string, number>();
    const indexByContent = new Map<string, number>();
    const matchedCloud = new Set<number>();
    let added = 0;

    const append = (preset: Preset): void => {
        indexById.set(preset.id, merged.length);
        indexByContent.set(presetContentKey(preset), merged.length);
        merged.push({ ...preset, domains: [...(preset.domains ?? [])] });
    };

    cloud.forEach(append);

    for (const preset of local) {
        const index = indexById.get(preset.id) ?? indexByContent.get(presetContentKey(preset));
        if (index !== undefined) {
            if (index < cloud.length) matchedCloud.add(index);
            const existing = merged[index];
            replaceAt(merged, indexByContent, index, {
                ...newer(existing, preset),
                id: existing.id,
                domains: unionDomains(existing.domains, preset.domains),
            }, presetContentKey);
            continue;
        }
        append(preset);
        added++;
    }

    const knownProxyIds = new Set(proxyMerge.merged.map((proxy) => proxy.id));
    const result = merged.map((preset, index) => {
        const remapped = preset.proxyId ? proxyMerge.idRemap.get(preset.proxyId) ?? preset.proxyId : null;
        return {
            ...preset,
            proxyId: remapped !== null && knownProxyIds.has(remapped) ? remapped : null,
            order: index,
        };
    });

    return { merged: result, received: cloud.length - matchedCloud.size, added };
}
