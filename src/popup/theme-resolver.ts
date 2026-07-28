import { ThemeType } from '../types';

/**
 * Тема, соответствующая системным настройкам ОС (prefers-color-scheme).
 * Если API matchMedia недоступно (нестандартное окружение) — считаем 'light',
 * что совпадает с историческим дефолтом расширения.
 */
export function getSystemTheme(): ThemeType {
    const prefersDark =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
}

/**
 * Эффективная тема попапа.
 * Если пользователь явно выбрал тему ('light' | 'dark') — используем её.
 * Если тема не задана вручную (undefined) — наследуем от системных настроек ОС.
 */
export function resolveEffectiveTheme(stored: ThemeType | undefined): ThemeType {
    return stored === 'light' || stored === 'dark' ? stored : getSystemTheme();
}
