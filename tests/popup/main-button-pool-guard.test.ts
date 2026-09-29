/**
 * @jest-environment jsdom
 */

// Mock all dependencies of src/popup/index.ts
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

jest.mock('../../src/popup/view-mode', () => ({
    ViewMode: {
        init: jest.fn()
    }
}));

jest.mock('../../src/popup/tour', () => ({
    Tour: {
        maybeStart: jest.fn()
    }
}));

jest.mock('../../src/popup/proxy-list', () => ({
    ProxyList: {
        init: jest.fn().mockResolvedValue(undefined),
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
        getActivePresets: jest.fn().mockResolvedValue([]),
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
import { Storage } from '../../src/shared/storage';
import { I18n } from '../../src/shared/i18n';
import { ProxyState, DOMIds } from '../../src/shared/constants';
import { showConfirm } from '../../src/popup/dialog';
import { showSelectDefaultProxyModal } from '../../src/popup/select-default-proxy-modal';

let moduleLoaded = false;

async function loadIndexModule(): Promise<void> {
    if (moduleLoaded) return;
    document.body.innerHTML = `<button id="${DOMIds.MAIN_BUTTON}">Toggle</button>`;
    // Load the real module which attaches DOMContentLoaded listener
    require('../../src/popup/index');
    // Fire DOMContentLoaded to trigger init()
    document.dispatchEvent(new Event('DOMContentLoaded'));
    // Wait for async init to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    moduleLoaded = true;
}

describe('main button pool guard', () => {
    beforeAll(async () => {
        await loadIndexModule();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Default mocks
        (Storage.getProxies as jest.Mock).mockResolvedValue([]);
        (Storage.getTargetState as jest.Mock).mockResolvedValue(ProxyState.DISCONNECTED);
        (Storage.getActivePresets as jest.Mock).mockResolvedValue([]);
        (Storage.getDefaultProxy as jest.Mock).mockResolvedValue(undefined);
        (Storage.setTargetState as jest.Mock).mockResolvedValue(undefined);
        (showConfirm as jest.Mock).mockResolvedValue(false);
        (showSelectDefaultProxyModal as jest.Mock).mockResolvedValue(null);
    });

    it('zero proxies and active preset with publicPool and stale proxyId: connects without noProxiesConfigured', async () => {
        (Storage.getActivePresets as jest.Mock).mockResolvedValue([
            {
                id: 'preset1',
                name: 'Pool Preset',
                domains: ['example.org'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: 'deleted-proxy',
                publicPool: { protocols: ['socks5'] }
            }
        ]);

        const button = document.getElementById(DOMIds.MAIN_BUTTON) as HTMLButtonElement;
        button.click();

        // Wait for async handler
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(showConfirm).not.toHaveBeenCalled();
        expect(showSelectDefaultProxyModal).not.toHaveBeenCalled();
        expect(Storage.setTargetState).toHaveBeenCalledTimes(1);
        expect(Storage.setTargetState).toHaveBeenCalledWith(ProxyState.CONNECTED);
    });

    it('zero proxies and active presets with proxyId but without publicPool: shows noProxiesConfigured', async () => {
        (Storage.getActivePresets as jest.Mock).mockResolvedValue([
            {
                id: 'preset1',
                name: 'Preset without pool',
                domains: ['example.org'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: 'deleted-proxy'
                // no publicPool field
            },
            {
                id: 'preset2',
                name: 'Preset with null publicPool',
                domains: ['example.org'],
                enabled: true,
                isDefault: false,
                order: 1,
                proxyId: 'deleted-proxy',
                publicPool: null
            }
        ]);

        const button = document.getElementById(DOMIds.MAIN_BUTTON) as HTMLButtonElement;
        button.click();

        // Wait for async handler
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(showConfirm).toHaveBeenCalledTimes(1);
        expect(showConfirm).toHaveBeenCalledWith('noProxiesConfigured', { column: 'proxy' });
        expect(Storage.setTargetState).not.toHaveBeenCalled();
    });
});