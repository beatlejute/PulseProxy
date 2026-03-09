import { Storage } from '../shared/storage';
import { ProxyState, Config } from '../shared/constants';
import { ProxyServer, ProxyType } from '../types';

// Punycode encoder for IDN domains (RFC 3492)
function toASCII(domain: string): string {
    // Check if domain contains non-ASCII characters
    if (!/[^\x00-\x7F]/.test(domain)) {
        return domain;
    }
    
    // Handle wildcard prefix
    let prefix = '';
    let domainToConvert = domain;
    if (domain.startsWith('*.')) {
        prefix = '*.';
        domainToConvert = domain.slice(2);
    }
    
    // Split domain into labels and convert each
    const labels = domainToConvert.split('.');
    const asciiLabels = labels.map(label => {
        if (!/[^\x00-\x7F]/.test(label)) {
            return label;
        }
        return 'xn--' + punycodeEncode(label);
    });
    
    return prefix + asciiLabels.join('.');
}

// Punycode encoding algorithm
function punycodeEncode(input: string): string {
    const base = 36;
    const tMin = 1;
    const tMax = 26;
    const skew = 38;
    const damp = 700;
    const initialBias = 72;
    const initialN = 128;
    const delimiter = '-';
    
    let n = initialN;
    let delta = 0;
    let bias = initialBias;
    let output = '';
    
    // Copy basic code points to output
    const basicChars: string[] = [];
    for (const char of input) {
        if (char.charCodeAt(0) < 128) {
            basicChars.push(char);
        }
    }
    output = basicChars.join('');
    
    let h = output.length;
    const b = output.length;
    
    if (b > 0) {
        output += delimiter;
    }
    
    // Get code points
    const codePoints: number[] = [];
    for (const char of input) {
        codePoints.push(char.codePointAt(0) || char.charCodeAt(0));
    }
    
    while (h < codePoints.length) {
        let m = Infinity;
        for (const cp of codePoints) {
            if (cp >= n && cp < m) {
                m = cp;
            }
        }
        
        delta += (m - n) * (h + 1);
        n = m;
        
        for (const cp of codePoints) {
            if (cp < n) {
                delta++;
            } else if (cp === n) {
                let q = delta;
                for (let k = base; ; k += base) {
                    const t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
                    if (q < t) break;
                    output += encodeDigit(t + ((q - t) % (base - t)));
                    q = Math.floor((q - t) / (base - t));
                }
                output += encodeDigit(q);
                bias = adapt(delta, h + 1, h === b);
                delta = 0;
                h++;
            }
        }
        delta++;
        n++;
    }
    
    return output;
}

function encodeDigit(d: number): string {
    return String.fromCharCode(d + (d < 26 ? 97 : 22));
}

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
    const base = 36;
    const tMin = 1;
    const tMax = 26;
    const skew = 38;
    const damp = 700;
    
    delta = firstTime ? Math.floor(delta / damp) : Math.floor(delta / 2);
    delta += Math.floor(delta / numPoints);
    
    let k = 0;
    while (delta > ((base - tMin) * tMax) / 2) {
        delta = Math.floor(delta / (base - tMin));
        k += base;
    }
    
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
}

class ProxyManagerService {
    private domains: string[] = [];
    private credentials: Map<string, { username: string; password: string }> = new Map();
    private authHandlerRegistered = false;

