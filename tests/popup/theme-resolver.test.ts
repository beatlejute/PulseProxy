/**
 * @jest-environment jsdom
 */

import { getSystemTheme, resolveEffectiveTheme } from '../../src/popup/theme-resolver';

/** Подменяет window.matchMedia так, чтобы prefers-color-scheme: dark совпадал с dark. */
function mockMatchMedia(prefersDark: boolean): void {
    (window as unknown as { matchMedia: unknown }).matchMedia = jest.fn(
        (query: string) => ({
            matches: query.includes('dark') ? prefersDark : !prefersDark,
            media: query,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        })
    );
}

describe('theme-resolver', () => {
    afterEach(() => {
        delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    });

    describe('getSystemTheme()', () => {
        it('возвращает dark, когда система предпочитает тёмную тему', () => {
            mockMatchMedia(true);
            expect(getSystemTheme()).toBe('dark');
        });

        it('возвращает light, когда система предпочитает светлую тему', () => {
            mockMatchMedia(false);
            expect(getSystemTheme()).toBe('light');
        });

        it('возвращает light, когда matchMedia недоступно', () => {
            delete (window as unknown as { matchMedia?: unknown }).matchMedia;
            expect(getSystemTheme()).toBe('light');
        });
    });

    describe('resolveEffectiveTheme()', () => {
        it('возвращает явно выбранную светлую тему, игнорируя систему', () => {
            mockMatchMedia(true);
            expect(resolveEffectiveTheme('light')).toBe('light');
        });

        it('возвращает явно выбранную тёмную тему, игнорируя систему', () => {
            mockMatchMedia(false);
            expect(resolveEffectiveTheme('dark')).toBe('dark');
        });

        it('наследует тёмную тему от системы, когда тема не задана вручную', () => {
            mockMatchMedia(true);
            expect(resolveEffectiveTheme(undefined)).toBe('dark');
        });

        it('наследует светлую тему от системы, когда тема не задана вручную', () => {
            mockMatchMedia(false);
            expect(resolveEffectiveTheme(undefined)).toBe('light');
        });
    });
});
