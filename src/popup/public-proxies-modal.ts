import { I18n } from '../shared/i18n';
import { RemoteConfig } from '../shared/remote-config';
import { Storage } from '../shared/storage';
import { ProxyType, ProxyServer, NormalizedPublicProxy, PublicProxiesResponse, PublicProxyFilters, PublicProxyLiveStatus } from '../types';
import { createElementFromTemplate, setAttr } from './safe-dom';
import { ModalHelper } from './modal-helper';
import { checkProxyBeforeAdd } from './proxy-form-modal';
import { trackEvent, buildAffiliateUrl } from '../shared/analytics';
import { fetchWithFallback } from '../shared/fetch-with-fallback';
import { parseProxyString } from '../shared/proxy-parser';
import { PublicProxyCheckSession, publicProxyCacheKey, sortByLiveStatus } from './public-proxy-check';

const PUBLIC_PROXIES_PRIMARY_URL = 'https://raw.githubusercontent.com/beatlejute/PulseProxy/refs/heads/main/sources/proxys.json';
const PUBLIC_PROXIES_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/beatlejute/PulseProxy@master/sources/proxys.json';

export function validateIpPortFormat(input: string): boolean {
    const ipPortRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}$/;
    return ipPortRegex.test(input);
}

export function normalizeProxySearchQuery(input: string): string {
    const parsed = parseProxyString(input);
    if (!parsed) return input.trim();
    return parsed.port !== undefined ? `${parsed.host}:${parsed.port}` : parsed.host;
}

let cachedProxies: NormalizedPublicProxy[] | null = null;

export function clearPublicProxiesCache(): void {
    cachedProxies = null;
}

// UI-хуки фоновой проверки для элемента списка (undefined — функционал выключен)
export interface PublicProxyItemCheckOptions {
    getStatus: (proxy: NormalizedPublicProxy) => PublicProxyLiveStatus;
    onCheckRequested: (proxy: NormalizedPublicProxy) => void;
    suspendChecks: () => Promise<void>;
    resumeChecks: () => void;
}