    // PAC routing state (mirrors the active PAC script logic)
    // domain -> proxy label (host:port)
    private domainProxyMap: Map<string, string> = new Map();
    private ignoreDomains: Set<string> = new Set();
    private proxyByDefault: boolean = false;
    private defaultProxyLabel: string = '';

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
            if (this.matchDomain(host, domain)) return null;
        }

        // Check domain-specific proxy rules
        for (const [domain, label] of this.domainProxyMap) {
            if (this.matchDomain(host, domain)) return label;
        }

        return this.proxyByDefault ? this.defaultProxyLabel : null;
    }

    private matchDomain(host: string, domain: string): boolean {
        if (domain.startsWith('*.')) {
            const base = domain.slice(2);
            return host.length > base.length && host.endsWith('.' + base);
        }
        return host === domain;
    }

    async init(): Promise<void> {
        console.log('ProxyManager: Initializing...');
        await this.loadDomainsFromPresets();
        await this.loadCredentials();

        // Регистрация обработчика авторизации (только один раз)
        this.registerAuthHandler();

        const targetState = await Storage.getTargetState();
        console.log('ProxyManager: Initial targetState =', targetState);

        if (targetState === ProxyState.CONNECTED) {
            await Storage.setCurrentState(ProxyState.CONNECTING);
            setTimeout(() => this.toggle(), Config.INITIALIZATION_DELAY);
        } else {
            await this.disable();
        }
    }

    private registerAuthHandler(): void {
        if (this.authHandlerRegistered) {
            return;
        }
        // Регистрируем обработчик для авторизации прокси
        if (chrome.webRequest && chrome.webRequest.onAuthRequired) {
            chrome.webRequest.onAuthRequired.addListener(
                (details: chrome.webRequest.WebAuthenticationChallengeDetails, callback?: (response: chrome.webRequest.BlockingResponse) => void) => {
                    const result = this.handleAuthRequired(details);
                    if (callback) {
                        callback(result);
                    }
                },
                { urls: ['<all_urls>'] },
                ['asyncBlocking']
            );
            this.authHandlerRegistered = true;
        }
    }

    private handleAuthRequired(
        details: chrome.webRequest.WebAuthenticationChallengeDetails
    ): chrome.webRequest.BlockingResponse {
        // Ищем credentials для данного прокси
        const challenger = details.challenger;
        if (challenger) {
            const key = `${challenger.host}:${challenger.port}`;
            console.log('ProxyManager: Auth required for', key, 'isProxy:', details.isProxy, 'available keys:', Array.from(this.credentials.keys()));
            const creds = this.credentials.get(key);
            if (creds) {
                console.log('ProxyManager: Providing auth for', key);
                return { authCredentials: { username: creds.username, password: creds.password } };
            }
        }

        // Отменяем запрос если нет credentials — не показывать системный диалог
        return { cancel: true };
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
        console.log('ProxyManager: Toggling, targetState =', targetState);

        if (targetState === ProxyState.CONNECTED) {
            await this.enable();
        } else {
            await this.disable();
        }
    }

    async enable(): Promise<void> {
        await this.loadDomainsFromPresets();
        await this.loadCredentials();
        
        const defaultProxy = await Storage.getDefaultProxy();

        if (!defaultProxy) {
            console.error('ProxyManager: No proxy configured');
            await Storage.setCurrentState(ProxyState.ERROR);
            return;
        }

        const pacScript = await this.generatePacScript();
        await this.updateRoutingCache();

        return new Promise((resolve) => {
            chrome.proxy.settings.set(
                {
                    value: { mode: 'pac_script', pacScript: { data: pacScript } },
                    scope: 'regular',
                },
                () => {
                    if (chrome.runtime.lastError) {
                        console.error('ProxyManager: Error setting proxy:', chrome.runtime.lastError.message);
                        Storage.setCurrentState(ProxyState.ERROR);
                    } else {
                        console.log('ProxyManager: Proxy enabled');
                        Storage.setCurrentState(ProxyState.CONNECTED);
                    }
                    resolve();
                }
            );
        });
    }

    async disable(): Promise<void> {
        console.log('ProxyManager: Disabling proxy...');

        return new Promise((resolve) => {
            chrome.proxy.settings.clear({ scope: 'regular' }, () => {
                if (chrome.runtime.lastError) {
                    console.error('ProxyManager: Error clearing proxy:', chrome.runtime.lastError.message);
                    Storage.setCurrentState(ProxyState.ERROR);
                } else {
                    console.log('ProxyManager: Proxy disabled');
                    Storage.setCurrentState(ProxyState.DISCONNECTED);
                }
                resolve();
            });
        });
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
        this.ignoreDomains = new Set();
        this.domainProxyMap = new Map();

        for (const preset of activePresets) {
            if (preset.isDefault) {
                for (const d of preset.domains) this.ignoreDomains.add(d);
            } else {
                const proxy = preset.proxyId
                    ? proxies.find(p => p.id === preset.proxyId)
                    : defaultProxy;
                const label = proxy ? this.proxyLabel(proxy) : this.defaultProxyLabel;
                for (const d of preset.domains) this.domainProxyMap.set(d, label);
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
    private formatProxyForPac(proxy: ProxyServer): string {
        const { type, host, port } = proxy;
        
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

    private async generatePacScript(): Promise<string> {
        const activePresets = await Storage.getActivePresets();
        const proxies = await Storage.getProxies();
        const defaultProxy = proxies.find(p => p.isDefault);
        const proxyByDefault = await Storage.getProxyByDefault();
        
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
                    var baseDomain = domain.substring(2);
                    return host.length > baseDomain.length &&
                        host.substring(host.length - baseDomain.length - 1) === "." + baseDomain;
                }
                return host === domain;
            }
            
            function FindProxyForURL(url, host) {
                // Check ignore list first (always DIRECT)
                for (var i = 0; i < ignoreList.length; i++) {
                    if (matchDomain(host, ignoreList[i])) {
                        return "DIRECT";
                    }
                }
                
                // Check domain-specific proxy rules
                for (var domain in domainProxyMap) {
                    if (matchDomain(host, domain)) {
                        return domainProxyMap[domain];
                    }
                }
                
                // Fallback: proxy all (if proxyByDefault) or direct
                return fallbackProxy;
            }
        `;
    }
}

export const ProxyManager = new ProxyManagerService();