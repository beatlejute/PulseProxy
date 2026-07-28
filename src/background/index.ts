import { ProxyManager } from './proxy-manager';
import { IconManager } from './icon-manager';
import { Storage } from '../shared/storage';
import { SyncService } from '../storage/sync-service';
import { StorageKeys, SYNC_STORAGE_KEYS, ProxyState } from '../shared/constants';
import { ExtensionMessage, StorageChanges, CheckProxyResult, CheckProxyBatchItemResult, CheckProxyBatchResponse, ProxyServer } from '../types';
import { trackEvent, sendGA4Event } from '../shared/analytics';

const HEARTBEAT_ALARM = 'ga4_heartbeat';
const HEARTBEAT_INTERVAL_MIN = 10080;

console.log('Background: Starting...');

// Push локальных изменений sync-ключей в облако — только из background:
// debounce-таймер в попапе умирает при его закрытии, и запись терялась
// (состояние откатывалось при следующем открытии попапа).
// Регистрация на верхнем уровне — синхронно, чтобы событие будило service worker.
SyncService.registerLocalToCloudSync();

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        await chrome.storage.local.set({
            ga4_install_ts: Date.now(),
            ga4_activation_count: 0
        });

        await trackEvent('extension_installed', {
            extension_version: chrome.runtime.getManifest().version,
            browser_language: navigator.language,
            install_source: 'chrome_web_store'
        });

        chrome.alarms.create(HEARTBEAT_ALARM, {
            delayInMinutes: HEARTBEAT_INTERVAL_MIN,
            periodInMinutes: HEARTBEAT_INTERVAL_MIN
        });

        chrome.tabs.create({ url: 'welcome.html' });
        await trackEvent('onboarding_started', {
            extension_version: chrome.runtime.getManifest().version,
            referrer: details.reason
        });
    }
});

// Uninstall Survey URL
chrome.runtime.setUninstallURL(
  'https://docs.google.com/forms/d/e/1FAIpQLSdKIlHWDWm-uBlQzHJcohqACl2RotbZ6ckShDC0-SyWlk_Y-g/viewform'
);

// Обработчик изменений в storage
Storage.onChange((changes: StorageChanges, area: string) => {
    // Обработка локальных изменений
    if (area === 'local') {
        if (StorageKeys.TARGET_STATE in changes) {
            ProxyManager.toggle();
        }

        if (StorageKeys.CURRENT_STATE in changes) {
            IconManager.update();
        }
    }

    // Обработка синхронизируемых изменений (с другого устройства)
    if (area === 'sync') {
        console.log('Background: Sync storage changed:', Object.keys(changes));

        // Если изменились пресеты или прокси - переинициализируем прокси
        if (StorageKeys.PRESETS in changes || StorageKeys.PROXIES in changes) {
            console.log('Background: Presets or proxies changed from sync, reinitializing...');
            ProxyManager.init();
        }
    }
});

// Обработчик сообщений
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    console.log('Background: Received message:', message);

    switch (message.action) {
        case 'toggleProxy':
            // После toggle обновляем бейджи всех вкладок: смена proxyByDefault при
            // уже подключённом прокси не меняет currentState, и слушатель смены
            // состояния бейджи не обновит. Ждём завершения toggle — до этого
            // routing-кэш ещё старый.
            // Активный батч публичных прокси отменяем до toggle: его finally
            // восстановил бы состояние прокси, снятое ДО батча, поверх нового.
            void (async () => {
                await abortActiveCheckBatch();
                await ProxyManager.toggle();
                await refreshAllTabBadges();
            })();
            break;
        case 'resetProxyCache':
            ProxyManager.resetCache();
            sendResponse({ success: true });
            break;
        case 'updateIcon':
            if (message.iconPath) {
                IconManager.setIcon(message.iconPath);
            }
            break;
        case 'checkProxy':
            if (message.proxy) {
                checkProxy(message.proxy).then(sendResponse).catch(() => sendResponse('error'));
                return true;
            }
            break;
        case 'checkProxyBatch':
            if (message.proxies?.length) {
                checkProxyBatch(message.proxies)
                    .then(sendResponse)
                    .catch(() => sendResponse({ results: message.proxies.map(() => 'error') }));
                return true;
            }
            break;
        case 'abortCheckBatch':
            abortActiveCheckBatch().then(() => sendResponse({ success: true }));
            return true;
        case 'deleteProxy':
            if (message.proxyId) {
                console.log('Background: Deleting proxy via Storage API:', message.proxyId);
                Storage.deleteProxy(message.proxyId)
                    .then(() => {
                        console.log('Background: Proxy deleted successfully');
                        sendResponse({ success: true });
                    })
                    .catch((e: unknown) => {
                        console.error('Background: Error deleting proxy:', e);
                        sendResponse({ success: false, error: String(e) });
                    });
                return true;
            }
            break;
        case 'trackGA4Event':
            sendGA4Event(message.eventName, message.params)
                .then(() => sendResponse({ success: true }))
                .catch((e: unknown) => sendResponse({ success: false, error: String(e) }));
            return true;
        default:
            console.log('Background: Unknown action:', message.action);
    }
});

