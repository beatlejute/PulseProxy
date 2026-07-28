import { ProxyState, DOMIds, StorageKeys } from '../shared/constants';
import { ProxyStateType, I18nKey } from '../types';
import { trackEvent, buildAffiliateUrl } from '../shared/analytics';
import { RemoteConfig } from '../shared/remote-config';
import { I18n } from '../shared/i18n';

class UIService {
    private button: HTMLButtonElement | null = null;
    private errorBanner: HTMLElement | null = null;
    private errorProxyLabel: HTMLElement | null = null;
    private errorBannerDismissed = false;
    private currentState: ProxyStateType = ProxyState.DISCONNECTED;

    init(): void {
        this.button = document.getElementById(DOMIds.MAIN_BUTTON) as HTMLButtonElement;
        this.errorBanner = document.getElementById('error-banner');
        this.errorProxyLabel = document.getElementById('error-proxy-label');
        document.getElementById('error-banner-close')?.addEventListener('click', () => this.dismissErrorBanner());
        this.initAffiliateLinkHandlers();
    }

    private dismissErrorBanner(): void {
        this.errorBannerDismissed = true;
        if (this.errorBanner) {
            this.errorBanner.style.display = 'none';
        }
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
        this.currentState = state;
        this.updateButtonState(state);
        this.updateErrorBanner(state);
    }

    getCurrentState(): ProxyStateType {
        return this.currentState;
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
        
        // Обновляем текст надписи на щите
        const labelMap: Record<ProxyStateType, string> = {
            [ProxyState.DISCONNECTED]: 'OFF',
            [ProxyState.CONNECTED]: 'ON',
            [ProxyState.CONNECTING]: '...',
            [ProxyState.ERROR]: 'ERROR',
        };
        const labelEl = this.button.querySelector('.shield-label');
        if (labelEl) labelEl.textContent = labelMap[state];
        
        // Маппинг состояний на ключи i18n для aria-label
        const ariaMap: Record<ProxyStateType, I18nKey> = {
            [ProxyState.DISCONNECTED]: 'ariaProxyOff',
            [ProxyState.CONNECTED]: 'ariaProxyOn',
            [ProxyState.CONNECTING]: 'ariaProxyConnecting',
            [ProxyState.ERROR]: 'ariaProxyError',
        };
        this.button.setAttribute('aria-label', I18n.getMessage(ariaMap[state]));
        
        this.button.setAttribute('aria-pressed', state === ProxyState.CONNECTED ? 'true' : 'false');
        console.log('UI: Button state updated to', state);
    }

    private updateErrorBanner(state: ProxyStateType): void {
        if (!this.errorBanner) return;
        if (state !== ProxyState.ERROR) {
            // Выход из ERROR сбрасывает закрытие крестиком — новая ошибка снова покажет баннер
            this.errorBannerDismissed = false;
            this.errorBanner.style.display = 'none';
            return;
        }
        if (this.errorBannerDismissed) return;

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