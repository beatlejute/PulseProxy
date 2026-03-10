import { ProxyManager } from './proxy-manager';
import { IconManager } from './icon-manager';
import { Storage } from '../shared/storage';
import { StorageKeys, SYNC_STORAGE_KEYS, ProxyState } from '../shared/constants';
import { ExtensionMessage, StorageChanges, CheckProxyResult } from '../types';

console.log('Background: Starting...');

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
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    console.log('Background: Received message:', message);

    switch (message.action) {
        case 'toggleProxy':
            ProxyManager.toggle();
            break;
        case 'updateIcon':
            if (message.iconPath) {
                IconManager.setIcon(message.iconPath);
            }
            break;
        case 'checkProxy':
            if (message.proxy) {
                checkProxy(message.proxy).then(sendResponse).catch(() => sendResponse('error'));
                return true; // Keep channel open for async response
            }
            break;
        default:
            console.log('Background: Unknown action:', (message as ExtensionMessage).action);
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

async function checkProxy(proxy: NonNullable<ExtensionMessage['proxy']>): Promise<CheckProxyResult> {
    const { type, host, port, username, password } = proxy;
    console.log('Background: Checking proxy:', `${type}://${host}:${port}`);

    const proxyString = type === 'socks4' ? `SOCKS ${host}:${port}`
        : type === 'socks5' ? `SOCKS5 ${host}:${port}`
        : type === 'https' ? `HTTPS ${host}:${port}`
        : `PROXY ${host}:${port}`;

    const pacScript = `function FindProxyForURL(url, host) { return ${JSON.stringify(proxyString)}; }`;

    // Remember current state to restore after check
    const wasConnected = (await Storage.getCurrentState()) === ProxyState.CONNECTED;

    // Temporary auth handler if credentials provided
    let authListener: ((details: chrome.webRequest.OnAuthRequiredDetails, asyncCallback?: (response: chrome.webRequest.BlockingResponse) => void) => chrome.webRequest.BlockingResponse | undefined) | null = null;
    if (username && password) {
        authListener = (_details, asyncCallback) => {
            if (asyncCallback) asyncCallback({ authCredentials: { username: username!, password: password! } });
            return undefined;
        };
        chrome.webRequest.onAuthRequired.addListener(authListener, { urls: ['<all_urls>'] }, ['asyncBlocking']);
    }

    try {
        // Set temporary PAC
        await new Promise<void>(resolve => {
            chrome.proxy.settings.set(
                { value: { mode: 'pac_script', pacScript: { data: pacScript } }, scope: 'regular' },
                resolve
            );
        });

        // Small delay to ensure PAC is applied
        await new Promise(r => setTimeout(r, 200));

        const result = await new Promise<CheckProxyResult>((resolve) => {
            let done = false;
            let tabId: number | null = null;

            const finish = (result: CheckProxyResult) => {
                if (done) return;
                done = true;
                chrome.webNavigation.onCompleted.removeListener(onNav);
                chrome.webNavigation.onErrorOccurred.removeListener(onNavError);
                if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {});
                console.log('Background: Proxy check result:', result, `${host}:${port}`);
                resolve(result);
            };

            const onNav = (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
                if (details.tabId === tabId && details.frameId === 0 && details.url.startsWith('http')) finish('ok');
            };
            const onNavError = (details: chrome.webNavigation.WebNavigationFramedErrorCallbackDetails) => {
                if (details.tabId === tabId && details.frameId === 0 && details.url.startsWith('http')) finish('error');
            };

            chrome.webNavigation.onCompleted.addListener(onNav);
            chrome.webNavigation.onErrorOccurred.addListener(onNavError);

            setTimeout(() => finish('timeout'), CHECK_PROXY_TIMEOUT_MS);

            // Cache-busting to force a real network request through the proxy
            const checkUrl = `${CHECK_PROXY_URL}?_t=${Date.now()}`;
            chrome.tabs.create({ url: checkUrl, active: false }, (tab) => {
                tabId = tab.id ?? null;
            });
        });

        return result;
    } finally {
        // Always cleanup and restore, even if an error occurred
        if (authListener) chrome.webRequest.onAuthRequired.removeListener(authListener);

        console.log('Background: Restoring proxy state, wasConnected:', wasConnected);
        if (wasConnected) {
            await ProxyManager.enable();
        } else {
            await ProxyManager.disable();
        }
    }
}

// Инициализация
async function init() {
    await Storage.init();
    console.log('Background: Storage initialized');
    IconManager.update();
    ProxyManager.init();
}

init();