export async function showPublicProxiesModal(
    onProxyAdded: (proxy: NormalizedPublicProxy) => Promise<void>
): Promise<void> {
    const { body, closeModal, build } = ModalHelper.create({
        title: I18n.getMessage('publicProxiesTitle'),
        modalClass: 'public-proxies-modal',
        fullHeight: true,
        column: 'proxy'
    });

    // Warning block (скрыт навсегда после закрытия крестиком)
    if (!(await Storage.getPublicProxiesWarningDismissed())) {
        body.appendChild(createPublicProxiesWarning());
    }

    // Filters
    const filtersDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'public-proxies-filters' });

    const protocolGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'filter-group' });
    const protocolLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Protocol' });
    setAttr(protocolLabel, 'data-i18n', 'filterProtocol');
    protocolGroup.appendChild(protocolLabel);
    const protocolSelect = createElementFromTemplate<HTMLSelectElement>('select', { id: 'filter-protocol' });
    const protocolAllOpt = createElementFromTemplate<HTMLOptionElement>('option', { value: '', textContent: 'All' });
    setAttr(protocolAllOpt, 'data-i18n', 'filterAll');
    protocolSelect.appendChild(protocolAllOpt);
    protocolSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: 'http', textContent: 'HTTP' }));
    protocolSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: 'https', textContent: 'HTTPS' }));
    protocolSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: 'socks4', textContent: 'SOCKS4' }));
    protocolSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: 'socks5', textContent: 'SOCKS5' }));
    protocolGroup.appendChild(protocolSelect);
    filtersDiv.appendChild(protocolGroup);

    const connTypeGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'filter-group' });
    const connTypeLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Type' });
    setAttr(connTypeLabel, 'data-i18n', 'filterConnectionType');
    connTypeGroup.appendChild(connTypeLabel);
    const connTypeSelect = createElementFromTemplate<HTMLSelectElement>('select', { id: 'filter-connection-type' });
    const connTypeAllOpt = createElementFromTemplate<HTMLOptionElement>('option', { value: '', textContent: 'All' });
    setAttr(connTypeAllOpt, 'data-i18n', 'filterAll');
    connTypeSelect.appendChild(connTypeAllOpt);
    connTypeSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: 'residential', textContent: 'Residential' }));
    setAttr(connTypeSelect.lastChild as HTMLOptionElement, 'data-i18n', 'connectionTypeResidential');
    connTypeSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: 'corporate', textContent: 'Corporate' }));
    setAttr(connTypeSelect.lastChild as HTMLOptionElement, 'data-i18n', 'connectionTypeCorporate');
    connTypeSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: 'mobile', textContent: 'Mobile' }));
    setAttr(connTypeSelect.lastChild as HTMLOptionElement, 'data-i18n', 'connectionTypeMobile');
    connTypeGroup.appendChild(connTypeSelect);
    filtersDiv.appendChild(connTypeGroup);

    const countryGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'filter-group' });
    const countryLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Country' });
    setAttr(countryLabel, 'data-i18n', 'filterCountry');
    countryGroup.appendChild(countryLabel);
    const countrySelect = createElementFromTemplate<HTMLSelectElement>('select', { id: 'filter-country' });
    const countryAllOpt = createElementFromTemplate<HTMLOptionElement>('option', { value: '', textContent: 'All' });
    setAttr(countryAllOpt, 'data-i18n', 'filterAll');
    countrySelect.appendChild(countryAllOpt);
    countryGroup.appendChild(countrySelect);
    filtersDiv.appendChild(countryGroup);

    const scoreGroup = createElementFromTemplate<HTMLDivElement>('div', { className: 'filter-group' });
    const scoreLabel = createElementFromTemplate<HTMLLabelElement>('label', { textContent: 'Min. Rating' });
    setAttr(scoreLabel, 'data-i18n', 'filterMinScore');
    scoreGroup.appendChild(scoreLabel);
    const scoreSelect = createElementFromTemplate<HTMLSelectElement>('select', { id: 'filter-min-score' });
    scoreSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: '0', textContent: 'All' }));
    setAttr(scoreSelect.firstChild as HTMLOptionElement, 'data-i18n', 'filterAll');
    scoreSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: '3.5', textContent: '3.5+' }));
    scoreSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: '4.0', textContent: '4.0+' }));
    scoreSelect.appendChild(createElementFromTemplate<HTMLOptionElement>('option', { value: '4.5', textContent: '4.5+' }));
    scoreGroup.appendChild(scoreSelect);
    filtersDiv.appendChild(scoreGroup);

    const searchDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'public-proxy-search' });
    const searchInput = createElementFromTemplate<HTMLInputElement>('input', { className: 'public-proxy-search-input', type: 'text' });
    setAttr(searchInput, 'data-i18n-placeholder', 'publicProxySearchPlaceholder');
    setAttr(searchInput, 'placeholder', 'Search by IP:Port...');
    searchDiv.appendChild(searchInput);

    const validationHint = createElementFromTemplate<HTMLDivElement>('div', { className: 'validation-hint' });
    validationHint.style.display = 'none';
    setAttr(validationHint, 'data-i18n', 'publicProxySearchHint');
    searchDiv.appendChild(validationHint);

    // Кнопка-тогл сворачивания фильтров и поиска (состояние сохраняется в chrome.storage.local)
    const filtersToggle = createElementFromTemplate<HTMLButtonElement>('button', { className: 'filters-toggle' });
    setAttr(filtersToggle, 'type', 'button');

    const applyFiltersCollapsedState = (collapsed: boolean) => {
        filtersDiv.classList.toggle('collapsed', collapsed);
        searchDiv.classList.toggle('collapsed', collapsed);
        const labelKey = collapsed ? 'publicProxiesShowFilters' : 'publicProxiesHideFilters';
        setAttr(filtersToggle, 'aria-expanded', String(!collapsed));
        setAttr(filtersToggle, 'data-i18n', labelKey);
        filtersToggle.textContent = I18n.getMessage(labelKey) || (collapsed ? 'Show filters' : 'Hide filters');
    };

    let filtersCollapsed = await Storage.getPublicProxiesFiltersCollapsed();
    applyFiltersCollapsedState(filtersCollapsed);
    filtersToggle.addEventListener('click', () => {
        filtersCollapsed = !filtersCollapsed;
        applyFiltersCollapsedState(filtersCollapsed);
        void Storage.setPublicProxiesFiltersCollapsed(filtersCollapsed);
    });

    body.appendChild(filtersToggle);
    body.appendChild(filtersDiv);
    body.appendChild(searchDiv);

    const listDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'public-proxies-list' });
    const loadingState = createElementFromTemplate<HTMLDivElement>('div', { className: 'loading-state' });
    const spinner = createElementFromTemplate<HTMLDivElement>('div', { className: 'spinner' });
    loadingState.appendChild(spinner);
    const loadingText = createElementFromTemplate<HTMLSpanElement>('span', { textContent: 'Loading...' });
    setAttr(loadingText, 'data-i18n', 'publicProxiesLoading');
    loadingState.appendChild(loadingText);
    listDiv.appendChild(loadingState);
    body.appendChild(listDiv);

    build();

    const listContainer = body.querySelector('.public-proxies-list') as HTMLElement;
    await loadAndRenderPublicProxies(body, listContainer, closeModal, onProxyAdded);
}

