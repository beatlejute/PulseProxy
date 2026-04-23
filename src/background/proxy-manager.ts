import { Storage } from '../shared/storage';
import { ProxyState, Config } from '../shared/constants';
import { ProxyServer, ProxyType } from '../types';
import { toASCII } from '../shared/punycode';
import { matchesDomain } from '../shared/domain-matcher';
import { trackEvent } from '../shared/analytics';

/**
 * Validates proxy host to prevent Script Injection attacks.
 * Accepts IPv4, IPv6 (with brackets), hostname (RFC 1123), but rejects XSS payloads and malformed input.
 *
 * @param host - The host to validate
 * @returns true if valid, false otherwise
 */
export function validateProxyHost(host: string): boolean {
    console.log('ProxyManager: validateProxyHost called with host:', JSON.stringify(host));
    if (!host || typeof host !== 'string') {
        console.log('ProxyManager: validateProxyHost false — host missing or not string');
        return false;
    }

    // Reject if longer than max domain length (253 chars)
    if (host.length > 253) {
        console.log('ProxyManager: validateProxyHost false — host too long');
        return false;
    }

    // Reject obvious XSS injection patterns
    if (/[<>"'`]/.test(host) || /script|alert|onerror|onclick|onload/i.test(host)) {
        console.log('ProxyManager: validateProxyHost false — XSS pattern detected');
        return false;
    }

    // Reject spaces and @ symbols
    if (/[\s@]/.test(host)) {
        console.log('ProxyManager: validateProxyHost false — space or @ symbol detected');
        return false;
    }

    // IPv4 pattern: 4 octets 0-255
    const ipv4Pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (ipv4Pattern.test(host)) {
        return true;
    }

    // IPv6 pattern: supports bracketed formats like [::1], [2001:db8::1], [fe80::1]
    // Also supports IPv4-mapped IPv6 like [::ffff:192.168.1.1]
    if (host.startsWith('[') && host.endsWith(']')) {
        const ipv6Content = host.slice(1, -1);
        // Check for IPv4-mapped format: ::ffff:x.x.x.x
        if (/^::ffff:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(ipv6Content)) {
            return true;
        }
        // Basic IPv6 format: hex digits and colons, at least one colon
        const ipv6SimplePattern = /^[0-9a-fA-F:]+$/;
        if (ipv6SimplePattern.test(ipv6Content) && ipv6Content.includes(':')) {
            return true;
        }
    }

    // Hostname pattern (RFC 1123):
    // - Labels: letters, digits, hyphens
    // - Cannot start/end with hyphen
    // - Labels separated by dots
    // - Cannot have consecutive dots
    // - Cannot start/end with dot
    // Each label must not start or end with hyphen
    // Split by dots and validate each label
    const labels = host.split('.');
    for (const label of labels) {
        if (label.length === 0) return false; // empty label (consecutive dots)
        if (label.length > 63) return false; // label max length
        if (!/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)) {
            return false; // label doesn't match RFC 1123
        }
    }
    return true;
}

/**
 * Validates proxy port number.
 * Must be an integer in range 1-65535.
 *
 * @param port - The port to validate
 * @returns true if valid, false otherwise
 */
export function validateProxyPort(port: number): boolean {
    if (typeof port !== 'number') {
        return false;
    }

    // Reject NaN, Infinity, non-integers
    if (!Number.isFinite(port) || !Number.isInteger(port)) {
        return false;
    }

    // Must be in valid port range
    return port >= 1 && port <= 65535;
}

class ProxyManagerService {
    private domains: string[] = [];
    private credentials: Map<string, { username: string; password: string }> = new Map();
    private temporaryCredentials: Map<string, { username: string; password: string }> = new Map();
    private authHandlerRegistered = false;

    // PAC routing state (mirrors the active PAC script logic)
    // domain -> proxy label (host:port)
    private domainProxyMap: Map<string, string> = new Map();
    private domainProxyServerMap: Map<string, ProxyServer> = new Map();
    private ignoreDomains: Set<string> = new Set();
    private proxyByDefault: boolean = false;
    private defaultProxyLabel: string = '';
    private defaultProxyServer: ProxyServer | null = null;

    // PAC caching
    private cachedPacScript: string | null = null;
    private cachedConfigHash: string | null = null;

