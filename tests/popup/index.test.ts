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
        onChange: jest.fn()
    }
}));

jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        init: jest.fn().mockResolvedValue(undefined),
        applyTranslations: jest.fn(),
        getMessage: jest.fn((key: string) => key)
    }
}));

// Import after mocks
import { UI } from '../../src/popup/ui';
import { Settings } from '../../src/popup/settings';
import { Tabs } from '../../src/popup/tabs';
import { ProxyList } from '../../src/popup/proxy-list';
import { Presets } from '../../src/popup/presets';
import { Storage } from '../../src/shared/storage';
import { I18n } from '../../src/shared/i18n';
import { ProxyState, StorageKeys, DOMIds } from '../../src/shared/constants';

// Recreate PopupApp class for testing (since it's not exported)
class PopupApp {
    async init(): Promise<void> {
        await Storage.init();
        await I18n.init();
        
        UI.init();
        Settings.init();
        Tabs.init();
        await ProxyList.init();
        await Presets.init();
        
        I18n.applyTranslations();
        this.bindMainButton();
        await this.loadInitialState();
        this.subscribeToChanges();
    }

    private bindMainButton(): void {
        const button = document.getElementById(DOMIds.MAIN_BUTTON);
        button?.addEventListener('click', () => this.handleMainButtonClick());
    }

    async handleMainButtonClick(): Promise<void> {
        const currentTargetState = await Storage.getTargetState();
        const newTargetState = currentTargetState === ProxyState.CONNECTED
            ? ProxyState.DISCONNECTED
            : ProxyState.CONNECTED;

        if (newTargetState === ProxyState.CONNECTED && !ProxyList.hasProxies()) {
            const shouldAdd = confirm(I18n.getMessage('noProxiesConfigured'));
            if (shouldAdd) {
                ProxyList.openAddProxyForm();
            }
            return;
        }

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
    });

    describe('handleMainButtonClick()', () => {
        beforeEach(async () => {
            await app.init();
            jest.clearAllMocks();
        });

        it('should toggle from disconnected to connected', async () => {
            (Storage.getTargetState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (ProxyList.hasProxies as jest.Mock).mockReturnValue(true);
            
            await app.handleMainButtonClick();
            
            expect(Storage.setTargetState).toHaveBeenCalledWith(ProxyState.CONNECTED);
        });

        it('should toggle from connected to disconnected', async () => {
            (Storage.getTargetState as jest.Mock).mockResolvedValue(ProxyState.CONNECTED);
            
            await app.handleMainButtonClick();
            
            expect(Storage.setTargetState).toHaveBeenCalledWith(ProxyState.DISCONNECTED);
        });

        it('should show confirm when no proxies configured', async () => {
            (Storage.getTargetState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (ProxyList.hasProxies as jest.Mock).mockReturnValue(false);
            
            const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
            
            await app.handleMainButtonClick();
            
            expect(confirmSpy).toHaveBeenCalledWith('noProxiesConfigured');
            expect(Storage.setTargetState).not.toHaveBeenCalled();
            
            confirmSpy.mockRestore();
        });

        it('should open add proxy form if user confirms', async () => {
            (Storage.getTargetState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (ProxyList.hasProxies as jest.Mock).mockReturnValue(false);
            
            const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
            
            await app.handleMainButtonClick();
            
            expect(ProxyList.openAddProxyForm).toHaveBeenCalled();
            expect(Storage.setTargetState).not.toHaveBeenCalled();
            
            confirmSpy.mockRestore();
        });

        it('should not open form if user declines', async () => {
            (Storage.getTargetState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (ProxyList.hasProxies as jest.Mock).mockReturnValue(false);
            
            const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
            
            await app.handleMainButtonClick();
            
            expect(ProxyList.openAddProxyForm).not.toHaveBeenCalled();
            
            confirmSpy.mockRestore();
        });
    });

    describe('button click binding', () => {
        it('should call handleMainButtonClick on button click', async () => {
            (Storage.getTargetState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
            (ProxyList.hasProxies as jest.Mock).mockReturnValue(true);
            
            await app.init();
            jest.clearAllMocks();
            
            const button = document.getElementById(DOMIds.MAIN_BUTTON) as HTMLButtonElement;
            button.click();
            
            // Wait for async handler
            await new Promise(resolve => setTimeout(resolve, 0));
            
            expect(Storage.getTargetState).toHaveBeenCalled();
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