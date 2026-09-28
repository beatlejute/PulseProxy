import type { ProxyRoute } from './proxy-manager';
import { Storage } from '../shared/storage';
import { ProxyState, IconPaths, PublicPoolCheckConfig } from '../shared/constants';
import { ProxyStateType, ThemeType, ProxyServer } from '../types';

type IconPathObject = { [size: string]: string };

// Default badge for proxied tabs without a color
const DEFAULT_BADGE_TEXT = '✓';
const DEFAULT_BADGE_COLOR = '#4CAF50';
// Badge shown when the tab is proxied via "proxy all sites by default" mode
const PROXY_ALL_BADGE_TEXT = 'ALL';
// Badge background when the tab's route failed (own proxy or empty pool)
const ERROR_BADGE_COLOR = '#FF6969';
// Badge text when a public pool has no live members left
const EMPTY_POOL_BADGE_TEXT = '!';

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
        // Clear global badge; per-tab badges handle both connected and error states
        chrome.action.setBadgeText({ text: '' });
    }

    /**
     * Sets per-tab badge indicating how the tab's site is routed.
     * - Public pool: 🌐 on the pool color, or "!" in red when the pool has no live members.
     *   Pool health is a pool property, so `isError` (proxy connection failure) is ignored here.
     * - Own proxy: country flag emoji from the proxy name, otherwise a checkmark.
     *   In "proxy all sites by default" mode shows "ALL" instead (error indicator takes precedence).
     *   Uses the proxy's color marker as badge background if set.
     * - null route: clears the badge.
     */
    setTabProxyBadge(tabId: number, route: ProxyRoute | null, isError = false): void {
        if (!route) {
            this.clearTabBadge(tabId);
            return;
        }

        if (route.kind === 'pool') {
            const isEmptyPool = (route.poolSize ?? 0) === 0;
            chrome.action.setBadgeText({ tabId, text: isEmptyPool ? EMPTY_POOL_BADGE_TEXT : PublicPoolCheckConfig.BADGE_TEXT }).catch(() => {});
            chrome.action.setBadgeBackgroundColor({ tabId, color: isEmptyPool ? ERROR_BADGE_COLOR : PublicPoolCheckConfig.BADGE_COLOR }).catch(() => {});
            return;
        }

        const proxy = route.server;
        if (!proxy) {
            this.clearTabBadge(tabId);
            return;
        }

        const badgeText = !isError && route.viaProxyAll
            ? PROXY_ALL_BADGE_TEXT
            : this.extractBadgeText(proxy, isError);
        const badgeColor = isError ? ERROR_BADGE_COLOR : (proxy.color || DEFAULT_BADGE_COLOR);
        chrome.action.setBadgeText({ tabId, text: badgeText }).catch(() => {});
        chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor }).catch(() => {});
    }

    private clearTabBadge(tabId: number): void {
        chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    }

    /**
     * Extracts badge text from proxy: country flag if present in name, otherwise checkmark.
     */
    private extractBadgeText(proxy: ProxyServer, isError = false): string {
        if (proxy.name) {
            const flagMatch = proxy.name.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u);
            if (flagMatch) {
                return flagMatch[0];
            }
        }
        return isError ? '!' : DEFAULT_BADGE_TEXT;
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