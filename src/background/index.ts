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
                checkProxy(message.proxy).then(sendResponse);
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

// Proxy connectivity check
const CHECK_PROXY_URL = 'http://cp.cloudflare.com/';
const CHECK_PROXY_URL_FILTER = '*://cp.cloudflare.com/*';
const CHECK_PROXY_TIMEOUT_MS = 10000;

async function checkProxy(proxy: NonNullable<ExtensionMessage['proxy']>): Promise<CheckProxyResult> {
    const { type, host, port, username, password } = proxy;

    const proxyString = type === 'socks4' ? `SOCKS ${host}:${port}`
        : type === 'socks5' ? `SOCKS5 ${host}:${port}`
        : type === 'https' ? `HTTPS ${host}:${port}`
        : `PROXY ${host}:${port}`;

    const pacScript = `function FindProxyForURL(url, host) { return ${JSON.stringify(proxyString)}; }`;

    // Save current proxy settings, then set temporary PAC for the check
    const previousSettings = await new Promise<{ value: chrome.proxy.ProxyConfig; levelOfControl: string }>(resolve => {
        chrome.proxy.settings.get({ incognito: false }, resolve as (details: { value: chrome.proxy.ProxyConfig; levelOfControl: string; incognitoSpecific?: boolean }) => void);
    });

    await new Promise<void>(resolve => {
        chrome.proxy.settings.set(
            { value: { mode: 'pac_script', pacScript: { data: pacScript } }, scope: 'regular' },
            resolve
        );
    });

    // Temporary auth handler for this check
    let authListener: ((details: chrome.webRequest.OnAuthRequiredDetails, asyncCallback?: (response: chrome.webRequest.BlockingResponse) => void) => chrome.webRequest.BlockingResponse | undefined) | null = null;
    if (username && password) {
        authListener = (_details, asyncCallback) => {
            if (asyncCallback) asyncCallback({ authCredentials: { username: username!, password: password! } });
            return undefined;
        };
        chrome.webRequest.onAuthRequired.addListener(
            authListener,
            { urls: [CHECK_PROXY_URL_FILTER] },
            ['asyncBlocking']
        );
    }

    return new Promise<CheckProxyResult>(resolve => {
        let resolved = false;
        let tabId: number | null = null;

        const done = (result: CheckProxyResult) => {
            if (resolved) return;
            resolved = true;
            if (authListener) chrome.webRequest.onAuthRequired.removeListener(authListener!);
            chrome.webRequest.onCompleted.removeListener(onCompleted);
            chrome.webRequest.onErrorOccurred.removeListener(onError);
            // Restore previous proxy settings
            chrome.proxy.settings.set({ value: previousSettings.value, scope: 'regular' }, () => {});
            if (tabId !== null) chrome.tabs.remove(tabId).catch(() => {});
            console.log('Background: Proxy check result:', result, `${host}:${port}`);
            resolve(result);
        };

        const onCompleted = (details: chrome.webRequest.OnCompletedDetails) => {
            if (tabId !== null && details.tabId === tabId) done('ok');
        };
        const onError = (details: chrome.webRequest.OnErrorOccurredDetails) => {
            if (tabId !== null && details.tabId === tabId) done('error');
        };

        chrome.webRequest.onCompleted.addListener(onCompleted, { urls: [CHECK_PROXY_URL_FILTER] });
        chrome.webRequest.onErrorOccurred.addListener(onError, { urls: [CHECK_PROXY_URL_FILTER] });

        setTimeout(() => done('timeout'), CHECK_PROXY_TIMEOUT_MS);

        chrome.tabs.create({ url: CHECK_PROXY_URL, active: false }, tab => {
            tabId = tab.id ?? null;
        });
    });
}

// Инициализация
async function init() {
    await Storage.init();
    console.log('Background: Storage initialized');
    IconManager.update();
    ProxyManager.init();
}

init();
