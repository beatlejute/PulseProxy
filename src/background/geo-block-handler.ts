import { classifyGeoBlock } from '../shared/geo-block';
import { pickPoolChain } from '../shared/public-pool';
import { ProxyManager } from './proxy-manager';
import { IconManager } from './icon-manager';
import { setMark, clearMarkIfNotMatching } from './geo-block-marks';
import { Storage } from '../shared/storage';

export function handleGeoBlockResponse(details: chrome.webRequest.OnResponseStartedDetails): void {
    if (details.tabId < 0) return;
    const url = details.url || '';
    const route = ProxyManager.getRouteForUrl(url);
    if (!route) {
        clearMarkIfNotMatching(details.tabId, details.requestId);
        IconManager.setTabProxyBadge(details.tabId, null, false, false);
        return;
    }

    if (route.kind === 'pool') {
        handlePoolResponse(details, url, route);
        return;
    }

    const geoResult = classifyGeoBlock(
        'own',
        details.type,
        url,
        details.statusCode,
        undefined,
        details.responseHeaders
    );

    if (geoResult.geoBlocked) {
        try {
            const host = new URL(url).host;
            setMark(details.tabId, details.requestId, host);
        } catch {
            // ignore invalid URL
        }
        IconManager.setTabProxyBadge(details.tabId, route, false, true);
    } else {
        clearMarkIfNotMatching(details.tabId, details.requestId);
        IconManager.setTabProxyBadge(details.tabId, route, false, false);
    }
}

export function handleGeoBlockRedirect(details: chrome.webRequest.OnBeforeRedirectDetails): void {
    if (details.tabId < 0) return;
    const url = details.url || '';
    const route = ProxyManager.getRouteForUrl(url);
    if (!route) {
        clearMarkIfNotMatching(details.tabId, details.requestId);
        IconManager.setTabProxyBadge(details.tabId, null, false, false);
        return;
    }

    if (route.kind === 'pool') {
        handlePoolRedirect(details, url, route);
        return;
    }

    const geoResult = classifyGeoBlock(
        'own',
        details.type,
        url,
        details.statusCode,
        details.redirectUrl
    );

    if (geoResult.geoBlocked) {
        try {
            const host = new URL(url).host;
            setMark(details.tabId, details.requestId, host);
        } catch {
            // ignore invalid URL
        }
        IconManager.setTabProxyBadge(details.tabId, route, false, true);
    } else {
        clearMarkIfNotMatching(details.tabId, details.requestId);
        IconManager.setTabProxyBadge(details.tabId, route, false, false);
    }
}

async function handlePoolResponse(
    details: chrome.webRequest.OnResponseStartedDetails,
    url: string,
    route: NonNullable<ReturnType<typeof ProxyManager.getRouteForUrl>>,
): Promise<void> {
    const geoResult = classifyGeoBlock(
        'pool',
        details.type,
        url,
        details.statusCode,
        undefined,
        details.responseHeaders
    );

    if (!geoResult.geoBlocked) {
        if (details.type === 'main_frame') {
            const presetId = route.presetId || '';
            const poolRule = route.poolRule || '';
            if (presetId && poolRule) {
                await Storage.resetPresetGeoSite(presetId, poolRule);
            }
        }
        clearMarkIfNotMatching(details.tabId, details.requestId);
        IconManager.setTabProxyBadge(details.tabId, route, false, false);
        return;
    }

    await processPoolGeoBlock(details, url, route);
}

async function handlePoolRedirect(
    details: chrome.webRequest.OnBeforeRedirectDetails,
    url: string,
    route: NonNullable<ReturnType<typeof ProxyManager.getRouteForUrl>>,
): Promise<void> {
    const geoResult = classifyGeoBlock(
        'pool',
        details.type,
        url,
        details.statusCode,
        details.redirectUrl
    );

    if (!geoResult.geoBlocked) {
        if (details.type === 'main_frame') {
            const presetId = route.presetId || '';
            const poolRule = route.poolRule || '';
            if (presetId && poolRule) {
                await Storage.resetPresetGeoSite(presetId, poolRule);
            }
        }
        clearMarkIfNotMatching(details.tabId, details.requestId);
        IconManager.setTabProxyBadge(details.tabId, route, false, false);
        return;
    }

    await processPoolGeoBlock(details, url, route);
}

