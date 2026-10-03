import { mockHelpers } from '../setup';
import * as fs from 'fs';
import * as path from 'path';

// Динамический импорт для правильного порядка инициализации
let IconManager: typeof import('../../src/background/icon-manager').IconManager;

// Тексты подсказок сверяются с настоящими каталогами, а не с ключом:
// ключ вернул бы и сломанный I18n, и chrome.i18n.getMessage из мока.
const readCatalog = (lang: string): Record<string, { message: string }> =>
    JSON.parse(fs.readFileSync(path.join(__dirname, '../../_locales', lang, 'messages.json'), 'utf-8'));

const ruCatalog = readCatalog('ru');
const enCatalog = readCatalog('en');

// setup.ts мокает fetch пустышкой; I18n читает каталог через fetch(chrome.runtime.getURL(...))
const mockLocaleFetch = (): void => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
        const match = /_locales\/([a-z]{2})\/messages\.json/.exec(url);
        if (!match) return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        return Promise.resolve({ json: () => Promise.resolve(readCatalog(match[1])) });
    });
};

// Тот же экземпляр, что видит IconManager: один реестр модулей после jest.resetModules()
const loadI18n = async () => (await import('../../src/shared/i18n')).I18n;

describe('icon-manager.ts - IconManagerService', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        
        const iconManagerModule = await import('../../src/background/icon-manager');
        IconManager = iconManagerModule.IconManager;
    });

    describe('getIconPath()', () => {
        it('should return enabled icon path when state is connected', () => {
            const path = IconManager.getIconPath('connected', 'dark');
            
            expect(path).toBe('icons/icon128.png');
        });

        it('should return enabled icon path regardless of theme when connected', () => {
            const pathDark = IconManager.getIconPath('connected', 'dark');
            const pathLight = IconManager.getIconPath('connected', 'light');
            
            expect(pathDark).toBe('icons/icon128.png');
            expect(pathLight).toBe('icons/icon128.png');
        });

        it('should return dark disabled icon when state is disconnected and theme is dark', () => {
            const path = IconManager.getIconPath('disconnected', 'dark');
            
            expect(path).toBe('icons/icon128-disabled-dark.png');
        });

        it('should return light disabled icon when state is disconnected and theme is light', () => {
            const path = IconManager.getIconPath('disconnected', 'light');
            
            expect(path).toBe('icons/icon128-disabled-light.png');
        });

        it('should return connecting icon when state is connecting and theme is dark', () => {
            const path = IconManager.getIconPath('connecting', 'dark');

            expect(path).toBe('icons/icon128-connecting.png');
        });

        it('should return connecting icon when state is connecting and theme is light', () => {
            const path = IconManager.getIconPath('connecting', 'light');

            expect(path).toBe('icons/icon128-connecting.png');
        });

        it('should return dark disabled icon when state is error and theme is dark', () => {
            const path = IconManager.getIconPath('error', 'dark');
            
            expect(path).toBe('icons/icon128-disabled-dark.png');
        });

        it('should return light disabled icon when state is error and theme is light', () => {
            const path = IconManager.getIconPath('error', 'light');
            
            expect(path).toBe('icons/icon128-disabled-light.png');
        });
    });

    describe('update()', () => {
        it('should update icon based on current state and theme', async () => {
            mockHelpers.setLocalStorageData({
                currentState: 'connected',
                theme: 'dark',
            });

            await IconManager.update();

            expect(chrome.action.setIcon).toHaveBeenCalledWith(
                {
                    path: {
                        '16': '/icons/icon16.png',
                        '48': '/icons/icon48.png',
                        '128': '/icons/icon128.png',
                    },
                },
                expect.any(Function)
            );
        });

        it('should update icon to disabled dark when disconnected with dark theme', async () => {
            mockHelpers.setLocalStorageData({
                currentState: 'disconnected',
                theme: 'dark',
            });

            await IconManager.update();

            expect(chrome.action.setIcon).toHaveBeenCalledWith(
                {
                    path: {
                        '128': '/icons/icon128-disabled-dark.png',
                    },
                },
                expect.any(Function)
            );
        });

        it('should update icon to disabled light when disconnected with light theme', async () => {
            mockHelpers.setLocalStorageData({
                currentState: 'disconnected',
                theme: 'light',
            });

            await IconManager.update();

            expect(chrome.action.setIcon).toHaveBeenCalledWith(
                {
                    path: {
                        '128': '/icons/icon128-disabled-light.png',
                    },
                },
                expect.any(Function)
            );
        });

        it('should use light theme as default', async () => {
            mockHelpers.setLocalStorageData({
                currentState: 'disconnected',
                // theme not set - default is 'light'
            });

            await IconManager.update();

            expect(chrome.action.setIcon).toHaveBeenCalledWith(
                {
                    path: {
                        '128': '/icons/icon128-disabled-light.png',
                    },
                },
                expect.any(Function)
            );
        });

        it('should use disconnected state as default', async () => {
            mockHelpers.setLocalStorageData({
                theme: 'dark',
                // currentState not set
            });

            await IconManager.update();

            expect(chrome.action.setIcon).toHaveBeenCalledWith(
                {
                    path: {
                        '128': '/icons/icon128-disabled-dark.png',
                    },
                },
                expect.any(Function)
            );
        });
    });

    describe('setIcon()', () => {
        it('should set icon with enabled path', () => {
            IconManager.setIcon('icons/icon128.png');

            expect(chrome.action.setIcon).toHaveBeenCalledWith(
                {
                    path: {
                        '16': '/icons/icon16.png',
                        '48': '/icons/icon48.png',
                        '128': '/icons/icon128.png',
                    },
                },
                expect.any(Function)
            );
        });

        it('should set icon with disabled path', () => {
            IconManager.setIcon('icons/icon128-disabled-dark.png');

            expect(chrome.action.setIcon).toHaveBeenCalledWith(
                {
                    path: {
                        '128': '/icons/icon128-disabled-dark.png',
                    },
                },
                expect.any(Function)
            );
        });
    });

    describe('setTabProxyBadge()', () => {
        beforeEach(() => {
            (chrome.action.setBadgeText as jest.Mock).mockReturnValue(Promise.resolve());
            (chrome.action.setBadgeBackgroundColor as jest.Mock).mockReturnValue(Promise.resolve());
            (chrome.action.setTitle as jest.Mock).mockReturnValue(Promise.resolve());
        });

        const ownRoute = (server: unknown, viaProxyAll = false) => ({ kind: 'own', server, viaProxyAll });
        const poolRoute = (poolSize: number = 3) => ({ kind: 'pool', server: null, poolSize, viaProxyAll: false });

        describe('setTabProxyBadge pool', () => {
            it('pool route poolSize>0 → badge 🌐 color #845EF7', () => {
                const route = poolRoute(3);

                IconManager.setTabProxyBadge(101, route);

                expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 101, text: '🌐' });
                expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 101, color: '#845EF7' });
            });

            it('pool route poolSize=0 → badge ! color #FF6969', () => {
                const route = poolRoute(0);

                IconManager.setTabProxyBadge(102, route);

                expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 102, text: '!' });
                expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 102, color: '#FF6969' });
            });

            it('pool route with isError=true → badge stays 🌐 color #845EF7', () => {
                const route = poolRoute(3);

                IconManager.setTabProxyBadge(103, route, true);

                expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 103, text: '🌐' });
                expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 103, color: '#845EF7' });
            });

            it('null route → clears badge', () => {
                IconManager.setTabProxyBadge(104, null);

                expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 104, text: '' });
                expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
            });

            it('own route → old logic unchanged', () => {
                const route = ownRoute({ name: '🇺🇸 US Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const });

                IconManager.setTabProxyBadge(105, route);

                expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 105, text: '🇺🇸' });
                expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 105, color: '#4CAF50' });
            });
        });

        describe('geo-block badge', () => {
            const geoBlockedRoute = () => ownRoute({ name: '🇺🇸 US Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const });

            beforeEach(async () => {
                mockLocaleFetch();
                mockHelpers.setLocalStorageData({ language: 'en' });
                await (await loadI18n()).init();
            });

            it('geo-block on own route → badge ⛔ color #FF6969 title geoBlockedTitle', () => {
                IconManager.setTabProxyBadge(111, geoBlockedRoute(), false, true);

                expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 111, text: '⛔' });
                expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 111, color: '#FF6969' });
                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 111, title: enCatalog.geoBlockedTitle.message });
            });

            it('geo-block on pool route → badge ⛔ color #FF6969 title geoBlockedTitle', () => {
                const route = poolRoute(3);

                IconManager.setTabProxyBadge(112, route, false, true);

                expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 112, text: '⛔' });
                expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 112, color: '#FF6969' });
                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 112, title: enCatalog.geoBlockedTitle.message });
            });

            it('geo-block on ALL route → badge ⛔ color #FF6969 title geoBlockedTitle', () => {
                const route = ownRoute({ name: '🇺🇸 US Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const }, true);

                IconManager.setTabProxyBadge(113, route, false, true);

                expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 113, text: '⛔' });
                expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 113, color: '#FF6969' });
                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 113, title: enCatalog.geoBlockedTitle.message });
            });

            it('without geo-block on own route → normal badge', () => {
                IconManager.setTabProxyBadge(114, geoBlockedRoute(), false, false);

                expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 114, text: '🇺🇸' });
                expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 114, color: '#4CAF50' });
                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 114, title: enCatalog.extensionName.message });
            });

            it('without geo-block on pool route → normal badge', () => {
                const route = poolRoute(3);

                IconManager.setTabProxyBadge(115, route, false, false);

                expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 115, text: '🌐' });
                expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 115, color: '#845EF7' });
                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 115, title: enCatalog.extensionName.message });
            });

            it('geo-block cleared → restores standard title', () => {
                const route = ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const });

                IconManager.setTabProxyBadge(116, route, false, true);
                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 116, title: enCatalog.geoBlockedTitle.message });

                (chrome.action.setTitle as jest.Mock).mockClear();
                IconManager.setTabProxyBadge(116, route, false, false);

                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 116, title: enCatalog.extensionName.message });
            });
        });

        describe('tooltip language', () => {
            // Язык браузера в моке — en (tests/__mocks__/chrome.ts): подсказка на языке
            // настроек, а не браузера, различима только при несовпадении этих языков.
            beforeEach(() => {
                (chrome.i18n.getUILanguage as jest.Mock).mockReturnValue('en');
            });

            it('tooltip language: ru in storage → geo-block tooltip is the ru catalog text', async () => {
                mockLocaleFetch();
                mockHelpers.setLocalStorageData({ language: 'ru' });
                await (await loadI18n()).init();

                IconManager.setTabProxyBadge(201, ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const }), false, true);

                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 201, title: ruCatalog.geoBlockedTitle.message });
            });

            it('tooltip language: ru in storage → standard tooltip is the ru catalog text', async () => {
                mockLocaleFetch();
                mockHelpers.setLocalStorageData({ language: 'ru' });
                await (await loadI18n()).init();

                IconManager.setTabProxyBadge(202, ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const }), false, false);

                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 202, title: ruCatalog.extensionName.message });
            });

            it('tooltip language: switch ru → en in storage without restart → next geo-block tooltip is the en catalog text', async () => {
                mockLocaleFetch();
                mockHelpers.setLocalStorageData({ language: 'ru' });
                const I18n = await loadI18n();
                await I18n.init();

                IconManager.setTabProxyBadge(203, ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const }), false, true);
                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 203, title: ruCatalog.geoBlockedTitle.message });

                // Смена языка в настройках: background перечитывает каталог (Storage.onChange → I18n.init)
                mockHelpers.setLocalStorageData({ language: 'en' });
                await I18n.init();
                (chrome.action.setTitle as jest.Mock).mockClear();

                IconManager.setTabProxyBadge(204, ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const }), false, true);

                expect(chrome.action.setTitle).toHaveBeenCalledWith({ tabId: 204, title: enCatalog.geoBlockedTitle.message });
                expect(enCatalog.geoBlockedTitle.message).not.toBe(ruCatalog.geoBlockedTitle.message);
            });
        });

        it('should set badge with flag emoji when proxy name contains a flag', () => {
            const route = ownRoute({ name: '🇺🇸 US Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const });

            IconManager.setTabProxyBadge(1, route);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: '🇺🇸' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 1, color: '#4CAF50' });
        });

        it('should set badge with checkmark when proxy name has no flag', () => {
            const route = ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const });

            IconManager.setTabProxyBadge(2, route);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 2, text: '✓' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 2, color: '#4CAF50' });
        });

        it('should clear badge when route is null', () => {
            IconManager.setTabProxyBadge(3, null);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 3, text: '' });
            expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
        });

        it('should set badge text to "!" and color to red when isError is true', () => {
            const route = ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const });

            IconManager.setTabProxyBadge(4, route, true);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 4, text: '!' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 4, color: '#FF6969' });
        });

        it('should use proxy custom color as badge background', () => {
            const route = ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const, color: '#FF00FF' });

            IconManager.setTabProxyBadge(5, route);

            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 5, color: '#FF00FF' });
        });

        it('should return checkmark when proxy has no name', () => {
            const route = ownRoute({ host: '1.2.3.4', port: 8080, scheme: 'http' as const });

            IconManager.setTabProxyBadge(6, route);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 6, text: '✓' });
        });

        it('should set badge text to "ALL" when tab is routed via proxy-all mode', () => {
            const route = ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const }, true);

            IconManager.setTabProxyBadge(7, route);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: 'ALL' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 7, color: '#4CAF50' });
        });

        it('should prefer "ALL" over flag emoji in proxy-all mode', () => {
            const route = ownRoute({ name: '🇺🇸 US Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const }, true);

            IconManager.setTabProxyBadge(8, route);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 8, text: 'ALL' });
        });

        it('should keep error badge "!" in proxy-all mode', () => {
            const route = ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const }, true);

            IconManager.setTabProxyBadge(9, route, true);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 9, text: '!' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 9, color: '#FF6969' });
        });

        it('should use proxy custom color for "ALL" badge background', () => {
            const route = ownRoute({ name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const, color: '#FF00FF' }, true);

            IconManager.setTabProxyBadge(10, route);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 10, text: 'ALL' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 10, color: '#FF00FF' });
        });
    });

    describe('Error handling', () => {
        it('should handle chrome.action.setIcon error', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            mockHelpers.setLastError('Icon not found');
            mockHelpers.setLocalStorageData({
                currentState: 'connected',
                theme: 'dark',
            });

            await IconManager.update();

            // Триггерим callback с ошибкой
            const setIconCall = (chrome.action.setIcon as jest.Mock).mock.calls[0];
            const callback = setIconCall[1];
            callback();

            expect(consoleSpy).toHaveBeenCalledWith(
                'IconManager: Failed to set icon:',
                'Icon not found'
            );

            consoleSpy.mockRestore();
        });
    });
});