// Proxy error detection
const PROXY_ERRORS = [
    'net::ERR_PROXY_CONNECTION_FAILED',
    'net::ERR_TUNNEL_CONNECTION_FAILED',
    'net::ERR_PROXY_AUTH_UNSUPPORTED',
    'net::ERR_SOCKS_CONNECTION_FAILED',
    'net::ERR_TIMED_OUT',
    'net::ERR_EMPTY_RESPONSE',
];

chrome.webRequest.onErrorOccurred.addListener(
    async (details) => {
        if (!PROXY_ERRORS.includes(details.error)) return;

        const currentState = await Storage.getCurrentState();
        if (currentState !== ProxyState.CONNECTED) return;

        const proxyLabel = ProxyManager.getProxyForUrl(details.url);
        if (!proxyLabel) return;

        console.log('Background: Proxy error detected:', details.error, 'proxy:', proxyLabel, 'url:', details.url);
        await chrome.storage.local.set({ [StorageKeys.ERROR_PROXY]: proxyLabel });
        await Storage.setCurrentState(ProxyState.ERROR);
    },
    { urls: ['<all_urls>'] }
);

// Auto-recover from error state when a proxied request succeeds
chrome.webRequest.onCompleted.addListener(
    async (details) => {
        const currentState = await Storage.getCurrentState();
        if (currentState !== ProxyState.ERROR) return;

        const proxyLabel = ProxyManager.getProxyForUrl(details.url);
        if (!proxyLabel) return;

        console.log('Background: Proxy recovered, successful request via', proxyLabel, 'url:', details.url);
        await chrome.storage.local.remove(StorageKeys.ERROR_PROXY);
        await Storage.setCurrentState(ProxyState.CONNECTED);
    },
    { urls: ['<all_urls>'] }
);

// Proxy connectivity check — use HTTP to avoid CONNECT tunnel issues with HTTP proxies
const CHECK_PROXY_URL = 'http://example.com/';
const CHECK_PROXY_TIMEOUT_MS = 15000;

let isChecking = false;

export function getIsChecking(): boolean {
    return isChecking;
}

export function resetIsChecking(): void {
    isChecking = false;
}

async function checkProxy(proxy: NonNullable<ExtensionMessage['proxy']>): Promise<CheckProxyResult> {
    // Одиночная проверка (пользователь добавляет прокси) приоритетнее фонового
    // батча публичных прокси — снимаем батч и дожидаемся восстановления настроек.
    await abortActiveCheckBatch();
    if (isChecking) {
        return 'error';
    }
    isChecking = true;

    const { type, host, port, username, password } = proxy;
    console.log('Background: Checking proxy:', `${type}://${host}:${port}`);

    const wasConnected = (await Storage.getCurrentState()) === ProxyState.CONNECTED;

    if (username && password) {
        ProxyManager.addTemporaryCredentials(host, port, username, password);
    }

    try {
        const testId = crypto.randomUUID();
        const testProxy: Partial<ProxyServer> = { type, host, port };
        const pacScript = await ProxyManager.generateCheckPacScript(testProxy, testId);

        await new Promise<void>(resolve => {
            chrome.proxy.settings.set(
                { value: { mode: 'pac_script', pacScript: { data: pacScript } }, scope: 'regular' },
                resolve
            );
        });

        const url = `http://example.com/?_pulse_check=${testId}`;
        let response: Response;
        try {
            // Bypass HTTP cache — the test must hit the network via PAC, not return a cached response.
            response = await fetch(url, {
                signal: AbortSignal.timeout(CHECK_PROXY_TIMEOUT_MS),
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                },
            });
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') {
                return 'timeout';
            }
            return 'error';
        }

        return response.ok ? 'ok' : 'error';
    } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
            return 'timeout';
        }
        return 'error';
    } finally {
        isChecking = false;
        ProxyManager.removeTemporaryCredentials(host, port);
        await ProxyManager.restoreAfterCheck(wasConnected);
    }
}

// === Батч-проверка публичных прокси ===
// Один PAC-скрипт с N test-rule (у каждого прокси свой testId) + N параллельных
// fetch под единственной установкой/восстановлением chrome.proxy.settings —
// настройки прокси глобальны, менять их на каждый прокси нельзя.

let activeBatchAbort: AbortController | null = null;
let activeBatchDone: Promise<unknown> | null = null;

