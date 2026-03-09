import { Storage } from '../shared/storage';
import { I18n } from '../shared/i18n';
import { ProxyServer, ProxyType, PublicProxy, PublicProxiesResponse, NormalizedPublicProxy, PublicProxyFilters } from '../types';
import { adjustContainerHeight } from './dom-utils';
import { showAlert, showConfirm } from './dialog';

const PUBLIC_PROXIES_URL = 'https://cdn.jsdelivr.net/gh/beatlejute/PulseProxy@master/sources/proxys.json';

class ProxyListService {
    private container: HTMLElement | null = null;
    private proxies: ProxyServer[] = [];
    private publicProxiesCache: NormalizedPublicProxy[] | null = null;

    async init(): Promise<void> {
        this.container = document.getElementById('proxy-list-container');
        if (!this.container) {
            console.error('ProxyList: Container not found');
            return;
        }

        await this.loadProxies();
        this.render();
    }

    private async loadProxies(): Promise<void> {
        this.proxies = await Storage.getProxies();
        console.log('ProxyList: Loaded proxies:', this.proxies);
    }

    private render(): void {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="proxy-list">
                <div class="proxy-list-header">
                    <h3 data-i18n="proxyServersTitle">Proxy Servers</h3>
                    <button class="add-proxy-btn" title="Add proxy">
                        <span class="icon">+</span>
                    </button>
                </div>
                <div class="proxy-items"></div>
            </div>
        `;

        const itemsContainer = this.container.querySelector('.proxy-items');
        if (itemsContainer) {
            this.proxies.forEach((proxy) => {
                const item = this.createProxyItem(proxy);
                itemsContainer.appendChild(item);
            });
        }

        // Обработчик добавления нового прокси
        const addBtn = this.container.querySelector('.add-proxy-btn');
        addBtn?.addEventListener('click', () => this.showAddProxyForm());

        // Применяем локализацию
        I18n.applyTranslations();
    }

    private createProxyItem(proxy: ProxyServer): HTMLElement {
        const item = document.createElement('div');
        item.className = `proxy-item${proxy.isDefault ? ' default' : ''}`;
        item.dataset.proxyId = proxy.id;

        const displayName = proxy.name || `${proxy.host}:${proxy.port}`;
        const proxyTypeLabel = this.getProxyTypeLabel(proxy.type);
        const hasAuth = proxy.username ? ' 🔐' : '';

        item.innerHTML = `
            <div class="proxy-item-main">
                <div class="proxy-item-info">
                    <span class="proxy-name">${this.escapeHtml(displayName)}${hasAuth}</span>
                    <span class="proxy-details">${proxyTypeLabel} • ${proxy.host}:${proxy.port}</span>
                </div>
                <div class="proxy-item-actions">
                    ${proxy.isDefault ? '<span class="default-badge" data-i18n="defaultProxy">Default</span>' : 
                        `<button class="set-default-btn" data-i18n="setDefault">Set Default</button>`}
                    <button class="edit-proxy-btn" title="Edit">✏️</button>
                    ${!proxy.isDefault ? '<button class="delete-proxy-btn" title="Delete">🗑️</button>' : ''}
                </div>
            </div>
        `;

        // Обработчики событий
        const setDefaultBtn = item.querySelector('.set-default-btn');
        setDefaultBtn?.addEventListener('click', () => this.setAsDefault(proxy.id));

        const editBtn = item.querySelector('.edit-proxy-btn');
        editBtn?.addEventListener('click', () => this.showEditProxyForm(proxy));

        const deleteBtn = item.querySelector('.delete-proxy-btn');
        deleteBtn?.addEventListener('click', () => this.deleteProxy(proxy.id));

        return item;
    }

    private getProxyTypeLabel(type: ProxyType): string {
        const labels: Record<ProxyType, string> = {
            'http': 'HTTP',
            'https': 'HTTPS',
            'socks4': 'SOCKS4',
            'socks5': 'SOCKS5',
        };
        return labels[type] || type.toUpperCase();
    }

    private showAddProxyForm(): void {
        this.showProxyTypeDialog();
    }

    // Публичный метод для открытия формы добавления прокси извне
    openAddProxyForm(): void {
        this.showProxyTypeDialog();
    }

    private showProxyTypeDialog(): void {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal proxy-type-modal">
                <div class="modal-header">
                    <h3 data-i18n="proxyTypeDialogTitle">Add Proxy</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="proxy-type-options">
                        <button class="proxy-type-option" data-type="custom">
                            <span class="option-icon">✏️</span>
                            <span class="option-text" data-i18n="proxyTypeAddOwn">Add Custom</span>
                        </button>
                        <button class="proxy-type-option" data-type="public">
                            <span class="option-icon">🌐</span>
                            <span class="option-text" data-i18n="proxyTypeSelectPublic">Select from Public</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        adjustContainerHeight();

        const closeModal = () => {
            modal.remove();
            adjustContainerHeight();
        };

        modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Обработчики выбора типа
        modal.querySelector('[data-type="custom"]')?.addEventListener('click', () => {
            closeModal();
            this.showProxyForm(null);
        });

        modal.querySelector('[data-type="public"]')?.addEventListener('click', () => {
            closeModal();
            this.showPublicProxiesModal();
        });

        I18n.applyTranslations();
    }

    private async showPublicProxiesModal(): Promise<void> {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal public-proxies-modal">
                <div class="modal-header">
                    <h3 data-i18n="publicProxiesTitle">Public Proxies</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="public-proxies-warning">
                        <span class="warning-icon">⚠️</span>
                        <div class="warning-content">
                            <span data-i18n="publicProxiesWarning">Public proxies may be slow, unstable, and insecure. Use at your own risk.</span>
                            <span class="warning-recommendation"><a href="https://app.proxy-cheap.com/r/MCk2IU" target="_blank" rel="noopener noreferrer"><span data-i18n="publicProxiesRecommendation">We recommend buying reliable and affordable proxies:</span></a></span>
                        </div>
                    </div>
                    <div class="public-proxies-filters">
                        <div class="filter-group">
                            <label data-i18n="filterProtocol">Protocol</label>
                            <select id="filter-protocol">
                                <option value="" data-i18n="filterAll">All</option>
                                <option value="http">HTTP</option>
                                <option value="https">HTTPS</option>
                                <option value="socks4">SOCKS4</option>
                                <option value="socks5">SOCKS5</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label data-i18n="filterConnectionType">Type</label>
                            <select id="filter-connection-type">
                                <option value="" data-i18n="filterAll">All</option>
                                <option value="residential" data-i18n="connectionTypeResidential">Residential</option>
                                <option value="corporate" data-i18n="connectionTypeCorporate">Corporate</option>
                                <option value="mobile" data-i18n="connectionTypeMobile">Mobile</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label data-i18n="filterCountry">Country</label>
                            <select id="filter-country">
                                <option value="" data-i18n="filterAll">All</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label data-i18n="filterMinScore">Min. Rating</label>
                            <select id="filter-min-score">
                                <option value="0" data-i18n="filterAll">All</option>
                                <option value="3.5">3.5+</option>
                                <option value="4.0">4.0+</option>
                                <option value="4.5">4.5+</option>
                            </select>
                        </div>
                    </div>
                    <div class="public-proxy-search">
                        <input type="text" class="public-proxy-search-input" data-i18n-placeholder="publicProxySearchPlaceholder" placeholder="Search by IP...">
                    </div>
                    <div class="public-proxies-list">
                        <div class="loading-state">
                            <div class="spinner"></div>
                            <span data-i18n="publicProxiesLoading">Loading...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        adjustContainerHeight();

        const closeModal = () => {
            modal.remove();
            adjustContainerHeight();
        };

        modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        I18n.applyTranslations();

        // Загружаем публичные прокси
        const listContainer = modal.querySelector('.public-proxies-list') as HTMLElement;
        await this.loadAndRenderPublicProxies(modal, listContainer, closeModal);
    }

    private async loadAndRenderPublicProxies(
        modal: HTMLElement,
        listContainer: HTMLElement,
        closeModal: () => void
    ): Promise<void> {
        try {
            // Загружаем данные если нет в кэше
            if (!this.publicProxiesCache) {
                const response = await fetch(PUBLIC_PROXIES_URL);
                if (!response.ok) {
                    throw new Error('Failed to load proxies');
                }
                const rawData: PublicProxiesResponse = await response.json();
                this.publicProxiesCache = this.normalizeProxies(rawData);
            }

            const proxies = this.publicProxiesCache || [];

            // Заполняем список стран с флагами
            const countries = [...new Set(proxies.map(p => p.country))].sort();
            const countrySelect = modal.querySelector('#filter-country') as HTMLSelectElement;
            countries.forEach(country => {
                const option = document.createElement('option');
                option.value = country;
                option.textContent = `${this.countryCodeToFlag(country)} ${country}`;
                countrySelect.appendChild(option);
            });

            // Функция рендера списка с фильтрами
            const renderList = () => {
                const filters = this.getFiltersFromModal(modal);
                const searchQuery = (modal.querySelector('.public-proxy-search-input') as HTMLInputElement)?.value.toLowerCase() || '';
                const filteredProxies = this.filterPublicProxies(proxies, filters, searchQuery);
                this.renderPublicProxiesList(listContainer, filteredProxies, closeModal, modal);
            };

            // Обработчики фильтров
            modal.querySelectorAll('select').forEach(select => {
                select.addEventListener('change', renderList);
            });

            // Поиск
            const searchInput = modal.querySelector('.public-proxy-search-input') as HTMLInputElement;
            searchInput?.addEventListener('input', renderList);

            // Первоначальный рендер
            renderList();

        } catch (error) {
            console.error('Failed to load public proxies:', error);
            listContainer.innerHTML = `
                <div class="error-state">
                    <span data-i18n="publicProxiesError">Failed to load proxies</span>
                    <button class="retry-btn" data-i18n="publicProxiesRetry">Retry</button>
                </div>
            `;
            I18n.applyTranslations();

            listContainer.querySelector('.retry-btn')?.addEventListener('click', () => {
                listContainer.innerHTML = `
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <span data-i18n="publicProxiesLoading">Loading...</span>
                    </div>
                `;
                I18n.applyTranslations();
                this.publicProxiesCache = null;
                this.loadAndRenderPublicProxies(modal, listContainer, closeModal);
            });
        }
    }

    private normalizeProxies(response: PublicProxiesResponse): NormalizedPublicProxy[] {
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

        // Сортируем по рейтингу (лучшие сверху)
        return result.sort((a, b) => b.score - a.score);
    }

    private countryCodeToFlag(countryCode: string): string {
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
    }

    private getFiltersFromModal(modal: HTMLElement): PublicProxyFilters {
        return {
            protocol: (modal.querySelector('#filter-protocol') as HTMLSelectElement)?.value as ProxyType | '' || undefined,
            connectionType: (modal.querySelector('#filter-connection-type') as HTMLSelectElement)?.value || undefined,
            country: (modal.querySelector('#filter-country') as HTMLSelectElement)?.value || undefined,
            minScore: parseFloat((modal.querySelector('#filter-min-score') as HTMLSelectElement)?.value || '0') || undefined,
        };
    }

    private filterPublicProxies(
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

    private renderPublicProxiesList(
        container: HTMLElement,
        proxies: NormalizedPublicProxy[],
        closeModal: () => void,
        modal: HTMLElement
    ): void {
        if (proxies.length === 0) {
            container.innerHTML = `
                <div class="empty-state" data-i18n="publicProxiesEmpty">No proxies found</div>
            `;
            I18n.applyTranslations();
            return;
        }

        container.innerHTML = `<div class="public-proxies-content"></div>`;
        const content = container.querySelector('.public-proxies-content') as HTMLElement;

        proxies.forEach(proxy => {
            const item = this.createPublicProxyItem(proxy, closeModal, modal);
            content.appendChild(item);
        });
    }

    private createPublicProxyItem(proxy: NormalizedPublicProxy, closeModal: () => void, modal: HTMLElement): HTMLElement {
        const item = document.createElement('div');
        item.className = 'public-proxy-item';

        const scoreClass = proxy.score >= 4.5 ? 'high' : proxy.score >= 4.0 ? 'medium' : 'low';
        const connectionTypeLabel = this.getConnectionTypeLabel(proxy.connectionType);
        const flag = this.countryCodeToFlag(proxy.country);

        item.innerHTML = `
            <div class="proxy-item-main">
                <span class="proxy-item-address">${proxy.ip}:${proxy.port}</span>
                <div class="proxy-item-info">
                    <span class="score-value ${scoreClass}">${proxy.score.toFixed(1)}</span>
                    <span class="proxy-item-country">${flag} ${proxy.country}</span>
                    <span class="proxy-item-protocol">${proxy.protocol.toUpperCase()}</span>
                    <span class="proxy-item-type">${connectionTypeLabel}</span>
                </div>
            </div>
        `;

        item.addEventListener('click', async () => {
            const checkingOverlay = document.createElement('div');
            checkingOverlay.className = 'proxy-checking-overlay';
            checkingOverlay.innerHTML = `<div class="spinner"></div><span>${I18n.getMessage('checkProxyChecking') || 'Checking...'}</span>`;
            modal.querySelector('.public-proxies-modal')?.appendChild(checkingOverlay);

            const allowed = await this.checkProxyBeforeAdd(proxy.protocol, proxy.ip, proxy.port);
            checkingOverlay.remove();

            if (allowed) {
                await this.addPublicProxyToList(proxy);
                closeModal();
            }
        });

        return item;
    }

    private getConnectionTypeLabel(type: string): string {
        const labels: Record<string, string> = {
            'residential': I18n.getMessage('connectionTypeResidential') || 'Residential',
            'corporate': I18n.getMessage('connectionTypeCorporate') || 'Corporate',
            'mobile': I18n.getMessage('connectionTypeMobile') || 'Mobile',
        };
        return labels[type] || type;
    }

    private async checkProxyBeforeAdd(type: ProxyType, host: string, port: number, username?: string, password?: string): Promise<boolean> {
        const result: string = await chrome.runtime.sendMessage({
            action: 'checkProxy',
            proxy: { type, host, port, username, password },
        });
        if (result === 'ok') return true;

        const htmlMessage = `<div class="public-proxies-warning" style="margin:0"><span class="warning-icon">⚠️</span><div class="warning-content"><span class="warning-title">${I18n.getMessage('proxyCheckFailedTitle')}</span><span>${I18n.getMessage('publicProxiesWarning')}</span><span class="warning-recommendation"><a href="https://app.proxy-cheap.com/r/MCk2IU" target="_blank">${I18n.getMessage('publicProxiesRecommendation')}</a></span></div></div>`;
        return showConfirm('', {
            okText: I18n.getMessage('saveAnyway') || 'Save anyway',
            cancelText: I18n.getMessage('cancel') || 'Cancel',
            htmlMessage,
        });
    }

    private async addPublicProxyToList(publicProxy: NormalizedPublicProxy): Promise<void> {
        const flag = this.countryCodeToFlag(publicProxy.country);
        await Storage.addProxy({
            name: `${flag} ${publicProxy.country} - ${publicProxy.ip}`,
            type: publicProxy.protocol,
            host: publicProxy.ip,
            port: publicProxy.port,
            isDefault: this.proxies.length === 0,
        });
        await this.loadProxies();
        this.render();
    }

    // Проверить, есть ли прокси в списке
    hasProxies(): boolean {
        return this.proxies.length > 0;
    }

    private showEditProxyForm(proxy: ProxyServer): void {
        this.showProxyForm(proxy);
    }

    private showProxyForm(proxy: ProxyServer | null): void {
        const isEdit = proxy !== null;
        const title = isEdit ? I18n.getMessage('editProxy') : I18n.getMessage('addProxy');

        // Создаём модальное окно
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal proxy-form-modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="proxy-form-recommendation">
                        <span class="recommendation-icon">💡</span>
                        <span><a href="https://app.proxy-cheap.com/r/MCk2IU" target="_blank" rel="noopener noreferrer" data-i18n="proxyFormRecommendation">Need reliable and affordable proxies?</a></span>
                    </div>
                    <form class="proxy-form">
                        <div class="form-group">
                            <label data-i18n="proxyName">Name (optional)</label>
                            <input type="text" name="name" value="${proxy?.name || ''}" placeholder="My Proxy">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label data-i18n="proxyType">Type</label>
                                <select name="type">
                                    <option value="http" ${proxy?.type === 'http' ? 'selected' : ''}>HTTP</option>
                                    <option value="https" ${proxy?.type === 'https' ? 'selected' : ''}>HTTPS</option>
                                    <option value="socks4" ${proxy?.type === 'socks4' ? 'selected' : ''}>SOCKS4</option>
                                    <option value="socks5" ${proxy?.type === 'socks5' ? 'selected' : ''}>SOCKS5</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group flex-grow">
                                <label data-i18n="proxyHost">Host</label>
                                <input type="text" name="host" value="${proxy?.host || ''}" placeholder="proxy.example.com" required>
                            </div>
                            <div class="form-group">
                                <label data-i18n="proxyPort">Port</label>
                                <input type="number" name="port" value="${proxy?.port || ''}" placeholder="8080" min="1" max="65535" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label><input type="checkbox" name="hasAuth" ${proxy?.username ? 'checked' : ''}> <span data-i18n="proxyAuth">Authentication</span></label>
                        </div>
                        <div class="auth-fields" style="display: ${proxy?.username ? 'block' : 'none'}">
                            <div class="form-row">
                                <div class="form-group">
                                    <label data-i18n="proxyUsername">Username</label>
                                    <input type="text" name="username" value="${proxy?.username || ''}">
                                </div>
                                <div class="form-group">
                                    <label data-i18n="proxyPassword">Password</label>
                                    <input type="password" name="password" value="${proxy?.password || ''}">
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary modal-cancel" data-i18n="cancel">Cancel</button>
                    <button type="button" class="btn btn-primary modal-save" data-i18n="save">Save</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        adjustContainerHeight();

        // Обработчик checkbox для auth
        const hasAuthCheckbox = modal.querySelector('input[name="hasAuth"]') as HTMLInputElement;
        const authFields = modal.querySelector('.auth-fields') as HTMLElement;
        hasAuthCheckbox?.addEventListener('change', () => {
            authFields.style.display = hasAuthCheckbox.checked ? 'block' : 'none';
        });

        // Закрытие модального окна
        const closeModal = () => {
            modal.remove();
            adjustContainerHeight();
        };

        modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
        modal.querySelector('.modal-cancel')?.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        const saveBtn = modal.querySelector('.modal-save') as HTMLButtonElement;
        const originalSaveText = I18n.getMessage('save') || 'Save';

        const doSave = async (host: string, port: number, name: string | undefined, type: ProxyType, username: string | undefined, password: string | undefined) => {
            if (isEdit && proxy) {
                await Storage.updateProxy(proxy.id, { name, type, host, port, username, password });
            } else {
                await Storage.addProxy({ name, type, host, port, username, password, isDefault: false });
            }
            closeModal();
            await this.loadProxies();
            this.render();
        };

        // Сохранение с проверкой
        saveBtn?.addEventListener('click', async () => {
            const form = modal.querySelector('form') as HTMLFormElement;
            const formData = new FormData(form);

            const host = (formData.get('host') as string)?.trim();
            const port = parseInt(formData.get('port') as string, 10);

            if (!host || !port || port < 1 || port > 65535) {
                await showAlert(I18n.getMessage('proxyValidationError'));
                return;
            }

            const name = (formData.get('name') as string)?.trim() || undefined;
            const type = formData.get('type') as ProxyType;
            const username = hasAuthCheckbox.checked ? (formData.get('username') as string)?.trim() || undefined : undefined;
            const password = hasAuthCheckbox.checked ? (formData.get('password') as string) || undefined : undefined;

            // Run connectivity check
            saveBtn.disabled = true;
            saveBtn.classList.add('btn-checking');
            saveBtn.textContent = I18n.getMessage('checkProxyChecking') || 'Checking...';

            const allowed = await this.checkProxyBeforeAdd(type, host, port, username, password);

            saveBtn.disabled = false;
            saveBtn.classList.remove('btn-checking');
            saveBtn.textContent = originalSaveText;

            if (allowed) {
                await doSave(host, port, name, type, username, password);
            }
        });

        // Применяем локализацию
        I18n.applyTranslations();
    }

    private async setAsDefault(proxyId: string): Promise<void> {
        await Storage.setDefaultProxy(proxyId);
        await this.loadProxies();
        this.render();
    }

    private async deleteProxy(proxyId: string): Promise<void> {
        const proxy = this.proxies.find(p => p.id === proxyId);
        if (!proxy) return;

        const proxyDisplayName = proxy.name || `${proxy.host}:${proxy.port}`;
        const confirmMessage = `${I18n.getMessage('deleteProxyConfirm')} "${proxyDisplayName}"?`;
        const confirmed = await showConfirm(confirmMessage);
        if (!confirmed) return;

        await Storage.deleteProxy(proxyId);
        await this.loadProxies();
        this.render();
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Получить все прокси для выбора в пресетах
    getProxies(): ProxyServer[] {
        return this.proxies;
    }

    // Обновить список (вызывается извне при изменениях)
    async refresh(): Promise<void> {
        await this.loadProxies();
        this.render();
    }
}

export const ProxyList = new ProxyListService();