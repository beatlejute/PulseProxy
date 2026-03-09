import { Storage } from '../shared/storage';
import { ProxyState, IconPaths } from '../shared/constants';
import { ProxyStateType, ThemeType } from '../types';

type IconPathObject = { [size: string]: string };

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
            chrome.action.setBadgeText({ text: '' });
        }
    }

    getIconPath(state: ProxyStateType, theme: ThemeType): string {
        if (state === ProxyState.CONNECTED) {
            return IconPaths.ENABLED;
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