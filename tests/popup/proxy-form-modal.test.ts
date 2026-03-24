/**
 * @jest-environment jsdom
 */

import { mockHelpers } from '../setup';

jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        getMessage: jest.fn((key: string) => key),
        applyTranslations: jest.fn(),
    },
}));

jest.mock('../../src/shared/analytics', () => ({
    trackEvent: jest.fn().mockResolvedValue(undefined),
    buildAffiliateUrl: jest.fn((url: string, placement: string) => `${url}?utm_source=${placement}`),
}));

jest.mock('../../src/shared/remote-config', () => ({
    RemoteConfig: { referralLink: 'https://example.com/ref' },
}));

jest.mock('../../src/popup/dialog', () => ({
    showConfirm: jest.fn(() => Promise.resolve(true)),
    showAlert: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/shared/storage', () => ({
    Storage: {
        getProxyCheckEnabled: jest.fn().mockResolvedValue(false),
        getProxies: jest.fn().mockResolvedValue([]),
        addProxy: jest.fn().mockResolvedValue(undefined),
        updateProxy: jest.fn().mockResolvedValue(undefined),
        reorderPresets: jest.fn().mockResolvedValue(undefined),
    },
}));

import { showConfirm } from '../../src/popup/dialog';
import { trackEvent } from '../../src/shared/analytics';

let checkProxyBeforeAdd: typeof import('../../src/popup/proxy-form-modal').checkProxyBeforeAdd;
let showProxyForm: typeof import('../../src/popup/proxy-form-modal').showProxyForm;

describe('proxy-form-modal.ts', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.clearAllMocks();

        (chrome.runtime as any).sendMessage = jest.fn();

        const mod = await import('../../src/popup/proxy-form-modal');
        checkProxyBeforeAdd = mod.checkProxyBeforeAdd;
        showProxyForm = mod.showProxyForm;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('checkProxyBeforeAdd()', () => {
        it('should return true when proxy check returns ok', async () => {
            (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue('ok');

            const result = await checkProxyBeforeAdd('http', 'proxy.com', 8080);

            expect(result).toBe(true);
            expect(trackEvent).toHaveBeenCalledWith('proxy_test_success', expect.any(Object));
        });

        it('should show confirm dialog when proxy check fails', async () => {
            (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue('timeout');
            (showConfirm as jest.Mock).mockResolvedValue(false);

            const result = await checkProxyBeforeAdd('http', 'proxy.com', 8080);

            expect(result).toBe(false);
            expect(trackEvent).toHaveBeenCalledWith('proxy_test_failure', expect.any(Object));
            expect(showConfirm).toHaveBeenCalled();
        });

        it('should return true if user confirms after failed check', async () => {
            (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue('connection_refused');
            (showConfirm as jest.Mock).mockResolvedValue(true);

            const result = await checkProxyBeforeAdd('socks5', 'socks.com', 1080, 'user', 'pass');

            expect(result).toBe(true);
        });

        it('should pass proxy data to runtime message', async () => {
            (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue('ok');

            await checkProxyBeforeAdd('socks5', 'host.com', 1080, 'user', 'pass');

            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
                action: 'checkProxy',
                proxy: { type: 'socks5', host: 'host.com', port: 1080, username: 'user', password: 'pass' },
            });
        });
    });

    describe('showProxyForm()', () => {
        it('should render add form when proxy is null', () => {
            showProxyForm(null, jest.fn().mockResolvedValue(undefined));

            const modal = document.querySelector('.proxy-form-modal');
            expect(modal).not.toBeNull();

            const form = document.querySelector('.proxy-form');
            expect(form).not.toBeNull();
        });

        it('should render edit form with proxy data', () => {
            const proxy = {
                id: 'p1',
                name: 'My Proxy',
                type: 'socks5' as const,
                host: '1.2.3.4',
                port: 1080,
                username: 'user',
                password: 'pass',
                isDefault: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            showProxyForm(proxy, jest.fn().mockResolvedValue(undefined));

            const modal = document.querySelector('.proxy-form-modal');
            expect(modal).not.toBeNull();

            const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
            expect(nameInput.value).toBe('My Proxy');

            const hostInput = document.querySelector('input[name="host"]') as HTMLInputElement;
            expect(hostInput.value).toBe('1.2.3.4');

            const portInput = document.querySelector('input[name="port"]') as HTMLInputElement;
            expect(portInput.value).toBe('1080');
        });

        it('should show auth fields when proxy has credentials', () => {
            const proxy = {
                id: 'p1',
                name: 'Auth Proxy',
                type: 'http' as const,
                host: '1.2.3.4',
                port: 8080,
                username: 'user',
                password: 'pass',
                isDefault: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            showProxyForm(proxy, jest.fn().mockResolvedValue(undefined));

            const authFields = document.querySelector('.auth-fields') as HTMLElement;
            expect(authFields.style.display).toBe('block');
        });

        it('should toggle auth fields on checkbox change', () => {
            showProxyForm(null, jest.fn().mockResolvedValue(undefined));

            const authCheckbox = document.querySelector('input[name="hasAuth"]') as HTMLInputElement;
            const authFields = document.querySelector('.auth-fields') as HTMLElement;

            expect(authFields.style.display).toBe('none');

            authCheckbox.checked = true;
            authCheckbox.dispatchEvent(new Event('change'));
            expect(authFields.style.display).toBe('block');

            authCheckbox.checked = false;
            authCheckbox.dispatchEvent(new Event('change'));
            expect(authFields.style.display).toBe('none');
        });

        it('should render color picker with PROXY_COLORS swatches', () => {
            showProxyForm(null, jest.fn().mockResolvedValue(undefined));

            const swatches = document.querySelectorAll('.color-swatch');
            // 8 colors + 1 "none" swatch
            expect(swatches.length).toBe(9);
        });

        it('should select color swatch on click', () => {
            showProxyForm(null, jest.fn().mockResolvedValue(undefined));

            const swatches = document.querySelectorAll('.color-swatch');
            const secondSwatch = swatches[1] as HTMLElement;
            secondSwatch.click();

            expect(secondSwatch.classList.contains('selected')).toBe(true);
            expect(swatches[0].classList.contains('selected')).toBe(false);
        });

        it('should close modal on cancel', () => {
            showProxyForm(null, jest.fn().mockResolvedValue(undefined));

            const cancelBtn = document.querySelector('.modal-cancel') as HTMLButtonElement;
            cancelBtn.click();

            expect(document.querySelector('.modal-overlay')).toBeNull();
        });
    });
});
