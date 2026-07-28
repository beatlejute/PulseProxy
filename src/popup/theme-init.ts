import { StorageKeys } from '../shared/constants';
import { ThemeType } from '../types';
import { applyPageViewClass } from './view-mode';
import { resolveEffectiveTheme } from './theme-resolver';

/**
 * Применяет класс темы к body до первой отрисовки попапа, чтобы не было
 * флеша неправильной темы. Подключается классическим скриптом сразу после
 * открытия <body>.
 * Если тема не задана вручную — наследуется от системных настроек ОС
 * (prefers-color-scheme), синхронно со Storage.getStoredTheme() / settings.ts.
 */
async function applyInitialTheme(): Promise<void> {
    let stored: ThemeType | undefined;
    try {
        const data = await chrome.storage.local.get(StorageKeys.THEME);
        stored = data[StorageKeys.THEME] as ThemeType | undefined;
    } catch {
        // storage недоступен — resolveEffectiveTheme наследует тему от системы
    }

    const isDark = resolveEffectiveTheme(stored) === 'dark';
    document.body.classList.add(isDark ? 'theme-dark' : 'theme-light');
    document.body.classList.remove(isDark ? 'theme-light' : 'theme-dark');
}

// Синхронно, до первой отрисовки: раскладка page-view (открытие во вкладке)
applyPageViewClass();

void applyInitialTheme();
