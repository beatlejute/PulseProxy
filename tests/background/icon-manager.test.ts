import { mockHelpers } from '../setup';

// Динамический импорт для правильного порядка инициализации
let IconManager: typeof import('../../src/background/icon-manager').IconManager;

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
        });

        it('should set badge with flag emoji when proxy name contains a flag', () => {
            const proxy = { name: '🇺🇸 US Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const };

            IconManager.setTabProxyBadge(1, proxy);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: '🇺🇸' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 1, color: '#4CAF50' });
        });

        it('should set badge with checkmark when proxy name has no flag', () => {
            const proxy = { name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const };

            IconManager.setTabProxyBadge(2, proxy);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 2, text: '✓' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 2, color: '#4CAF50' });
        });

        it('should clear badge when proxy is null', () => {
            IconManager.setTabProxyBadge(3, null);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 3, text: '' });
            expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
        });

        it('should set badge text to "!" and color to red when isError is true', () => {
            const proxy = { name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const };

            IconManager.setTabProxyBadge(4, proxy, true);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 4, text: '!' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 4, color: '#FF6969' });
        });

        it('should use proxy custom color as badge background', () => {
            const proxy = { name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const, color: '#FF00FF' };

            IconManager.setTabProxyBadge(5, proxy);

            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 5, color: '#FF00FF' });
        });

        it('should return checkmark when proxy has no name', () => {
            const proxy = { host: '1.2.3.4', port: 8080, scheme: 'http' as const } as any;

            IconManager.setTabProxyBadge(6, proxy);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 6, text: '✓' });
        });

        it('should set badge text to "ALL" when tab is routed via proxy-all mode', () => {
            const proxy = { name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const };

            IconManager.setTabProxyBadge(7, proxy, false, true);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: 'ALL' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 7, color: '#4CAF50' });
        });

        it('should prefer "ALL" over flag emoji in proxy-all mode', () => {
            const proxy = { name: '🇺🇸 US Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const };

            IconManager.setTabProxyBadge(8, proxy, false, true);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 8, text: 'ALL' });
        });

        it('should keep error badge "!" in proxy-all mode', () => {
            const proxy = { name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const };

            IconManager.setTabProxyBadge(9, proxy, true, true);

            expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ tabId: 9, text: '!' });
            expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 9, color: '#FF6969' });
        });

        it('should use proxy custom color for "ALL" badge background', () => {
            const proxy = { name: 'My Proxy', host: '1.2.3.4', port: 8080, scheme: 'http' as const, color: '#FF00FF' };

            IconManager.setTabProxyBadge(10, proxy, false, true);

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