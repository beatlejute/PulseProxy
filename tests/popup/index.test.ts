/**
 * @jest-environment jsdom
 */

// Mock all dependencies
jest.mock('../../src/popup/ui', () => ({
    UI: {
        init: jest.fn(),
        updateState: jest.fn()
    }
}));

jest.mock('../../src/popup/settings', () => ({
    Settings: {
        init: jest.fn()
    }
}));

jest.mock('../../src/popup/tabs', () => ({
    Tabs: {
        init: jest.fn()
    }
}));

jest.mock('../../src/popup/proxy-list', () => ({
    ProxyList: {
        init: jest.fn().mockResolvedValue(undefined),
        hasProxies: jest.fn().mockReturnValue(true),
        openAddProxyForm: jest.fn(),
        refresh: jest.fn().mockResolvedValue(undefined)
    }
}));

jest.mock('../../src/popup/presets', () => ({
    Presets: {
        init: jest.fn().mockResolvedValue(undefined),
        render: jest.fn()
    }
}));

jest.mock('../../src/shared/storage', () => ({
    Storage: {
        init: jest.fn().mockResolvedValue(undefined),
        getTargetState: jest.fn().mockResolvedValue('disconnected'),
        setTargetState: jest.fn().mockResolvedValue(undefined),
        getCurrentState: jest.fn().mockResolvedValue('disconnected'),
        onChange: jest.fn(),
        getProxies: jest.fn().mockResolvedValue([]),
        getDefaultProxy: jest.fn().mockResolvedValue(undefined),
        setDefaultProxy: jest.fn().mockResolvedValue(undefined)
    }
}));

jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        init: jest.fn().mockResolvedValue(undefined),
        applyTranslations: jest.fn(),
        getMessage: jest.fn((key: string) => key)
    }
}));

jest.mock('../../src/shared/remote-config', () => ({
    RemoteConfig: {
        init: jest.fn().mockResolvedValue(undefined),
        referralLink: 'https://example.com/ref'
    }
}));

jest.mock('../../src/popup/dialog', () => ({
    showConfirm: jest.fn()
}));
jest.mock('../../src/popup/select-default-proxy-modal', () => ({
    showSelectDefaultProxyModal: jest.fn()
}));

// Import after mocks
import { UI } from '../../src/popup/ui';
import { Settings } from '../../src/popup/settings';
import { Tabs } from '../../src/popup/tabs';
import { ProxyList } from '../../src/popup/proxy-list';
import { Presets } from '../../src/popup/presets';
import { Storage } from '../../src/shared/storage';
import { I18n } from '../../src/shared/i18n';
import { RemoteConfig } from '../../src/shared/remote-config';
import { ProxyState, StorageKeys, DOMIds } from '../../src/shared/constants';
import { showConfirm } from '../../src/popup/dialog';
import { showSelectDefaultProxyModal } from '../../src/popup/select-default-proxy-modal';

// SYNC: src/popup/index.ts handleMainButtonClick — синхронизировано 2026-07-27
// Recreate PopupApp class for testing (since it's not exported)
class PopupApp {
    async init(): Promise<void> {
        await Storage.init();
        await I18n.init();

        // Удалённый конфиг грузим в фоне: сеть не должна блокировать отрисовку попапа
        void RemoteConfig.init().then(() => this.updateReferralLinks());

        UI.init();
        Settings.init();
        Tabs.init();
        await ProxyList.init();
        await Presets.init();

        I18n.applyTranslations();
        this.updateReferralLinks();
        this.bindMainButton();
        await this.loadInitialState();
        this.subscribeToChanges();
    }

    private updateReferralLinks(): void {
        document.querySelectorAll<HTMLAnchorElement>('a.referral-link').forEach(link => {
            link.href = RemoteConfig.referralLink;
        });
    }

    private bindMainButton(): void {
        const button = document.getElementById(DOMIds.MAIN_BUTTON);
        button?.addEventListener('click', () => this.handleMainButtonClick());
    }

