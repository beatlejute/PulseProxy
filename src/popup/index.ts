import { UI } from './ui';
import { Settings } from './settings';
import { Tabs } from './tabs';
import { ProxyList } from './proxy-list';
import { Presets } from './presets';
import { Storage } from '../shared/storage';
import { I18n } from '../shared/i18n';
import { ProxyState, StorageKeys, DOMIds } from '../shared/constants';
import { ProxyStateType, StorageChanges } from '../types';
import { showConfirm } from './dialog';

class PopupApp {
    async init(): Promise<void> {
        console.log('Popup: Initializing...');

        // Инициализация Storage первым делом (для миграций)
        await Storage.init();

        // Инициализация i18n
        await I18n.init();

        // Инициализация модулей
        UI.init();
        Settings.init();
        Tabs.init();
        await ProxyList.init();
        await Presets.init();

        // Применяем переводы
        I18n.applyTranslations();

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
        const currentTargetState = await Storage.getTargetState();
        const newTargetState: ProxyStateType =
            currentTargetState === ProxyState.CONNECTED
                ? ProxyState.DISCONNECTED
                : ProxyState.CONNECTED;

        // Если пытаемся включить прокси, но прокси не настроены - предложить добавить
        if (newTargetState === ProxyState.CONNECTED && !ProxyList.hasProxies()) {
            const shouldAdd = await showConfirm(I18n.getMessage('noProxiesConfigured'));
            if (shouldAdd) {
                ProxyList.openAddProxyForm();
            }
            return;
        }

        console.log('Popup: Toggling proxy to', newTargetState);
        await Storage.setTargetState(newTargetState);
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
                console.log('Popup: Proxies changed, re-rendering presets');
                Presets.render();
            }
        });
    }
}

// Запуск при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    const app = new PopupApp();
    app.init();
});