async function processPoolGeoBlock(
    details: chrome.webRequest.OnResponseStartedDetails | chrome.webRequest.OnBeforeRedirectDetails,
    url: string,
    route: NonNullable<ReturnType<typeof ProxyManager.getRouteForUrl>>,
): Promise<void> {
    const presetId = route.presetId || '';
    const poolRule = route.poolRule || '';

    if (!presetId || !poolRule) {
        try {
            const host = new URL(url).host;
            setMark(details.tabId, details.requestId, host);
        } catch {
            // ignore invalid URL
        }
        IconManager.setTabProxyBadge(details.tabId, route, false, true);
        return;
    }

    const now = Date.now();
    const siteState = await Storage.getPresetGeoSite(presetId, poolRule, now);

    // Сайт остановлен — только отметка
    if (siteState.stopped) {
        try {
            const host = new URL(url).host;
            setMark(details.tabId, details.requestId, host);
        } catch {
            // ignore invalid URL
        }
        IconManager.setTabProxyBadge(details.tabId, route, false, true);
        return;
    }

    // Выбор прокси для исключения. Цепочка строится по строкам PAC участников —
    // тем же входом, что pickFromPool в PAC-скрипте, иначе цепочки расходятся
    // и исключается не голова ответа FindProxyForURL.
    const members = route.poolMembers || [];
    const chain = pickPoolChain(members.map((m) => m.pac), poolRule);

    let excludedMemberKey: string | null = null;
    if (chain.length > 0) {
        const detailsIp = (details as chrome.webRequest.OnResponseStartedDetails).ip || '';
        const chainMembers = members.filter((m) => chain.includes(m.pac));

        const matchedMember = chainMembers.find((m) => m.ip === detailsIp);
        if (matchedMember) {
            excludedMemberKey = matchedMember.key;
        } else {
            const headPac = chain[0];
            const headMember = members.find((m) => m.pac === headPac);
            if (headMember) {
                excludedMemberKey = headMember.key;
            }
        }
    }

    // Не опустошать пресет: исключение не делаем, если в пуле пресета не останется участников
    const exclusions = await Storage.getPresetGeoExclusions(presetId);
    const presetExclusions = exclusions[presetId] || {};
    const currentExcludedKeys = Object.keys(presetExclusions);

    if (excludedMemberKey) {
        const wouldEmptyPool = members.length === 1 && members[0].key === excludedMemberKey;
        if (!wouldEmptyPool) {
            await Storage.addPresetGeoExclusion(presetId, excludedMemberKey, now);
        }
    }

    // Увеличить серию сайта
    const updatedSiteState = await Storage.incrementPresetGeoSite(presetId, poolRule, now);

    if (updatedSiteState.stopped) {
        try {
            const host = new URL(url).host;
            setMark(details.tabId, details.requestId, host);
        } catch {
            // ignore invalid URL
        }
        IconManager.setTabProxyBadge(details.tabId, route, false, true);
    } else {
        try {
            const host = new URL(url).host;
            setMark(details.tabId, details.requestId, host);
        } catch {
            // ignore invalid URL
        }
        IconManager.setTabProxyBadge(details.tabId, route, false, true);

        // Перезагрузка вкладки: только main_frame с GET; refresh при любом методе
        const isMainFrame = (details as chrome.webRequest.OnResponseStartedDetails).type === 'main_frame';
        if (isMainFrame) {
            await ProxyManager.refreshIfConnected();
        }
        if (isMainFrame && details.method === 'GET') {
            chrome.tabs.reload(details.tabId);
        }
    }
}