export function createPublicProxiesWarning(): HTMLDivElement {
    const warningDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'public-proxies-warning' });
    const warningIcon = createElementFromTemplate<HTMLSpanElement>('span', { className: 'warning-icon', textContent: '⚠️' });
    warningDiv.appendChild(warningIcon);

    const warningContent = createElementFromTemplate<HTMLDivElement>('div', { className: 'warning-content' });
    const warningText = createElementFromTemplate<HTMLSpanElement>('span', { textContent: I18n.getMessage('publicProxiesWarning') || 'Public proxies may be slow, unstable, and insecure. Use at your own risk.' });
    setAttr(warningText, 'data-i18n', 'publicProxiesWarning');
    warningContent.appendChild(warningText);

    const recommendationSpan = createElementFromTemplate<HTMLSpanElement>('span', { className: 'warning-recommendation' });
    const referralLink = createElementFromTemplate<HTMLAnchorElement>('a', { textContent: I18n.getMessage('publicProxiesRecommendation') || 'We recommend buying reliable and affordable proxies:' });
    setAttr(referralLink, 'href', RemoteConfig.referralLink);
    setAttr(referralLink, 'target', '_blank');
    setAttr(referralLink, 'rel', 'noopener noreferrer');
    setAttr(referralLink, 'class', 'referral-link');
    setAttr(referralLink, 'data-i18n', 'publicProxiesRecommendation');
    referralLink.addEventListener('click', (e) => {
        e.preventDefault();
        const url = RemoteConfig.referralLink;
        if (url && url !== '#') {
            const fullUrl = buildAffiliateUrl(url, 'public_proxies');
            trackEvent('affiliate_link_clicked', {
                provider: new URL(url).hostname.replace('www.', '').split('.')[0],
                placement: 'public_proxies',
                link_url: fullUrl
            });
            chrome.tabs.create({ url: fullUrl });
        }
    });
    recommendationSpan.appendChild(referralLink);
    warningContent.appendChild(recommendationSpan);
    warningDiv.appendChild(warningContent);

    const closeBtn = createElementFromTemplate<HTMLButtonElement>('button', { className: 'warning-close', textContent: '×' });
    setAttr(closeBtn, 'type', 'button');
    closeBtn.addEventListener('click', () => {
        warningDiv.remove();
        void Storage.setPublicProxiesWarningDismissed(true);
    });
    warningDiv.appendChild(closeBtn);

    return warningDiv;
}

