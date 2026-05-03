import { UI } from './ui';
import { Settings } from './settings';
import { Tabs } from './tabs';
import { ProxyList } from './proxy-list';
import { Presets } from './presets';
import { Storage } from '../shared/storage';
import { I18n } from '../shared/i18n';
import { RemoteConfig } from '../shared/remote-config';
import { ProxyState, StorageKeys, DOMIds } from '../shared/constants';
import { ProxyStateType, StorageChanges } from '../types';
import { showConfirm } from './dialog';
import { showSelectDefaultProxyModal } from './select-default-proxy-modal';

class PopupApp {
    async init(): Promise<void> {
        console.log('Popup: Initializing...');

        // Инициализация Storage первым делом (для миграций)
        await Storage.init();

        // Инициализация i18n и удалённого конфига
        await I18n.init();
        await RemoteConfig.init();

        // Инициализация модулей
        UI.init();
        Settings.init();
        Tabs.init();
        await ProxyList.init();
        await Presets.init();

        // Применяем переводы и реферальные ссылки
        I18n.applyTranslations();
        this.updateReferralLinks();

        // Привязка событий
        this.bindMainButton();

        // Загрузка начального состояния
        await this.loadInitialState();

        // Подписка на изменения
        this.subscribeToChanges();
    }

    private bindMainButton(): void {
        const button = document.getElementById(DOMIds.MAIN_BUTTON);
        button?.addEventListener('click', () => this.handleMainButtonClick());
    }

    private async handleMainButtonClick(): Promise<void> {
        const targetState = await Storage.getTargetState();
        const newTargetState: ProxyStateType =
            targetState === ProxyState.CONNECTED
                ? ProxyState.DISCONNECTED
                : ProxyState.CONNECTED;

        if (newTargetState === ProxyState.CONNECTED) {
            const proxies = await Storage.getProxies();
            // REGRESSION-GUARD (TC-D3f, PLAN-014): proxies.length === 0 → показать диалог "добавить прокси"
            if (proxies.length === 0) {
                const shouldAdd = await showConfirm(I18n.getMessage('noProxiesConfigured'));
                if (shouldAdd) {
                    ProxyList.openAddProxyForm();
                }
                return;
            }
            const defaultProxy = await Storage.getDefaultProxy();
            if (!defaultProxy) {
                let selectedId: string | null;
                if (proxies.length === 1) {
                    selectedId = proxies[0].id;
                } else {
                    selectedId = await showSelectDefaultProxyModal(proxies);
                    if (!selectedId) {
                        return;
                    }
                }
                await Storage.setDefaultProxy(selectedId);
            }
        }

        // REGRESSION-GUARD (TC-D3e, PLAN-014): defaultProxy задан → штатный путь без модалки
        console.log('Popup: Toggling proxy to', newTargetState);
        await Storage.setTargetState(newTargetState);
    }

    private updateReferralLinks(): void {
        document.querySelectorAll<HTMLAnchorElement>('a.referral-link').forEach(link => {
            link.href = RemoteConfig.referralLink;
        });
    }

    private async loadInitialState(): Promise<void> {
        const currentState = await Storage.getCurrentState();
        console.log('Popup: Initial state =', currentState);
        UI.updateState(currentState);
    }

    private subscribeToChanges(): void {
        Storage.onChange((changes: StorageChanges, area: string) => {
            if (area !== 'local') return;

            if (StorageKeys.CURRENT_STATE in changes) {
                const newState = changes[StorageKeys.CURRENT_STATE].newValue as ProxyStateType;
                console.log('Popup: State changed to', newState);
                UI.updateState(newState);
            }

            // При изменении прокси - перерисовываем пресеты (для обновления выпадающего списка прокси)
            if (StorageKeys.PROXIES in changes) {
                console.log('Popup: Proxies changed, re-rendering presets and proxy list');
                Presets.render();
                ProxyList.refresh();
            }
        });
    }
}

// Запуск при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    const app = new PopupApp();
    app.init();
});