    async handleMainButtonClick(): Promise<void> {
        const currentState = await Storage.getCurrentState();
        const newTargetState = currentState === ProxyState.CONNECTED
            ? ProxyState.DISCONNECTED
            : ProxyState.CONNECTED;

        if (newTargetState === ProxyState.CONNECTED) {
            const proxies = await Storage.getProxies();
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

        console.log('Popup: Toggling proxy to', newTargetState);
        await Storage.setTargetState(newTargetState);
    }

    private async loadInitialState(): Promise<void> {
        const currentState = await Storage.getCurrentState();
        UI.updateState(currentState);
    }

    private subscribeToChanges(): void {
        Storage.onChange((changes: Record<string, { newValue: unknown; oldValue: unknown }>, area: string) => {
            if (area !== 'local') return;

            if (StorageKeys.CURRENT_STATE in changes) {
                const newState = changes[StorageKeys.CURRENT_STATE].newValue;
                UI.updateState(newState);
            }

            if (StorageKeys.PROXIES in changes) {
                Presets.render();
                ProxyList.refresh();
            }
        });
    }
}

describe('PopupApp', () => {
    let app: PopupApp;

    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = `<button id="${DOMIds.MAIN_BUTTON}">Toggle</button>`;
        app = new PopupApp();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('init()', () => {
        it('should initialize storage first', async () => {
            await app.init();
            expect(Storage.init).toHaveBeenCalled();
        });

        it('should initialize i18n', async () => {
            await app.init();
            expect(I18n.init).toHaveBeenCalled();
        });

        it('should initialize all UI modules', async () => {
            await app.init();
            
            expect(UI.init).toHaveBeenCalled();
            expect(Settings.init).toHaveBeenCalled();
            expect(Tabs.init).toHaveBeenCalled();
            expect(ProxyList.init).toHaveBeenCalled();
            expect(Presets.init).toHaveBeenCalled();
        });

        it('should apply translations after init', async () => {
            await app.init();
            expect(I18n.applyTranslations).toHaveBeenCalled();
        });

        it('should load initial state', async () => {
            await app.init();
            
            expect(Storage.getCurrentState).toHaveBeenCalled();
            expect(UI.updateState).toHaveBeenCalledWith('disconnected');
        });

        it('should subscribe to storage changes', async () => {
            await app.init();
            expect(Storage.onChange).toHaveBeenCalled();
        });

        it('should not block init when RemoteConfig.init hangs (offline / blocked host)', async () => {
            // Зависший сетевой запрос: промис никогда не резолвится
            (RemoteConfig.init as jest.Mock).mockReturnValueOnce(new Promise(() => {}));

            await app.init();

            // UI полностью инициализирован, несмотря на висящий RemoteConfig
            expect(UI.init).toHaveBeenCalled();
            expect(ProxyList.init).toHaveBeenCalled();
            expect(I18n.applyTranslations).toHaveBeenCalled();
            expect(UI.updateState).toHaveBeenCalled();
        });

        it('should update referral links after RemoteConfig loads', async () => {
            document.body.innerHTML += '<a class="referral-link" href="#">Buy proxies</a>';

            await app.init();
            // Даём отработать .then() фоновой загрузки конфига
            await new Promise(resolve => setTimeout(resolve, 0));

            const link = document.querySelector<HTMLAnchorElement>('a.referral-link');
            expect(link?.href).toBe('https://example.com/ref');
        });
    });

    describe('handleMainButtonClick()', () => {
        beforeEach(async () => {
            await app.init();
            jest.clearAllMocks();
        });

        it('should toggle from disconnected to connected', async () => {
            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue([{ id: 'p1', name: 'proxy1', host: 'example.com', port: 8080, isDefault: false }]);
            (Storage.getDefaultProxy as jest.Mock).mockResolvedValue('p1');

            await app.handleMainButtonClick();

            expect(Storage.setTargetState).toHaveBeenCalledWith(ProxyState.CONNECTED);
        });

        it('should toggle from connected to disconnected', async () => {
            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.CONNECTED);

            await app.handleMainButtonClick();

            expect(Storage.setTargetState).toHaveBeenCalledWith(ProxyState.DISCONNECTED);
        });

        it('should toggle to connected when currentState=disconnected but targetState=connected (desync recovery)', async () => {
            // Рассинхронизация: фактический стейт — disconnected, но желаемый остался connected
            // (например, enable() провалился, а targetState не откатился).
            // Клик должен инвертировать ФАКТИЧЕСКОЕ состояние, а не желание.
            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue([{ id: 'p1', name: 'proxy1', host: 'example.com', port: 8080, isDefault: false }]);
            (Storage.getDefaultProxy as jest.Mock).mockResolvedValue('p1');

            await app.handleMainButtonClick();

            expect(Storage.setTargetState).toHaveBeenCalledWith(ProxyState.CONNECTED);
        });

        it('should treat error state as non-connected and toggle to connected', async () => {
            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.ERROR);
            (Storage.getProxies as jest.Mock).mockResolvedValue([{ id: 'p1', name: 'proxy1', host: 'example.com', port: 8080, isDefault: false }]);
            (Storage.getDefaultProxy as jest.Mock).mockResolvedValue('p1');

            await app.handleMainButtonClick();

            expect(Storage.setTargetState).toHaveBeenCalledWith(ProxyState.CONNECTED);
        });

        it('should show confirm when no proxies configured', async () => {
            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue([]);
            (showConfirm as jest.Mock).mockResolvedValue(false);

            await app.handleMainButtonClick();

            expect(showConfirm).toHaveBeenCalledWith('noProxiesConfigured');
            expect(Storage.setTargetState).not.toHaveBeenCalled();
            expect(ProxyList.openAddProxyForm).not.toHaveBeenCalled();
        });

        it('should open add proxy form if user confirms', async () => {
            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue([]);
            (showConfirm as jest.Mock).mockResolvedValue(true);

            await app.handleMainButtonClick();

            expect(ProxyList.openAddProxyForm).toHaveBeenCalled();
            expect(Storage.setTargetState).not.toHaveBeenCalled();
        });

        it('should not open form if user declines', async () => {
            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue([]);
            (showConfirm as jest.Mock).mockResolvedValue(false);

            await app.handleMainButtonClick();

            expect(ProxyList.openAddProxyForm).not.toHaveBeenCalled();
        });

        // TC-D3a: single proxy, авто-выбор
        it('TC-D3a: should auto-select single proxy without modal', async () => {
            const singleProxy = { id: 'p1', name: 'proxy1', host: 'example.com', port: 8080, isDefault: false };

            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue([singleProxy]);
            (Storage.getDefaultProxy as jest.Mock).mockResolvedValue(undefined);

            await app.handleMainButtonClick();

            expect(Storage.setDefaultProxy).toHaveBeenCalledTimes(1);
            expect(Storage.setDefaultProxy).toHaveBeenCalledWith('p1');
            expect(showSelectDefaultProxyModal).not.toHaveBeenCalled();
            expect(Storage.setTargetState).toHaveBeenCalledTimes(1);
            expect(Storage.setTargetState).toHaveBeenCalledWith(ProxyState.CONNECTED);
        });

        // TC-D3b: multi proxy, открытие модалки
        it('TC-D3b: should show modal when multiple proxies and no default', async () => {
            const proxies = [
                { id: 'p1', name: 'proxy1', host: 'example.com', port: 8080, isDefault: false },
                { id: 'p2', name: 'proxy2', host: 'example.com', port: 8081, isDefault: false }
            ];

            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue(proxies);
            (Storage.getDefaultProxy as jest.Mock).mockResolvedValue(undefined);
            (showSelectDefaultProxyModal as jest.Mock).mockResolvedValue(null);

            await app.handleMainButtonClick();

            expect(showSelectDefaultProxyModal).toHaveBeenCalledWith(proxies);
            expect(Storage.setTargetState).not.toHaveBeenCalled();
        });

        // TC-D3c: multi proxy, выбор в модалке
        it('TC-D3c: should set default proxy when user selects in modal', async () => {
            const proxies = [
                { id: 'p1', name: 'proxy1', host: 'example.com', port: 8080, isDefault: false },
                { id: 'p2', name: 'proxy2', host: 'example.com', port: 8081, isDefault: false }
            ];

            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue(proxies);
            (Storage.getDefaultProxy as jest.Mock).mockResolvedValue(undefined);
            (showSelectDefaultProxyModal as jest.Mock).mockResolvedValue('p2');

            await app.handleMainButtonClick();

            expect(Storage.setDefaultProxy).toHaveBeenCalledTimes(1);
            expect(Storage.setDefaultProxy).toHaveBeenCalledWith('p2');
            expect(Storage.setTargetState).toHaveBeenCalledTimes(1);
            expect(Storage.setTargetState).toHaveBeenCalledWith(ProxyState.CONNECTED);
        });

        // TC-D3d: multi proxy, отмена модалки
        it('TC-D3d: should do nothing when user cancels modal', async () => {
            const proxies = [
                { id: 'p1', name: 'proxy1', host: 'example.com', port: 8080, isDefault: false },
                { id: 'p2', name: 'proxy2', host: 'example.com', port: 8081, isDefault: false }
            ];

            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue(proxies);
            (Storage.getDefaultProxy as jest.Mock).mockResolvedValue(undefined);
            (showSelectDefaultProxyModal as jest.Mock).mockResolvedValue(null);

            await app.handleMainButtonClick();

            expect(Storage.setDefaultProxy).not.toHaveBeenCalled();
            expect(Storage.setTargetState).not.toHaveBeenCalled();
        });

        // TC-D3e: regression: defaultProxy задан
        it('TC-D3e: regression - should skip modal when default proxy is already set', async () => {
            const existingDefaultProxy = 'p1';

            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue([
                { id: 'p1', name: 'proxy1', host: 'example.com', port: 8080, isDefault: false }
            ]);
            (Storage.getDefaultProxy as jest.Mock).mockResolvedValue(existingDefaultProxy);

            await app.handleMainButtonClick();

            expect(showSelectDefaultProxyModal).not.toHaveBeenCalled();
            expect(Storage.setDefaultProxy).not.toHaveBeenCalled();
            expect(Storage.setTargetState).toHaveBeenCalledTimes(1);
            expect(Storage.setTargetState).toHaveBeenCalledWith(ProxyState.CONNECTED);
        });

        // TC-D3f: regression: пустой список прокси
        it('TC-D3f: regression - should show dialog when proxies list is empty', async () => {
            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (Storage.getProxies as jest.Mock).mockResolvedValue([]);
            (showConfirm as jest.Mock).mockResolvedValue(false);

            await app.handleMainButtonClick();

            expect(showConfirm).toHaveBeenCalledWith('noProxiesConfigured');
            expect(Storage.setDefaultProxy).not.toHaveBeenCalled();
            expect(Storage.setTargetState).not.toHaveBeenCalled();
        });
    });

