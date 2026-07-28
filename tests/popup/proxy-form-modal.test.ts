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

        const flush = async (n = 6): Promise<void> => {
            for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
        };

        it('should not create a duplicate proxy on rapid double-click of Save (check disabled)', async () => {
            const { Storage } = await import('../../src/shared/storage');
            (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(false);

            showProxyForm(null, jest.fn().mockResolvedValue(undefined));
            (document.querySelector('input[name="host"]') as HTMLInputElement).value = '1.2.3.4';
            (document.querySelector('input[name="port"]') as HTMLInputElement).value = '8080';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            // Два быстрых клика подряд — раньше давали два прогона и дубликат прокси
            saveBtn.click();
            saveBtn.click();

            await flush();

            expect(Storage.addProxy).toHaveBeenCalledTimes(1);
        });

        it('should re-enable Save (not stuck on "Checking...") when the proxy check rejects', async () => {
            const { Storage } = await import('../../src/shared/storage');
            (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(true);
            // Reject как при выгруженном service worker ("Could not establish connection")
            (chrome.runtime.sendMessage as jest.Mock).mockRejectedValue(new Error('Could not establish connection'));

            showProxyForm(null, jest.fn().mockResolvedValue(undefined));
            (document.querySelector('input[name="host"]') as HTMLInputElement).value = '1.2.3.4';
            (document.querySelector('input[name="port"]') as HTMLInputElement).value = '8080';

            const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement;
            saveBtn.click();

            await flush();

            expect(saveBtn.disabled).toBe(false);
            expect(saveBtn.classList.contains('btn-checking')).toBe(false);
            expect(Storage.addProxy).not.toHaveBeenCalled();
        });
    });

    describe('showProxyForm() — вставка полной строки прокси в поле Host', () => {
        const pasteIntoHost = (text: string): boolean => {
            const hostInput = document.querySelector('input[name="host"]') as HTMLInputElement;
            const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as any;
            pasteEvent.clipboardData = { getData: () => text };
            return hostInput.dispatchEvent(pasteEvent);
        };

        it('вставка socks5://user:pass@1.2.3.4:1080 раскладывает все поля', () => {
            showProxyForm(null, jest.fn().mockResolvedValue(undefined));

            const notPrevented = pasteIntoHost('socks5://user:pass@1.2.3.4:1080');

            expect(notPrevented).toBe(false);
            expect((document.querySelector('select[name="type"]') as HTMLSelectElement).value).toBe('socks5');
            expect((document.querySelector('input[name="host"]') as HTMLInputElement).value).toBe('1.2.3.4');
            expect((document.querySelector('input[name="port"]') as HTMLInputElement).value).toBe('1080');
            expect((document.querySelector('input[name="hasAuth"]') as HTMLInputElement).checked).toBe(true);
            expect((document.querySelector('.auth-fields') as HTMLElement).style.display).toBe('block');
            expect((document.querySelector('input[name="username"]') as HTMLInputElement).value).toBe('user');
            expect((document.querySelector('input[name="password"]') as HTMLInputElement).value).toBe('pass');
        });

        it('вставка ip:port:user:pass раскладывает хост, порт и креды', () => {
            showProxyForm(null, jest.fn().mockResolvedValue(undefined));

            pasteIntoHost('5.6.7.8:3128:admin:secret');

            expect((document.querySelector('input[name="host"]') as HTMLInputElement).value).toBe('5.6.7.8');
            expect((document.querySelector('input[name="port"]') as HTMLInputElement).value).toBe('3128');
            expect((document.querySelector('input[name="username"]') as HTMLInputElement).value).toBe('admin');
            expect((document.querySelector('input[name="password"]') as HTMLInputElement).value).toBe('secret');
        });

        it('вставка ip:port заполняет хост и порт, не трогая авторизацию', () => {
            showProxyForm(null, jest.fn().mockResolvedValue(undefined));

            pasteIntoHost('1.2.3.4:8080');

            expect((document.querySelector('input[name="host"]') as HTMLInputElement).value).toBe('1.2.3.4');
            expect((document.querySelector('input[name="port"]') as HTMLInputElement).value).toBe('8080');
            expect((document.querySelector('input[name="hasAuth"]') as HTMLInputElement).checked).toBe(false);
            expect((document.querySelector('.auth-fields') as HTMLElement).style.display).toBe('none');
        });

        it('вставка простого хоста не перехватывается (обычная вставка)', () => {
            showProxyForm(null, jest.fn().mockResolvedValue(undefined));

            const notPrevented = pasteIntoHost('proxy.example.com');

            expect(notPrevented).toBe(true);
            expect((document.querySelector('input[name="port"]') as HTMLInputElement).value).toBe('');
        });
    });
});
