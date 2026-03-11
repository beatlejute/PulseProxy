import { I18n } from '../shared/i18n';
import { RemoteConfig } from '../shared/remote-config';
import { ProxyType, NormalizedPublicProxy, PublicProxiesResponse, PublicProxyFilters } from '../types';
import { createElementFromTemplate, setAttr } from './safe-dom';
import { ModalHelper } from './modal-helper';
import { checkProxyBeforeAdd } from './proxy-form-modal';

const PUBLIC_PROXIES_URL = 'https://cdn.jsdelivr.net/gh/beatlejute/PulseProxy@master/sources/proxys.json';

let cachedProxies: NormalizedPublicProxy[] | null = null;

export function clearPublicProxiesCache(): void {
    cachedProxies = null;
}

export async function showPublicProxiesModal(
    onProxyAdded: (proxy: NormalizedPublicProxy) => Promise<void>
): Promise<void> {
    const { body, closeModal, build } = ModalHelper.create({
        title: I18n.getMessage('publicProxiesTitle'),
        modalClass: 'public-proxies-modal'
    });

    // Warning block
    const warningDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'public-proxies-warning' });
    const warningIcon = createElementFromTemplate<HTMLSpanElement>('span', { className: 'warning-icon', textContent: '⚠️' });
    warningDiv.appendChild(warningIcon);

    const warningContent = createElementFromTemplate<HTMLDivElement>('div', { className: 'warning-content' });
    const warningText = createElementFromTemplate<HTMLSpanElement>('span', { textContent: 'Public proxies may be slow, unstable, and insecure. Use at your own risk.' });
    setAttr(warningText, 'data-i18n', 'publicProxiesWarning');
    warningContent.appendChild(warningText);

    const recommendationSpan = createElementFromTemplate<HTMLSpanElement>('span', { className: 'warning-recommendation' });
    const referralLink = createElementFromTemplate<HTMLAnchorElement>('a', { textContent: 'We recommend buying reliable and affordable proxies:' });
    setAttr(referralLink, 'href', RemoteConfig.referralLink);
    setAttr(referralLink, 'target', '_blank');
    setAttr(referralLink, 'rel', 'noopener noreferrer');
    setAttr(referralLink, 'class', 'referral-link');
    setAttr(referralLink, 'data-i18n', 'publicProxiesRecommendation');
    recommendationSpan.appendChild(referralLink);
    warningContent.appendChild(recommendationSpan);
    warningDiv.appendChild(warningContent);
    body.appendChild(warningDiv);

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

    body.appendChild(filtersDiv);

    const searchDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'public-proxy-search' });
    const searchInput = createElementFromTemplate<HTMLInputElement>('input', { className: 'public-proxy-search-input', type: 'text' });
    setAttr(searchInput, 'data-i18n-placeholder', 'publicProxySearchPlaceholder');
    setAttr(searchInput, 'placeholder', 'Search by IP...');
    searchDiv.appendChild(searchInput);
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

async function loadAndRenderPublicProxies(
    body: HTMLElement,
    listContainer: HTMLElement,
    closeModal: () => void,
    onProxyAdded: (proxy: NormalizedPublicProxy) => Promise<void>
): Promise<void> {
    try {
        if (!cachedProxies) {
            const response = await fetch(`${PUBLIC_PROXIES_URL}?_t=${Date.now()}`);
            if (!response.ok) {
                throw new Error('Failed to load proxies');
            }
            const rawData: PublicProxiesResponse = await response.json();
            cachedProxies = normalizeProxies(rawData);
        }

        const proxies = cachedProxies || [];

        const countries = [...new Set(proxies.map(p => p.country))].sort();
        const countrySelect = body.querySelector('#filter-country') as HTMLSelectElement;
        countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country;
            option.textContent = `${countryCodeToFlag(country)} ${country}`;
            countrySelect.appendChild(option);
        });

        const renderList = () => {
            const filters = getFiltersFromBody(body);
            const searchQuery = (body.querySelector('.public-proxy-search-input') as HTMLInputElement)?.value.toLowerCase() || '';
            const filteredProxies = filterPublicProxies(proxies, filters, searchQuery);
            renderPublicProxiesList(listContainer, filteredProxies, closeModal, onProxyAdded);
        };

        body.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', renderList);
        });

        const searchInputEl = body.querySelector('.public-proxy-search-input') as HTMLInputElement;
        searchInputEl?.addEventListener('input', renderList);

        renderList();

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
        if (searchQuery && !proxy.ip.toLowerCase().includes(searchQuery)) return false;
        return true;
    });
}

export function renderPublicProxiesList(
    container: HTMLElement,
    proxies: NormalizedPublicProxy[],
    closeModal: () => void,
    onProxyAdded?: (proxy: NormalizedPublicProxy) => Promise<void>
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
        const item = createPublicProxyItem(proxy, closeModal, onProxyAdded);
        content.appendChild(item);
    });
}

export function createPublicProxyItem(
    proxy: NormalizedPublicProxy,
    closeModal: () => void,
    onProxyAdded?: (proxy: NormalizedPublicProxy) => Promise<void>
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

    if (onProxyAdded) {
        item.addEventListener('click', async () => {
            const checkingOverlay = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-checking-overlay' });
            const spinnerEl = createElementFromTemplate<HTMLDivElement>('div', { className: 'spinner' });
            checkingOverlay.appendChild(spinnerEl);
            const statusSpan = createElementFromTemplate<HTMLSpanElement>('span', { textContent: I18n.getMessage('checkProxyChecking') || 'Checking...' });
            checkingOverlay.appendChild(statusSpan);
            document.querySelector('.public-proxies-modal')?.appendChild(checkingOverlay);

            const allowed = await checkProxyBeforeAdd(proxy.protocol, proxy.ip, proxy.port);
            checkingOverlay.remove();

            if (allowed) {
                await onProxyAdded(proxy);
                closeModal();
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