async function loadAndRenderPublicProxies(
    body: HTMLElement,
    listContainer: HTMLElement,
    closeModal: () => void,
    onProxyAdded: (proxy: NormalizedPublicProxy) => Promise<void>
): Promise<void> {
    try {
        if (!cachedProxies) {
            const cacheBuster = `?_t=${Date.now()}`;
            const urls = [
                `${PUBLIC_PROXIES_PRIMARY_URL}${cacheBuster}`,
                `${PUBLIC_PROXIES_FALLBACK_URL}${cacheBuster}`,
            ];
            const rawData = await fetchWithFallback<PublicProxiesResponse>(urls);
            cachedProxies = normalizeProxies(rawData);
        }

        // Уже добавленные пользователем прокси в списке не показываем
        const savedProxies = await Storage.getProxies();
        const proxies = excludeAddedProxies(cachedProxies || [], savedProxies);

        const countries = [...new Set(proxies.map(p => p.country))].sort();
        const countrySelect = body.querySelector('#filter-country') as HTMLSelectElement;
        countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = `${countryCodeToFlag(country)} ${country}`;
            countrySelect.appendChild(option);
        });

        // Фоновая проверка живости: статусы из кеша (TTL сутки) + live-сессия.
        // Управляется той же настройкой, что и проверка перед добавлением.
        const autoCheckEnabled = await Storage.getProxyCheckEnabled();
        const liveStatuses = new Map<string, PublicProxyLiveStatus>();
        if (autoCheckEnabled) {
            const cachedResults = await Storage.getPublicProxyCheckResults();
            for (const [key, entry] of Object.entries(cachedResults)) {
                liveStatuses.set(key, entry.status);
            }
        }
        let checkSession: PublicProxyCheckSession | null = null;
        const getStatus = (proxy: NormalizedPublicProxy): PublicProxyLiveStatus =>
            liveStatuses.get(publicProxyCacheKey(proxy)) ?? 'unchecked';
        const checkOptions: PublicProxyItemCheckOptions | undefined = autoCheckEnabled ? {
            getStatus,
            onCheckRequested: proxy => checkSession?.requestPriorityCheck(proxy),
            suspendChecks: async () => { await checkSession?.suspendForUserCheck(); },
            resumeChecks: () => checkSession?.resume(),
        } : undefined;

        const getSearchQuery = (): string => {
            const searchInput = body.querySelector('.public-proxy-search-input') as HTMLInputElement | null;
            return normalizeProxySearchQuery(searchInput?.value || '').toLowerCase();
        };

        const renderList = () => {
            const filters = getFiltersFromBody(body);
            const searchInput = body.querySelector('.public-proxy-search-input') as HTMLInputElement | null;
            const rawSearch = searchInput?.value || '';
            const normalizedSearch = normalizeProxySearchQuery(rawSearch);
            if (searchInput && normalizedSearch !== rawSearch.trim()) {
                searchInput.value = normalizedSearch;
            }
            const searchQuery = normalizedSearch.toLowerCase();
            const filteredProxies = filterPublicProxies(proxies, filters, searchQuery);
            // Рабочие — вверх, нерабочие — вниз; внутри групп прежний порядок по score
            const orderedProxies = autoCheckEnabled
                ? sortByLiveStatus(filteredProxies, getStatus)
                : filteredProxies;
            renderPublicProxiesList(listContainer, orderedProxies, closeModal, onProxyAdded, checkOptions);

            const validationHint = body.querySelector('.validation-hint') as HTMLElement;
            if (validationHint) {
                const showHint = searchQuery.length >= 4 && !validateIpPortFormat(searchQuery);
                validationHint.style.display = showHint ? 'block' : 'none';
                I18n.applyTranslations();
            }
        };

        body.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', renderList);
        });

        const searchInputEl = body.querySelector('.public-proxy-search-input') as HTMLInputElement;
        searchInputEl?.addEventListener('input', renderList);

        renderList();

        if (autoCheckEnabled) {
            checkSession = new PublicProxyCheckSession({
                proxies,
                statuses: liveStatuses,
                // Матчер читает актуальные фильтры перед каждым батчем —
                // смена фильтра автоматически перестраивает остаток очереди
                getFilterMatcher: () => {
                    const filters = getFiltersFromBody(body);
                    const searchQuery = getSearchQuery();
                    return proxy => filterPublicProxies([proxy], filters, searchQuery).length > 0;
                },
                isAlive: () => listContainer.isConnected,
                onUpdate: renderList,
            });
            void checkSession.start();
        }

    } catch (error) {
        console.error('Failed to load public proxies:', error);

        listContainer.innerHTML = '';
        const errorDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'error-state' });
        const errorText = createElementFromTemplate<HTMLSpanElement>('span', { textContent: 'Failed to load proxies' });
        setAttr(errorText, 'data-i18n', 'publicProxiesError');
        errorDiv.appendChild(errorText);

        const retryBtn = createElementFromTemplate<HTMLButtonElement>('button', { className: 'retry-btn', textContent: 'Retry' });
        setAttr(retryBtn, 'data-i18n', 'publicProxiesRetry');
        errorDiv.appendChild(retryBtn);

        listContainer.appendChild(errorDiv);
        I18n.applyTranslations();

        listContainer.querySelector('.retry-btn')?.addEventListener('click', () => {
            listContainer.innerHTML = '';
            const loadingStateEl = createElementFromTemplate<HTMLDivElement>('div', { className: 'loading-state' });
            const spinnerEl = createElementFromTemplate<HTMLDivElement>('div', { className: 'spinner' });
            loadingStateEl.appendChild(spinnerEl);
            const loadingTextEl = createElementFromTemplate<HTMLSpanElement>('span', { textContent: 'Loading...' });
            setAttr(loadingTextEl, 'data-i18n', 'publicProxiesLoading');
            loadingStateEl.appendChild(loadingTextEl);
            listContainer.appendChild(loadingStateEl);

            I18n.applyTranslations();
            cachedProxies = null;
            loadAndRenderPublicProxies(body, listContainer, closeModal, onProxyAdded);
        });
    }
}