    // Generation counter: incremented on every applyPacScript call, disable(), and resetCache().
    // The applyPacScript callback compares its captured generation against the current value;
    // if they differ, the callback is stale (superseded by a later enable/disable) and is ignored.
    // This prevents stale applyPacScript callbacks from overwriting a newer currentState.
    private enableGeneration = 0;

    // Track the defaultProxy ID that was used for the last enable() call
    // to detect proxy switches and reconnect instead of disconnect
    private lastConnectedProxyId: string | null = null;

    // Returns proxy label (host:port) if URL is routed through proxy, null if DIRECT
    getProxyForUrl(url: string): string | null {
        let host: string;
        try {
            host = new URL(url).hostname;
        } catch {
            return null;
        }

        // Check ignore list first (always DIRECT)
        for (const domain of this.ignoreDomains) {
            if (matchesDomain(host, domain)) return null;
        }

        // Check domain-specific proxy rules
        for (const [domain, label] of this.domainProxyMap) {
            if (matchesDomain(host, domain)) return label;
        }

        return this.proxyByDefault ? this.defaultProxyLabel : null;
    }

    // Returns ProxyServer object if URL is routed through proxy, null if DIRECT
    getProxyServerForUrl(url: string): ProxyServer | null {
        let host: string;
        try {
            host = new URL(url).hostname;
        } catch {
            return null;
        }

        for (const domain of this.ignoreDomains) {
            if (matchesDomain(host, domain)) return null;
        }

        for (const [domain, server] of this.domainProxyServerMap) {
            if (matchesDomain(host, domain)) return server;
        }

        return this.proxyByDefault ? this.defaultProxyServer : null;
    }

    async init(): Promise<void> {
        console.log('ProxyManager: Initializing...');
        await this.loadDomainsFromPresets();
        await this.loadCredentials();

        // Регистрация обработчика авторизации (только один раз)
        this.registerAuthHandler();

        // Регистрация обработчика для инвалидации кеша при изменении storage
        this.registerStorageChangeListener();

        const targetState = await Storage.getTargetState();
        console.log('ProxyManager: Initial targetState =', targetState);

        if (targetState === ProxyState.CONNECTED) {
            await Storage.setCurrentState(ProxyState.CONNECTING);
            setTimeout(() => this.toggle(), Config.INITIALIZATION_DELAY);
        } else {
            await this.disable();
        }
    }

