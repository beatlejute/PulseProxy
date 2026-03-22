import { Storage } from '../shared/storage';
import { ProxyState, IconPaths } from '../shared/constants';
import { ProxyStateType, ThemeType } from '../types';

type IconPathObject = { [size: string]: string };

// Badge text for tabs routed through proxy
const PROXY_BADGE_TEXT = 'ON';
const PROXY_BADGE_COLOR = '#4CAF50';

class IconManagerService {
    async update(): Promise<void> {
        const [currentState, theme] = await Promise.all([
            Storage.getCurrentState(),
            Storage.getTheme(),
        ]);

        const iconPath = this.getIconPath(currentState, theme);
        this.setIconSafe(iconPath);
        this.updateBadge(currentState);
    }

    private updateBadge(state: ProxyStateType): void {
        if (state === ProxyState.ERROR) {
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#FF6969' });
        } else {
            // Clear global badge; per-tab badges are set separately
            chrome.action.setBadgeText({ text: '' });
        }
    }

    /**
     * Sets per-tab badge indicating whether the tab's site is routed through a proxy.
     */
    setTabProxyBadge(tabId: number, isProxied: boolean): void {
        if (isProxied) {
            chrome.action.setBadgeText({ tabId, text: PROXY_BADGE_TEXT });
            chrome.action.setBadgeBackgroundColor({ tabId, color: PROXY_BADGE_COLOR });
        } else {
            chrome.action.setBadgeText({ tabId, text: '' });
        }
    }

    getIconPath(state: ProxyStateType, theme: ThemeType): string {
        if (state === ProxyState.CONNECTED) {
            return IconPaths.ENABLED;
        }
        if (state === ProxyState.CONNECTING) {
            return IconPaths.CONNECTING;
        }

        return theme === 'light' ? IconPaths.DISABLED_LIGHT : IconPaths.DISABLED_DARK;
    }

    private setIconSafe(basePath: string): void {
        // Для enabled иконки есть все размеры, для disabled - только 128px
        const isEnabled = basePath === IconPaths.ENABLED;
        
        // Используем абсолютные пути от корня расширения (с /)
        const pathObject: IconPathObject = isEnabled
            ? {
                '16': '/icons/icon16.png',
                '48': '/icons/icon48.png',
                '128': '/icons/icon128.png',
            }
            : {
                '128': '/' + basePath,
            };

        chrome.action.setIcon({ path: pathObject }, () => {
            if (chrome.runtime.lastError) {
                console.error('IconManager: Failed to set icon:', chrome.runtime.lastError.message);
            }
        });
    }

    setIcon(path: string): void {
        this.setIconSafe(path);
    }
}

export const IconManager = new IconManagerService();