export function normalizeProxies(response: PublicProxiesResponse): NormalizedPublicProxy[] {
    const result: NormalizedPublicProxy[] = [];
    const protocols: (keyof PublicProxiesResponse)[] = ['http', 'https', 'socks4', 'socks5'];

    for (const protocol of protocols) {
        const proxies = response[protocol] || [];
        for (const proxy of proxies) {
            const [ip, portStr] = proxy.ip.split(':');
            const port = parseInt(portStr, 10);
            if (ip && !isNaN(port)) {
                result.push({
                    protocol: protocol as ProxyType,
                    ip,
                    port,
                    score: proxy.score,
                    connectionType: proxy.type.toLowerCase(),
                    country: proxy.country,
                });
            }
        }
    }

    return result.sort((a, b) => b.score - a.score);
}

export function excludeAddedProxies(
    proxies: NormalizedPublicProxy[],
    savedProxies: ProxyServer[]
): NormalizedPublicProxy[] {
    const savedKeys = new Set(savedProxies.map(p => `${p.type}://${p.host}:${p.port}`));
    return proxies.filter(proxy => !savedKeys.has(publicProxyCacheKey(proxy)));
}

export function countryCodeToFlag(countryCode: string): string {
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

export function getFiltersFromBody(body: HTMLElement): PublicProxyFilters {
    return {
        protocol: (body.querySelector('#filter-protocol') as HTMLSelectElement)?.value as ProxyType | '' || undefined,
        connectionType: (body.querySelector('#filter-connection-type') as HTMLSelectElement)?.value || undefined,
        country: (body.querySelector('#filter-country') as HTMLSelectElement)?.value || undefined,
        minScore: parseFloat((body.querySelector('#filter-min-score') as HTMLSelectElement)?.value || '0') || undefined,
    };
}

export function filterPublicProxies(
    proxies: NormalizedPublicProxy[],
    filters: PublicProxyFilters,
    searchQuery: string
): NormalizedPublicProxy[] {
    return proxies.filter(proxy => {
        if (filters.protocol && proxy.protocol !== filters.protocol) return false;
        if (filters.connectionType && proxy.connectionType !== filters.connectionType) return false;
        if (filters.country && proxy.country !== filters.country) return false;
        if (filters.minScore && proxy.score < filters.minScore) return false;
        if (searchQuery && !`${proxy.ip}:${proxy.port}`.toLowerCase().includes(searchQuery)) return false;
        return true;
    });
}

export function renderPublicProxiesList(
    container: HTMLElement,
    proxies: NormalizedPublicProxy[],
    closeModal: () => void,
    onProxyAdded?: (proxy: NormalizedPublicProxy) => Promise<void>,
    checkOptions?: PublicProxyItemCheckOptions
): void {
    if (proxies.length === 0) {
        container.innerHTML = '';
        const emptyDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'empty-state', textContent: 'No proxies found' });
        setAttr(emptyDiv, 'data-i18n', 'publicProxiesEmpty');
        container.appendChild(emptyDiv);
        I18n.applyTranslations();
        return;
    }

    container.innerHTML = '';
    const content = createElementFromTemplate<HTMLDivElement>('div', { className: 'public-proxies-content' });
    container.appendChild(content);

    proxies.forEach(proxy => {
        const item = createPublicProxyItem(proxy, closeModal, onProxyAdded, checkOptions);
        content.appendChild(item);
    });
}

// Индикатор живости: точка-статус или кнопка «Проверить» для непроверенных
export function createLiveStatusElement(
    proxy: NormalizedPublicProxy,
    checkOptions: PublicProxyItemCheckOptions
): HTMLElement {
    const status = checkOptions.getStatus(proxy);

    if (status === 'unchecked') {
        const checkBtn = createElementFromTemplate<HTMLButtonElement>('button', {
            className: 'proxy-check-now-btn',
            textContent: I18n.getMessage('publicProxyCheckNow') || 'Check',
        });
        setAttr(checkBtn, 'type', 'button');
        checkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            checkOptions.onCheckRequested(proxy);
        });
        return checkBtn;
    }

    const titles: Record<Exclude<PublicProxyLiveStatus, 'unchecked'>, string> = {
        alive: I18n.getMessage('publicProxyStatusAlive') || 'Working',
        dead: I18n.getMessage('publicProxyStatusDead') || 'Not working',
        checking: I18n.getMessage('checkProxyChecking') || 'Checking...',
    };
    const dot = createElementFromTemplate<HTMLSpanElement>('span', { className: `proxy-live-status ${status}` });
    setAttr(dot, 'title', titles[status]);
    return dot;
}

