import { ProxyState, DOMIds, StorageKeys } from '../shared/constants';
import { ProxyStateType } from '../types';
import { trackEvent, buildAffiliateUrl } from '../shared/analytics';
import { RemoteConfig } from '../shared/remote-config';

class UIService {
    private button: HTMLButtonElement | null = null;
    private errorBanner: HTMLElement | null = null;
    private errorProxyLabel: HTMLElement | null = null;

    init(): void {
        this.button = document.getElementById(DOMIds.MAIN_BUTTON) as HTMLButtonElement;
        this.errorBanner = document.getElementById('error-banner');
        this.errorProxyLabel = document.getElementById('error-proxy-label');
        this.initAffiliateLinkHandlers();
    }

    private initAffiliateLinkHandlers(): void {
        const container = document.querySelector('.public-proxies-warning');
        if (!container) return;
        container.querySelectorAll<HTMLAnchorElement>('.referral-link').forEach(link => {
            link.addEventListener('click', (e) => this.handleAffiliateLinkClick(e));
        });
    }

    private async handleAffiliateLinkClick(e: Event): Promise<void> {
        e.preventDefault();
        const link = e.currentTarget as HTMLAnchorElement;
        const url = RemoteConfig.referralLink;
        
        if (url && url !== '#') {
            const fullUrl = buildAffiliateUrl(url, 'popup');
            const provider = this.extractProviderFromUrl(url);
            
            await trackEvent('affiliate_link_clicked', {
                provider,
                placement: 'popup',
                link_url: fullUrl
            });
            
            chrome.tabs.create({ url: fullUrl });
        }
    }

    private extractProviderFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.replace(/^www\./, '');
            return hostname.split('.')[0];
        } catch {
            return 'unknown';
        }
    }

    updateState(state: ProxyStateType): void {
        this.updateButtonState(state);
        this.updateErrorBanner(state);
    }

    private updateButtonState(state: ProxyStateType): void {
        if (!this.button) return;

        // Удаляем все состояния
        this.button.classList.remove(
            ProxyState.DISCONNECTED,
            ProxyState.CONNECTED,
            ProxyState.CONNECTING,
            ProxyState.ERROR
        );

        // Добавляем текущее состояние
        this.button.classList.add(state);
        console.log('UI: Button state updated to', state);
    }

    private updateErrorBanner(state: ProxyStateType): void {
        if (!this.errorBanner) return;
        if (state !== ProxyState.ERROR) {
            this.errorBanner.style.display = 'none';
            return;
        }

        chrome.storage.local.get(StorageKeys.ERROR_PROXY, (result) => {
            const label = result[StorageKeys.ERROR_PROXY] as string | undefined;
            if (this.errorProxyLabel) {
                this.errorProxyLabel.textContent = label ? `(${label})` : '';
            }
            this.errorBanner!.style.display = 'flex';
        });
    }
}

export const UI = new UIService();