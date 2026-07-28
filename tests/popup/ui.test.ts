import { mockHelpers } from '../setup';

jest.mock('../../src/shared/remote-config', () => ({
    RemoteConfig: { referralLink: 'https://example.com/ref' }
}));
jest.mock('../../src/shared/analytics', () => ({
    trackEvent: jest.fn().mockResolvedValue(undefined),
    buildAffiliateUrl: jest.fn((url: string, placement: string) => `${url}?utm_source=${placement}`)
}));
jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        getMessage: jest.fn((key: string) => {
            const translations: Record<string, string> = {
                'ariaProxyOn': 'Proxy is on',
                'ariaProxyOff': 'Proxy is off',
                'ariaProxyConnecting': 'Proxy is connecting',
                'ariaProxyError': 'Proxy has an error'
            };
            return translations[key] || key;
        })
    }
}));

// Динамический импорт для правильного порядка инициализации
let UI: typeof import('../../src/popup/ui').UI;

describe('ui.ts - UIService', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();

        // Ensure chrome.tabs is mocked
        (global as any).chrome.tabs = { create: jest.fn() };

        // Создаём тестовый DOM с SVG кнопкой-щитом
        document.body.innerHTML = `
            <button id="main-button" class="main-button disconnected">
                <svg class="shield-icon" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
                    <path class="shield-bg" d="M50 0 L95 15 L95 55 C95 85 50 115 50 115 C50 115 5 85 5 55 L5 15 Z"/>
                    <path class="pulse-line" d="M20 60 L35 60 L42 40 L50 80 L58 40 L65 60 L80 60"/>
                    <line class="flat-line" x1="20" y1="60" x2="80" y2="60"/>
                </svg>
            </button>
        `;

        const uiModule = await import('../../src/popup/ui');
        UI = uiModule.UI;
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('init()', () => {
        it('should initialize UI elements', () => {
            UI.init();

            // Проверяем, что UI инициализировался без ошибок
            expect(document.getElementById('main-button')).not.toBeNull();
        });

        it('should find button element by correct ID', () => {
            const button = document.getElementById('main-button');

            expect(button).toBeInstanceOf(HTMLElement);
        });

        it('should have SVG shield icon inside button', () => {
            const button = document.getElementById('main-button');
            const shieldIcon = button?.querySelector('.shield-icon');

            expect(shieldIcon).not.toBeNull();
        });
    });

    describe('updateState()', () => {
        beforeEach(() => {
            UI.init();
        });

        it('should update button to connected state', () => {
            UI.updateState('connected');

            const button = document.getElementById('main-button');
            expect(button?.classList.contains('connected')).toBe(true);
            expect(button?.classList.contains('disconnected')).toBe(false);
            expect(button?.classList.contains('connecting')).toBe(false);
            expect(button?.classList.contains('error')).toBe(false);
        });

        it('should update button to disconnected state', () => {
            UI.updateState('disconnected');

            const button = document.getElementById('main-button');
            expect(button?.classList.contains('disconnected')).toBe(true);
            expect(button?.classList.contains('connected')).toBe(false);
        });

        it('should update button to connecting state', () => {
            UI.updateState('connecting');

            const button = document.getElementById('main-button');
            expect(button?.classList.contains('connecting')).toBe(true);
            expect(button?.classList.contains('connected')).toBe(false);
        });

        it('should update button to error state', () => {
            UI.updateState('error');

            const button = document.getElementById('main-button');
            expect(button?.classList.contains('error')).toBe(true);
            expect(button?.classList.contains('connected')).toBe(false);
        });

        it('should remove previous state class when changing states', () => {
            UI.updateState('connected');
            const button = document.getElementById('main-button');
            expect(button?.classList.contains('connected')).toBe(true);

            UI.updateState('disconnected');
            expect(button?.classList.contains('connected')).toBe(false);
            expect(button?.classList.contains('disconnected')).toBe(true);
        });
    });

    describe('updateButtonState() - aria-pressed and aria-label', () => {
        beforeEach(() => {
            UI.init();
        });

        it('should set aria-pressed="true" and correct aria-label when state is CONNECTED', () => {
            UI.updateState('connected');

            const button = document.getElementById('main-button');
            expect(button?.getAttribute('aria-pressed')).toBe('true');
            expect(button?.getAttribute('aria-label')).toBe('Proxy is on');
        });

        it('should set aria-pressed="false" and correct aria-label when state is DISCONNECTED', () => {
            UI.updateState('disconnected');

            const button = document.getElementById('main-button');
            expect(button?.getAttribute('aria-pressed')).toBe('false');
            expect(button?.getAttribute('aria-label')).toBe('Proxy is off');
        });

        it('should set aria-pressed="false" and correct aria-label when state is CONNECTING', () => {
            UI.updateState('connecting');

            const button = document.getElementById('main-button');
            expect(button?.getAttribute('aria-pressed')).toBe('false');
            expect(button?.getAttribute('aria-label')).toBe('Proxy is connecting');
        });

        it('should set aria-pressed="false" and correct aria-label when state is ERROR', () => {
            UI.updateState('error');

            const button = document.getElementById('main-button');
            expect(button?.getAttribute('aria-pressed')).toBe('false');
            expect(button?.getAttribute('aria-label')).toBe('Proxy has an error');
        });
    });

    describe('Edge cases', () => {
        it('should handle missing DOM elements gracefully', async () => {
            // Очищаем DOM
            document.body.innerHTML = '';

            // Переинициализируем UI с пустым DOM
            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UIService = uiModule.UI;
            UIService.init();

            // Не должно бросить ошибку
            expect(() => UIService.updateState('connected')).not.toThrow();
        });

        it('should handle rapid state changes', () => {
            UI.init();

            UI.updateState('disconnected');
            UI.updateState('connecting');
            UI.updateState('connected');
            UI.updateState('error');
            UI.updateState('disconnected');

            const button = document.getElementById('main-button');
            expect(button?.classList.contains('disconnected')).toBe(true);
            // main-button класс + состояние
            expect(button?.classList.contains('main-button')).toBe(true);
        });
    });

    describe('initAffiliateLinkHandlers()', () => {
        it('should attach click handlers to referral links inside .public-proxies-warning', async () => {
            // Add the affiliate link container to the DOM
            document.body.innerHTML += `
                <div class="public-proxies-warning">
                    <a class="referral-link" href="#">Get VPN</a>
                    <a class="referral-link" href="#">Another link</a>
                </div>
            `;

            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UILocal = uiModule.UI;
            UILocal.init();

            const links = document.querySelectorAll('.referral-link');
            expect(links.length).toBe(2);

            // Simulate a click on the first link
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
            jest.spyOn(clickEvent, 'preventDefault');
            links[0].dispatchEvent(clickEvent);

            expect(clickEvent.preventDefault).toHaveBeenCalled();
        });

        it('should do nothing when .public-proxies-warning container is absent', () => {
            // DOM has no .public-proxies-warning — init should not throw
            expect(() => UI.init()).not.toThrow();
        });
    });

    describe('handleAffiliateLinkClick()', () => {
        it('should open tab with affiliate URL when referral link is valid', async () => {
            document.body.innerHTML += `
                <div class="public-proxies-warning">
                    <a class="referral-link" href="#">Get VPN</a>
                </div>
            `;

            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UILocal = uiModule.UI;
            UILocal.init();

            const { trackEvent, buildAffiliateUrl } = require('../../src/shared/analytics');

            const link = document.querySelector('.referral-link') as HTMLAnchorElement;
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
            link.dispatchEvent(clickEvent);

            // Wait for async handler to complete
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(buildAffiliateUrl).toHaveBeenCalledWith('https://example.com/ref', 'popup');
            expect(trackEvent).toHaveBeenCalledWith('affiliate_link_clicked', {
                provider: 'example',
                placement: 'popup',
                link_url: 'https://example.com/ref?utm_source=popup'
            });
            expect((global as any).chrome.tabs.create).toHaveBeenCalledWith({
                url: 'https://example.com/ref?utm_source=popup'
            });
        });

        it('should not open tab when referral link is "#"', async () => {
            // Mock RemoteConfig with '#' link
            jest.doMock('../../src/shared/remote-config', () => ({
                RemoteConfig: { referralLink: '#' }
            }));

            document.body.innerHTML += `
                <div class="public-proxies-warning">
                    <a class="referral-link" href="#">Get VPN</a>
                </div>
            `;

            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UILocal = uiModule.UI;
            UILocal.init();

            const link = document.querySelector('.referral-link') as HTMLAnchorElement;
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
            link.dispatchEvent(clickEvent);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect((global as any).chrome.tabs.create).not.toHaveBeenCalled();
        });

        it('should not open tab when referral link is empty', async () => {
            jest.doMock('../../src/shared/remote-config', () => ({
                RemoteConfig: { referralLink: '' }
            }));

            document.body.innerHTML += `
                <div class="public-proxies-warning">
                    <a class="referral-link" href="#">Get VPN</a>
                </div>
            `;

            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UILocal = uiModule.UI;
            UILocal.init();

            const link = document.querySelector('.referral-link') as HTMLAnchorElement;
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
            link.dispatchEvent(clickEvent);

            await new Promise(resolve => setTimeout(resolve, 0));

            expect((global as any).chrome.tabs.create).not.toHaveBeenCalled();
        });
    });

    describe('updateErrorBanner()', () => {
        beforeEach(() => {
            // Add error banner DOM elements
            document.body.innerHTML += `
                <div id="error-banner" style="display: none">
                    <span id="error-proxy-label"></span>
                    <button id="error-banner-close" class="warning-close">×</button>
                </div>
            `;
        });

        it('should show error banner with proxy label when state is error', async () => {
            mockHelpers.setLocalStorageData({ errorProxy: 'US-Server-1' });

            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UILocal = uiModule.UI;
            UILocal.init();

            UILocal.updateState('error');

            const banner = document.getElementById('error-banner');
            const label = document.getElementById('error-proxy-label');
            expect(banner?.style.display).toBe('flex');
            expect(label?.textContent).toBe('(US-Server-1)');
        });

        it('should show error banner with empty label when no error proxy in storage', async () => {
            // No errorProxy set in storage
            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UILocal = uiModule.UI;
            UILocal.init();

            UILocal.updateState('error');

            const banner = document.getElementById('error-banner');
            const label = document.getElementById('error-proxy-label');
            expect(banner?.style.display).toBe('flex');
            expect(label?.textContent).toBe('');
        });

        it('should hide error banner when state is not error', async () => {
            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UILocal = uiModule.UI;
            UILocal.init();

            // First set error to show banner
            UILocal.updateState('error');
            const banner = document.getElementById('error-banner');
            expect(banner?.style.display).toBe('flex');

            // Now set connected — banner should hide
            UILocal.updateState('connected');
            expect(banner?.style.display).toBe('none');
        });

        it('should hide error banner when state is disconnected', async () => {
            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UILocal = uiModule.UI;
            UILocal.init();

            UILocal.updateState('error');
            const banner = document.getElementById('error-banner');
            expect(banner?.style.display).toBe('flex');

            UILocal.updateState('disconnected');
            expect(banner?.style.display).toBe('none');
        });

        it('клик по крестику скрывает баннер, и он не показывается снова, пока ошибка не повторится', async () => {
            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UILocal = uiModule.UI;
            UILocal.init();

            UILocal.updateState('error');
            const banner = document.getElementById('error-banner');
            expect(banner?.style.display).toBe('flex');

            (document.getElementById('error-banner-close') as HTMLButtonElement).click();
            expect(banner?.style.display).toBe('none');

            // Пока состояние ERROR не сменилось, баннер остаётся скрытым
            UILocal.updateState('error');
            expect(banner?.style.display).toBe('none');
        });

        it('после выхода из ERROR новая ошибка снова показывает баннер', async () => {
            jest.resetModules();
            const uiModule = await import('../../src/popup/ui');
            const UILocal = uiModule.UI;
            UILocal.init();

            UILocal.updateState('error');
            (document.getElementById('error-banner-close') as HTMLButtonElement).click();

            UILocal.updateState('connected');
            UILocal.updateState('error');

            const banner = document.getElementById('error-banner');
            expect(banner?.style.display).toBe('flex');
        });
    });
});