    describe('button click binding', () => {
        it('should call handleMainButtonClick on button click', async () => {
            (Storage.getCurrentState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (ProxyList.hasProxies as jest.Mock).mockReturnValue(true);

            await app.init();
            jest.clearAllMocks();

            const button = document.getElementById(DOMIds.MAIN_BUTTON) as HTMLButtonElement;
            button.click();

            // Wait for async handler
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(Storage.getCurrentState).toHaveBeenCalled();
        });
    });

    describe('storage change subscription', () => {
        it('should update UI on current state change', async () => {
            await app.init();
            
            // Get the callback passed to Storage.onChange before clearing mocks
            const callback = (Storage.onChange as jest.Mock).mock.calls[0][0];
            jest.clearAllMocks();
            
            callback({
                [StorageKeys.CURRENT_STATE]: {
                    newValue: ProxyState.CONNECTED,
                    oldValue: ProxyState.DISCONNECTED
                }
            }, 'local');
            
            expect(UI.updateState).toHaveBeenCalledWith(ProxyState.CONNECTED);
        });

        it('should re-render presets on proxies change', async () => {
            await app.init();
            
            // Get the callback passed to Storage.onChange before clearing mocks
            const callback = (Storage.onChange as jest.Mock).mock.calls[0][0];
            jest.clearAllMocks();
            
            callback({
                [StorageKeys.PROXIES]: {
                    newValue: [],
                    oldValue: []
                }
            }, 'local');
            
            expect(Presets.render).toHaveBeenCalled();
        });

        it('should call ProxyList.refresh when PROXIES key changes', async () => {
            await app.init();

            const callback = (Storage.onChange as jest.Mock).mock.calls[0][0];
            jest.clearAllMocks();

            callback({
                [StorageKeys.PROXIES]: {
                    newValue: [],
                    oldValue: []
                }
            }, 'local');

            expect(ProxyList.refresh).toHaveBeenCalledTimes(1);
        });

        it('ProxyList.refresh should not trigger infinite loop in onChange', async () => {
            await app.init();

            const callback = (Storage.onChange as jest.Mock).mock.calls[0][0];
            jest.clearAllMocks();

            // Вызываем callback один раз — имитируем изменение chrome.storage
            callback({
                [StorageKeys.PROXIES]: {
                    newValue: [],
                    oldValue: []
                }
            }, 'local');

            // ProxyList.refresh вызван ровно один раз — нет бесконечного цикла
            expect(ProxyList.refresh).toHaveBeenCalledTimes(1);
            // Storage.onChange не вызван повторно — callback не регистрирует новый listener
            expect(Storage.onChange).not.toHaveBeenCalled();
        });

        it('should ignore changes from other areas', async () => {
            await app.init();
            
            // Get the callback passed to Storage.onChange before clearing mocks
            const callback = (Storage.onChange as jest.Mock).mock.calls[0][0];
            jest.clearAllMocks();
            
            callback({
                [StorageKeys.CURRENT_STATE]: {
                    newValue: ProxyState.CONNECTED,
                    oldValue: ProxyState.DISCONNECTED
                }
            }, 'sync');
            
            expect(UI.updateState).not.toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should work without main button element', async () => {
            document.body.innerHTML = '';
            
            await expect(app.init()).resolves.not.toThrow();
        });
    });
});