export function createPublicProxyItem(
    proxy: NormalizedPublicProxy,
    closeModal: () => void,
    onProxyAdded?: (proxy: NormalizedPublicProxy) => Promise<void>,
    checkOptions?: PublicProxyItemCheckOptions
): HTMLElement {
    const item = document.createElement('div');
    item.className = 'public-proxy-item';

    const scoreClass = proxy.score >= 4.5 ? 'high' : proxy.score >= 4.0 ? 'medium' : 'low';
    const connectionTypeLabel = getConnectionTypeLabel(proxy.connectionType);
    const flag = countryCodeToFlag(proxy.country);

    const mainDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-item-main' });
    mainDiv.appendChild(createElementFromTemplate<HTMLSpanElement>('span', { className: 'proxy-item-address', textContent: `${proxy.ip}:${proxy.port}` }));

    const infoDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-item-info' });
    infoDiv.appendChild(createElementFromTemplate<HTMLSpanElement>('span', { className: `score-value ${scoreClass}`, textContent: proxy.score.toFixed(1) }));
    infoDiv.appendChild(createElementFromTemplate<HTMLSpanElement>('span', { className: 'proxy-item-country', textContent: `${flag} ${proxy.country}` }));
    infoDiv.appendChild(createElementFromTemplate<HTMLSpanElement>('span', { className: 'proxy-item-protocol', textContent: proxy.protocol.toUpperCase() }));
    infoDiv.appendChild(createElementFromTemplate<HTMLSpanElement>('span', { className: 'proxy-item-type', textContent: connectionTypeLabel }));

    mainDiv.appendChild(infoDiv);
    item.appendChild(mainDiv);

    if (checkOptions) {
        item.appendChild(createLiveStatusElement(proxy, checkOptions));
    }

    if (onProxyAdded) {
        // Guard от гонки двойного клика: блокирующий оверлей появляется только после
        // await getProxyCheckEnabled(), поэтому без флага два быстрых клика прогоняли
        // проверку дважды (второй упирался в mutex background и давал ложный "error").
        let isProcessing = false;

        item.addEventListener('click', async () => {
            if (isProcessing) return;
            isProcessing = true;

            let checkingOverlay: HTMLDivElement | null = null;
            let suspended = false;

            try {
                const proxyCheckEnabled = await Storage.getProxyCheckEnabled();
                let allowed = true;

                if (proxyCheckEnabled) {
                    checkingOverlay = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-checking-overlay' });
                    const spinnerEl = createElementFromTemplate<HTMLDivElement>('div', { className: 'spinner' });
                    checkingOverlay.appendChild(spinnerEl);
                    const statusSpan = createElementFromTemplate<HTMLSpanElement>('span', { textContent: I18n.getMessage('checkProxyChecking') || 'Checking...' });
                    checkingOverlay.appendChild(statusSpan);
                    document.querySelector('.public-proxies-modal')?.appendChild(checkingOverlay);

                    // Одиночная проверка и фоновый батч делят глобальные proxy.settings —
                    // приостанавливаем сессию и снимаем активный батч
                    await checkOptions?.suspendChecks();
                    suspended = true;
                    allowed = await checkProxyBeforeAdd(proxy.protocol, proxy.ip, proxy.port);
                }

                if (allowed) {
                    await onProxyAdded(proxy);
                    closeModal();
                    // Модалка закрыта — фоновую сессию не возобновляем
                    suspended = false;
                }
            } catch (error) {
                // Reject проверки/добавления (например, выгруженный SW) больше не
                // оставляет вечный блокирующий оверлей и подвешенную сессию.
                console.error('PublicProxies: proxy add failed:', error);
            } finally {
                checkingOverlay?.remove();
                // Возобновляем сессию во всех исходах, кроме успешного добавления
                if (suspended) checkOptions?.resumeChecks();
                isProcessing = false;
            }
        });
    }

    return item;
}

export function getConnectionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        'residential': I18n.getMessage('connectionTypeResidential') || 'Residential',
        'corporate': I18n.getMessage('connectionTypeCorporate') || 'Corporate',
        'mobile': I18n.getMessage('connectionTypeMobile') || 'Mobile',
    };
    return labels[type] || type;
}
