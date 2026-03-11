import { Storage } from '../shared/storage';
import { I18n } from '../shared/i18n';
import { ProxyServer, ProxyType, NormalizedPublicProxy } from '../types';
import { showConfirm } from './dialog';
import { createElementFromTemplate, setAttr } from './safe-dom';
import { ModalHelper } from './modal-helper';
import { showProxyForm } from './proxy-form-modal';
import { showPublicProxiesModal, countryCodeToFlag } from './public-proxies-modal';

class ProxyListService {
    private container: HTMLElement | null = null;
    private proxies: ProxyServer[] = [];

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

        this.container.innerHTML = '';

        const proxyListDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-list' });

        const headerDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-list-header' });
        const title = createElementFromTemplate<HTMLHeadingElement>('h3', { textContent: 'Proxy Servers' });
        setAttr(title, 'data-i18n', 'proxyServersTitle');
        headerDiv.appendChild(title);

        const addProxyBtn = createElementFromTemplate<HTMLButtonElement>('button', { className: 'add-proxy-btn', title: 'Add proxy' });
        const iconSpan = createElementFromTemplate<HTMLSpanElement>('span', { className: 'icon', textContent: '+' });
        addProxyBtn.appendChild(iconSpan);
        headerDiv.appendChild(addProxyBtn);

        proxyListDiv.appendChild(headerDiv);

        const itemsContainerEl = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-items' });
        proxyListDiv.appendChild(itemsContainerEl);

        this.container.appendChild(proxyListDiv);

        addProxyBtn.addEventListener('click', () => this.showAddProxyForm());

        // DocumentFragment для batch DOM-обновлений (устраняет layout thrashing)
        const fragment = document.createDocumentFragment();
        this.proxies.forEach((proxy) => {
            const item = this.createProxyItem(proxy);
            fragment.appendChild(item);
        });
        itemsContainerEl.appendChild(fragment);

        I18n.applyTranslations();
    }

    private createProxyItem(proxy: ProxyServer): HTMLElement {
        const item = document.createElement('div');
        item.className = `proxy-item${proxy.isDefault ? ' default' : ''}`;
        item.dataset.proxyId = proxy.id;

        const displayName = proxy.name || `${proxy.host}:${proxy.port}`;
        const proxyTypeLabel = this.getProxyTypeLabel(proxy.type);
        const hasAuth = proxy.username ? ' 🔐' : '';

        const mainDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-item-main' });

        const infoDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-item-info' });
        const nameSpan = createElementFromTemplate<HTMLSpanElement>('span', { className: 'proxy-name', textContent: `${displayName}${hasAuth}` });
        infoDiv.appendChild(nameSpan);

        const detailsSpan = createElementFromTemplate<HTMLSpanElement>('span', { className: 'proxy-details', textContent: `${proxyTypeLabel} • ${proxy.host}:${proxy.port}` });
        infoDiv.appendChild(detailsSpan);

        mainDiv.appendChild(infoDiv);

        const actionsDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-item-actions' });

        if (proxy.isDefault) {
            const defaultBadge = createElementFromTemplate<HTMLSpanElement>('span', { className: 'default-badge', textContent: 'Default' });
            setAttr(defaultBadge, 'data-i18n', 'defaultProxy');
            actionsDiv.appendChild(defaultBadge);
        } else {
            const setDefaultBtn = createElementFromTemplate<HTMLButtonElement>('button', { className: 'set-default-btn', textContent: 'Set Default' });
            setAttr(setDefaultBtn, 'data-i18n', 'setDefault');
            actionsDiv.appendChild(setDefaultBtn);
        }

        const editBtn = createElementFromTemplate<HTMLButtonElement>('button', { className: 'edit-proxy-btn', title: 'Edit', textContent: '✏️' });
        actionsDiv.appendChild(editBtn);

        if (!proxy.isDefault) {
            const deleteBtn = createElementFromTemplate<HTMLButtonElement>('button', { className: 'delete-proxy-btn', title: 'Delete', textContent: '🗑️' });
            actionsDiv.appendChild(deleteBtn);
        }

        mainDiv.appendChild(actionsDiv);
        item.appendChild(mainDiv);

        item.querySelector('.set-default-btn')?.addEventListener('click', () => this.setAsDefault(proxy.id));
        item.querySelector('.edit-proxy-btn')?.addEventListener('click', () => this.showEditProxyForm(proxy));
        item.querySelector('.delete-proxy-btn')?.addEventListener('click', () => this.deleteProxy(proxy.id));

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

    openAddProxyForm(): void {
        this.showProxyTypeDialog();
    }

    private showProxyTypeDialog(): void {
        const { body, closeModal, build } = ModalHelper.createSimple(
            I18n.getMessage('proxyTypeDialogTitle'),
            'proxy-type-modal'
        );

        const optionsDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-type-options' });

        const customBtn = createElementFromTemplate<HTMLButtonElement>('button', { className: 'proxy-type-option' });
        setAttr(customBtn, 'data-type', 'custom');
        const customIcon = createElementFromTemplate<HTMLSpanElement>('span', { className: 'option-icon', textContent: '✏️' });
        const customText = createElementFromTemplate<HTMLSpanElement>('span', { className: 'option-text', textContent: 'Add Custom' });
        setAttr(customText, 'data-i18n', 'proxyTypeAddOwn');
        customBtn.appendChild(customIcon);
        customBtn.appendChild(customText);
        optionsDiv.appendChild(customBtn);

        const publicBtn = createElementFromTemplate<HTMLButtonElement>('button', { className: 'proxy-type-option' });
        setAttr(publicBtn, 'data-type', 'public');
        const publicIcon = createElementFromTemplate<HTMLSpanElement>('span', { className: 'option-icon', textContent: '🌐' });
        const publicText = createElementFromTemplate<HTMLSpanElement>('span', { className: 'option-text', textContent: 'Select from Public' });
        setAttr(publicText, 'data-i18n', 'proxyTypeSelectPublic');
        publicBtn.appendChild(publicIcon);
        publicBtn.appendChild(publicText);
        optionsDiv.appendChild(publicBtn);

        body.appendChild(optionsDiv);

        build();

        optionsDiv.querySelector('[data-type="custom"]')?.addEventListener('click', () => {
            closeModal();
            this.showProxyForm(null);
        });

        optionsDiv.querySelector('[data-type="public"]')?.addEventListener('click', () => {
            closeModal();
            this.showPublicProxiesModal();
        });

        I18n.applyTranslations();
    }

    private showPublicProxiesModal(): void {
        showPublicProxiesModal(async (proxy) => {
            await this.addPublicProxyToList(proxy);
        });
    }

    private async addPublicProxyToList(publicProxy: NormalizedPublicProxy): Promise<void> {
        const flag = countryCodeToFlag(publicProxy.country);
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

    hasProxies(): boolean {
        return this.proxies.length > 0;
    }

    private showEditProxyForm(proxy: ProxyServer): void {
        this.showProxyForm(proxy);
    }

    private showProxyForm(proxy: ProxyServer | null): void {
        showProxyForm(proxy, async () => {
            await this.loadProxies();
            this.render();
        });
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

    getProxies(): ProxyServer[] {
        return this.proxies;
    }

    async refresh(): Promise<void> {
        await this.loadProxies();
        this.render();
    }
}

export const ProxyList = new ProxyListService();