    private registerStorageChangeListener(): void {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local') {
                const relevantKeys = ['presets', 'proxies', 'proxyByDefault', 'defaultProxy'];
                const hasRelevantChanges = relevantKeys.some(key => key in changes);
                if (hasRelevantChanges) {
                    console.log('ProxyManager: Storage changed, invalidating PAC cache');
                    this.cachedPacScript = null;
                    this.cachedConfigHash = null;
                }
            }
        });
    }

    private computeConfigHash(presets: any[], proxies: any[], proxyByDefault: boolean): string {
        const config = JSON.stringify({ presets, proxies, proxyByDefault });
        console.log('ProxyManager: computeConfigHash input:', config);
        let hash = 5381;
        for (let i = 0; i < config.length; i++) {
            hash = ((hash << 5) + hash) + config.charCodeAt(i);
        }
        const result = (hash >>> 0).toString(36);
        console.log('ProxyManager: computeConfigHash result:', result);
        return result;
    }

    private registerAuthHandler(): void {
        if (this.authHandlerRegistered) {
            return;
        }
        // Регистрируем обработчик для авторизации прокси
        if (chrome.webRequest && chrome.webRequest.onAuthRequired) {
            chrome.webRequest.onAuthRequired.addListener(
                (details: chrome.webRequest.OnAuthRequiredDetails, asyncCallback?: (response: chrome.webRequest.BlockingResponse) => void) => {
                    const response = this.handleAuthRequired(details);
                    if (asyncCallback) {
                        asyncCallback(response);
                    }
                    return response;
                },
                { urls: ['<all_urls>'] },
                ['asyncBlocking']
            );
            this.authHandlerRegistered = true;
        }
    }

    private handleAuthRequired(
        details: any
    ): any {
        const challenger = details.challenger;
        if (challenger) {
            const key = `${challenger.host}:${challenger.port}`;
            console.log('ProxyManager: Auth required for', key, 'isProxy:', details.isProxy, 'available keys:', Array.from(this.credentials.keys()));
            const tempCreds = this.temporaryCredentials.get(key);
            if (tempCreds) {
                console.log('ProxyManager: Providing auth from temporaryCredentials for', key);
                return { authCredentials: { username: tempCreds.username, password: tempCreds.password } };
            }
            const creds = this.credentials.get(key);
            if (creds) {
                console.log('ProxyManager: Providing auth for', key);
                return { authCredentials: { username: creds.username, password: creds.password } };
            }
        }

        return { cancel: true };
    }

    addTemporaryCredentials(host: string, port: number, username: string, password: string): void {
        this.temporaryCredentials.set(`${host}:${port}`, { username, password });
    }

    removeTemporaryCredentials(host: string, port: number): void {
        this.temporaryCredentials.delete(`${host}:${port}`);
    }

    private async loadCredentials(): Promise<void> {
        const proxies = await Storage.getProxies();
        this.credentials.clear();

        for (const proxy of proxies) {
            if (proxy.username && proxy.password) {
                const key = `${proxy.host}:${proxy.port}`;
                this.credentials.set(key, {
                    username: proxy.username,
                    password: proxy.password,
                });
            }
        }
        console.log('ProxyManager: Loaded credentials for', this.credentials.size, 'proxies');
    }

    async toggle(): Promise<void> {
        const targetState = await Storage.getTargetState();
        const currentState = await Storage.getCurrentState();
        const defaultProxy = await Storage.getDefaultProxy();
        const currentProxyId = defaultProxy?.id ?? null;
        console.log('ProxyManager: Toggling, targetState =', targetState, 'currentState =', currentState, 'currentProxyId =', currentProxyId, 'lastConnectedProxyId =', this.lastConnectedProxyId);

        // When currentState is ERROR and the default proxy has changed since the last
        // connection attempt, check targetState to determine action.
        // This fixes DEF-QA059-3: ERROR+changedId branch was ignoring targetState
        // and always calling enable(), causing infinite reconnect loop when user
        // wants to disconnect.
        if (currentState === ProxyState.ERROR && currentProxyId !== this.lastConnectedProxyId) {
            if (targetState === ProxyState.DISCONNECTED) {
                await this.disable();
            } else {
                await this.enable();
            }
        } else if (targetState === ProxyState.CONNECTED) {
            await this.enable();
        } else {
            await this.disable();
        }
    }

    async enable(): Promise<void> {
        await this.loadDomainsFromPresets();
        await this.loadCredentials();

        const [activePresets, proxies, proxyByDefault] = await Promise.all([
            Storage.getActivePresets(),
            Storage.getProxies(),
            Storage.getProxyByDefault(),
        ]);

        const configHash = this.computeConfigHash(activePresets, proxies, proxyByDefault);

        // Get defaultProxy early to validate before cache check
        const defaultProxy = await Storage.getDefaultProxy();

        // Validate proxy host and port BEFORE any caching or applying logic
        // This prevents cache-hit from bypassing validation (DEF-QA059-1)
        if (defaultProxy) {
            console.log('ProxyManager: enable() validating defaultProxy:', defaultProxy.host, defaultProxy.port);
            if (!validateProxyHost(defaultProxy.host)) {
                const error = new Error(`Invalid proxy host: ${defaultProxy.host}`);
                console.error('ProxyManager:', error.message);
                await Storage.setCurrentState(ProxyState.ERROR);
                throw error;
            }

            if (!validateProxyPort(defaultProxy.port)) {
                const error = new Error(`Invalid proxy port: ${defaultProxy.port}`);
                console.error('ProxyManager:', error.message);
                await Storage.setCurrentState(ProxyState.ERROR);
                throw error;
            }
        }

        console.log('ProxyManager: enable() cache check — configHash:', configHash, 'cachedConfigHash:', this.cachedConfigHash, 'cachedPacScript exists:', !!this.cachedPacScript);
        if (configHash === this.cachedConfigHash && this.cachedPacScript) {
            console.log('ProxyManager: Using cached PAC script (hash:', configHash + ')');
            const pacScript = this.cachedPacScript;
            await this.updateRoutingCache();
            this.lastConnectedProxyId = defaultProxy?.id ?? null;
            const gen = ++this.enableGeneration;
            return this.applyPacScript(pacScript, defaultProxy, gen);
        }

        if (!defaultProxy) {
            console.log('ProxyManager: No proxy configured');
            await Storage.setCurrentState(ProxyState.DISCONNECTED);
            return;
        }

        const pacScript = await this.generatePacScript();

        this.cachedPacScript = pacScript;
        this.cachedConfigHash = configHash;
        console.log('ProxyManager: Cached new PAC script (hash:', configHash + ')');

        await this.updateRoutingCache();

        // Track the proxy ID used for this connection
        this.lastConnectedProxyId = defaultProxy?.id ?? null;

        const gen = ++this.enableGeneration;
        return this.applyPacScript(pacScript, defaultProxy, gen);
    }

    private async applyPacScript(pacScript: string, defaultProxy?: ProxyServer, gen = 0): Promise<void> {
        return new Promise((resolve) => {
            chrome.proxy.settings.set(
                {
                    value: { mode: 'pac_script', pacScript: { data: pacScript } },
                    scope: 'regular',
                },
                async () => {
                    // Stale-callback guard: if enableGeneration changed since this applyPacScript
                    // was called (e.g., disable() or resetCache() ran in the meantime), ignore
                    // the callback so it cannot overwrite the newer currentState.
                    if (gen !== this.enableGeneration) {
                        console.log('ProxyManager: Stale applyPacScript callback ignored (gen', gen, '!== current', this.enableGeneration + ')');
                        resolve();
                        return;
                    }
                    if (chrome.runtime.lastError) {
                        console.error('ProxyManager: Error setting proxy:', chrome.runtime.lastError.message);
                        Storage.setCurrentState(ProxyState.ERROR);
                    } else {
                        console.log('ProxyManager: Proxy enabled');
                        Storage.setCurrentState(ProxyState.CONNECTED);

                        if (defaultProxy) {
                            const result = await chrome.storage.local.get(['ga4_activation_count', 'ga4_install_ts']);
                            const ga4_activation_count = (result.ga4_activation_count as number) || 0;
                            const ga4_install_ts = (result.ga4_install_ts as number) || 0;

                            const newCount = ga4_activation_count + 1;
                            await chrome.storage.local.set({ ga4_activation_count: newCount });

                            await trackEvent('proxy_activated', {
                                proxy_type: defaultProxy.type,
                                activation_count: newCount,
                                time_since_install_sec: Math.floor((Date.now() - ga4_install_ts) / 1000)
                            });
                        }
                    }
                    resolve();
                }
            );
        });
    }

    async disable(): Promise<void> {
        console.log('ProxyManager: Disabling proxy...');
        // Invalidate any in-flight applyPacScript callbacks so they cannot
        // overwrite the 'disconnected' state we are about to set.
        ++this.enableGeneration;

        // Clear routing cache so getProxyForUrl() returns null while proxy is disabled.
        // This prevents the auto-recovery handler (webRequest.onCompleted) from
        // falsely switching currentState to 'connected' when no proxy is active.
        this.clearRoutingCache();

        return new Promise((resolve) => {
            chrome.proxy.settings.clear({ scope: 'regular' }, () => {
                if (chrome.runtime.lastError) {
                    console.error('ProxyManager: Error clearing proxy:', chrome.runtime.lastError.message);
                    Storage.setCurrentState(ProxyState.ERROR);
                } else {
                    console.log('ProxyManager: Proxy disabled');
                    this.lastConnectedProxyId = null;
                    Storage.setCurrentState(ProxyState.DISCONNECTED);
                }
                resolve();
            });
        });
    }

    private clearRoutingCache(): void {
        this.proxyByDefault = false;
        this.defaultProxyLabel = '';
        this.defaultProxyServer = null;
        this.ignoreDomains = new Set();
        this.domainProxyMap = new Map();
        this.domainProxyServerMap = new Map();
    }

    private async updateRoutingCache(): Promise<void> {
        const [activePresets, proxies, proxyByDefault, defaultProxy] = await Promise.all([
            Storage.getActivePresets(),
            Storage.getProxies(),
            Storage.getProxyByDefault(),
            Storage.getDefaultProxy(),
        ]);

        this.proxyByDefault = proxyByDefault;
        this.defaultProxyLabel = defaultProxy ? this.proxyLabel(defaultProxy) : '';
        this.defaultProxyServer = defaultProxy || null;
        this.ignoreDomains = new Set();
        this.domainProxyMap = new Map();
        this.domainProxyServerMap = new Map();

        for (const preset of activePresets) {
            if (preset.isDefault) {
                for (const d of preset.domains) this.ignoreDomains.add(d);
            } else {
                const proxy = preset.proxyId
                    ? proxies.find(p => p.id === preset.proxyId)
                    : defaultProxy;
                const label = proxy ? this.proxyLabel(proxy) : this.defaultProxyLabel;
                for (const d of preset.domains) {
                    this.domainProxyMap.set(d, label);
                    if (proxy) this.domainProxyServerMap.set(d, proxy);
                }
            }
        }
    }

    private proxyLabel(proxy: ProxyServer): string {
        const addr = `${proxy.host}:${proxy.port}`;
        return proxy.name ? `${proxy.name} (${addr})` : addr;
    }

    private async loadDomainsFromPresets(): Promise<void> {
        this.domains = await Storage.getAllActiveDomains();
        console.log('ProxyManager: Loaded domains from presets:', this.domains);
    }

    // Форматирование прокси для PAC-скрипта
    private formatProxyForPac(proxy: Partial<ProxyServer>): string {
        const { type, host, port } = proxy;

        if (!type || !host || typeof port !== 'number') {
            throw new Error(`Invalid proxy: missing required fields`);
        }

        // Validate host and port before formatting
        if (!validateProxyHost(host)) {
            throw new Error(`Invalid proxy host: ${host}`);
        }
        if (!validateProxyPort(port)) {
            throw new Error(`Invalid proxy port: ${port}`);
        }

        switch (type) {
            case 'http':
                return `PROXY ${host}:${port}`;
            case 'https':
                return `HTTPS ${host}:${port}`;
            case 'socks4':
                return `SOCKS ${host}:${port}`;
            case 'socks5':
                return `SOCKS5 ${host}:${port}`;
            default:
                return `PROXY ${host}:${port}`;
        }
    }

    /**
     * Generates PAC script for proxy configuration.
     *
     * @param options - Optional configuration
     * @param options.testRule - Optional test rule to inject as the first line inside FindProxyForURL.
     *                         Useful for testing connectivity via a specific proxy.
     * @returns PAC script as string
     *
     * @invariant The cache `cachedPacScript` stores PAC WITHOUT testRule — testRule is only used
     *            for one-off connectivity tests and is never persisted in the cached script.
     */
    private async generatePacScript(options?: { testRule?: string }): Promise<string> {
        const activePresets = await Storage.getActivePresets();
        const proxies = await Storage.getProxies();
        const defaultProxy = proxies.find(p => p.isDefault);
        const proxyByDefault = await Storage.getProxyByDefault();
        
        const testRuleInjection = options?.testRule ?? '';

        // Создаём маппинг домен -> прокси
        const domainProxyMap: { [domain: string]: string } = {};
        
        // Собираем домены из Ignore List (isDefault пресет) - они всегда идут DIRECT
        const ignoreListDomains: string[] = [];
        
        for (const preset of activePresets) {
            if (preset.isDefault) {
                // Ignore List - домены идут напрямую (DIRECT)
                ignoreListDomains.push(...preset.domains);
            } else {
                // Обычные пресеты - домены идут через прокси
                const proxy = preset.proxyId
                    ? proxies.find(p => p.id === preset.proxyId)
                    : defaultProxy;
                
                if (proxy) {
                    const proxyString = this.formatProxyForPac(proxy);
                    for (const domain of preset.domains) {
                        domainProxyMap[domain] = proxyString;
                    }
                }
            }
        }
        
        // Добавляем дефолтные домены с дефолтным прокси (не в режиме proxyByDefault)
        if (defaultProxy && !proxyByDefault) {
            for (const domain of Config.DEFAULT_DOMAINS) {
                if (!domainProxyMap[domain]) {
                    domainProxyMap[domain] = this.formatProxyForPac(defaultProxy);
                }
            }
        }

        // Определяем fallback поведение
        // Когда proxyByDefault=true: все сайты вне Ignore List идут через прокси
        // Когда proxyByDefault=false: все сайты вне пресетов идут напрямую
        const fallbackProxy = proxyByDefault && defaultProxy
            ? this.formatProxyForPac(defaultProxy)
            : 'DIRECT';

        console.log('ProxyManager: Generating PAC script with domain-proxy map:', domainProxyMap,
            'ignoreList:', ignoreListDomains, 'fallback:', fallbackProxy, 'proxyByDefault:', proxyByDefault);

        // Convert domains to Punycode (ASCII) for PAC script
        const asciiDomainProxyMap: { [domain: string]: string } = {};
        for (const [domain, proxy] of Object.entries(domainProxyMap)) {
            asciiDomainProxyMap[toASCII(domain)] = proxy;
        }
        const asciiIgnoreList = ignoreListDomains.map(d => toASCII(d));

        // PAC script must be ASCII-only (no non-ASCII comments or strings)
        return `
            var domainProxyMap = ${JSON.stringify(asciiDomainProxyMap)};
            var ignoreList = ${JSON.stringify(asciiIgnoreList)};
            var fallbackProxy = ${JSON.stringify(fallbackProxy)};
            var proxyByDefault = ${JSON.stringify(proxyByDefault)};
            
            function matchDomain(host, domain) {
                if (domain.indexOf("*.") === 0) {
                    var base = domain.substring(2);
                    return host.length > base.length &&
                        host.substring(host.length - base.length - 1) === "." + base;
                }
                return host === domain;
            }

            function FindProxyForURL(url, host) {
                ${testRuleInjection}
                // Check ignore list first (always DIRECT)
                for (var i = 0; i < ignoreList.length; i++) {
                    if (matchDomain(host, ignoreList[i])) {
                        return "DIRECT";
                    }
                }

                // Check domain-specific proxy rules using Object.keys() for iteration
                var domains = Object.keys(domainProxyMap);
                for (var j = 0; j < domains.length; j++) {
                    if (matchDomain(host, domains[j])) {
                        return domainProxyMap[domains[j]];
                    }
                }

                // Fallback: proxy all (if proxyByDefault) or direct
                return fallbackProxy;
            }
        `;
    }

    resetCache(): void {
        console.log('ProxyManager: resetCache called, clearing cachedConfigHash and cachedPacScript');
        this.cachedConfigHash = null;
        this.cachedPacScript = null;
        this.lastConnectedProxyId = null;
        // Invalidate any in-flight applyPacScript callbacks.
        ++this.enableGeneration;
        // Clear routing cache to prevent stale auto-recovery.
        this.clearRoutingCache();
    }

    /**
     * Generates a one-off PAC script for connectivity testing.
     *
     * @param testProxy - Proxy configuration to test
     * @param testId - Unique test identifier for URL matching
     * @returns PAC script as string
     *
     * @async
     * @contract When `isConnected === true` and `generatePacScript` throws, the promise rejects.
     *          In `checkProxy`, this rejection is caught and converted to return value `'error'`.
     */
    async generateCheckPacScript(testProxy: Partial<ProxyServer>, testId: string): Promise<string> {
        const proxyString = this.formatProxyForPac(testProxy);
        const safeTestId = testId.replace(/[^a-zA-Z0-9-]/g, '');
        const testRule = `if (host === "example.com" && url.indexOf("_pulse_check=${safeTestId}") !== -1) return ${JSON.stringify(proxyString)};`;

        if (this.isConnected) {
            return this.generatePacScript({ testRule });
        }

        return `
            function FindProxyForURL(url, host) {
                ${testRule}
                return "DIRECT";
            }
        `;
    }

    async restoreAfterCheck(wasConnected: boolean): Promise<void> {
        if (wasConnected) {
            if (this.cachedPacScript) {
                const gen = ++this.enableGeneration;
                await this.applyPacScript(this.cachedPacScript, this.defaultProxyServer ?? undefined, gen);
            }
        } else {
            await this.disable();
        }
    }

    get isConnected(): boolean {
        return this.cachedPacScript !== null;
    }
}

export const ProxyManager = new ProxyManagerService();