export async function abortActiveCheckBatch(): Promise<void> {
    activeBatchAbort?.abort();
    if (activeBatchDone) {
        try {
            await activeBatchDone;
        } catch {
            // Результат отменённого батча не нужен
        }
    }
}

// AbortSignal.any недоступен в старых окружениях — комбинируем вручную
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    for (const signal of signals) {
        if (signal.aborted) {
            controller.abort();
            break;
        }
        signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
}

async function checkProxyBatch(
    proxies: NonNullable<ExtensionMessage['proxies']>
): Promise<CheckProxyBatchResponse> {
    if (isChecking) {
        return { busy: true };
    }
    isChecking = true;
    const abortController = new AbortController();
    activeBatchAbort = abortController;

    const run = (async (): Promise<CheckProxyBatchResponse> => {
        const wasConnected = (await Storage.getCurrentState()) === ProxyState.CONNECTED;
        try {
            const entries = proxies.map(({ type, host, port }) => ({
                proxy: { type, host, port } as Partial<ProxyServer>,
                testId: crypto.randomUUID(),
            }));
            const pacScript = await ProxyManager.generateBatchCheckPacScript(entries);

            await new Promise<void>(resolve => {
                chrome.proxy.settings.set(
                    { value: { mode: 'pac_script', pacScript: { data: pacScript } }, scope: 'regular' },
                    resolve
                );
            });

            const results = await Promise.all(entries.map(async ({ testId }): Promise<CheckProxyBatchItemResult> => {
                try {
                    const response = await fetch(`${CHECK_PROXY_URL}?_pulse_check=${testId}`, {
                        signal: combineAbortSignals(AbortSignal.timeout(CHECK_PROXY_TIMEOUT_MS), abortController.signal),
                        cache: 'no-store',
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                        },
                    });
                    return response.ok ? 'ok' : 'error';
                } catch (e) {
                    if (abortController.signal.aborted) {
                        return 'aborted';
                    }
                    if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
                        return 'timeout';
                    }
                    return 'error';
                }
            }));

            return { results };
        } catch {
            return { results: proxies.map((): CheckProxyBatchItemResult => 'error') };
        } finally {
            isChecking = false;
            activeBatchAbort = null;
            await ProxyManager.restoreAfterCheck(wasConnected);
        }
    })();

    activeBatchDone = run;
    return run;
}

// Per-tab proxy badge: update badge when navigating to a new page
async function updateTabBadge(tabId: number, url: string | undefined): Promise<void> {
    try {
        if (!url) {
            IconManager.setTabProxyBadge(tabId, null);
            return;
        }

        const currentState = await Storage.getCurrentState();
        if (currentState === ProxyState.CONNECTED || currentState === ProxyState.ERROR) {
            const route = ProxyManager.getRouteForUrl(url);
            const isError = currentState === ProxyState.ERROR;
            IconManager.setTabProxyBadge(tabId, route?.server ?? null, isError, route?.viaProxyAll ?? false);
        } else {
            IconManager.setTabProxyBadge(tabId, null);
        }
    } catch {
        // Tab may have been closed between navigation event and badge update
    }
}

// Refresh badges of all open tabs (state or routing config changed)
async function refreshAllTabBadges(): Promise<void> {
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.id != null) {
                updateTabBadge(tab.id, tab.url);
            }
        }
    } catch {
        // Ignore errors during tab enumeration
    }
}

// Update badge on page navigation (main frame only)
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    updateTabBadge(details.tabId, details.url);
});

// Update badge when active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        updateTabBadge(activeInfo.tabId, tab.url);
    } catch {
        // Tab may no longer exist
    }
});

// Refresh all tabs' badges when proxy state changes
Storage.onChange(async (changes: StorageChanges, area: string) => {
    if (area === 'local' && StorageKeys.CURRENT_STATE in changes) {
        await refreshAllTabBadges();
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== HEARTBEAT_ALARM) return;

    const result = await chrome.storage.local.get(['ga4_install_ts', 'ga4_activation_count']);
    const ga4_install_ts = (result['ga4_install_ts'] as number) || 0;
    const ga4_activation_count = (result['ga4_activation_count'] as number) || 0;

    const proxies = await Storage.getProxies();
    const proxyConfigured = proxies.length > 0 ? 'true' : 'false';
    const presets = await Storage.getPresets();

    await trackEvent('extension_active_session', {
        days_since_install: Math.floor((Date.now() - ga4_install_ts) / 86400000),
        total_activations: ga4_activation_count,
        extension_version: chrome.runtime.getManifest().version,
        proxy_configured: proxyConfigured,
        presets_count: presets.length
    });
});

// Инициализация
async function init() {
    await Storage.init();
    console.log('Background: Storage initialized');
    IconManager.update();
    ProxyManager.init();
}

init();
