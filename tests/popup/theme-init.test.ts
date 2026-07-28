/**
 * @jest-environment jsdom
 */

import { StorageKeys } from '../../src/shared/constants';

// theme-init выполняется как side-effect при импорте модуля,
// поэтому каждый тест импортирует его в изолированном module registry.
async function importThemeInit(): Promise<void> {
    await jest.isolateModulesAsync(async () => {
        await import('../../src/popup/theme-init');
    });
    // Даём отработать microtask-цепочке chrome.storage.local.get
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('theme-init', () => {
    beforeEach(() => {
        document.body.className = '';
    });

    afterEach(() => {
        delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    });

    it('должен применить theme-dark если в storage сохранена тёмная тема', async () => {
        await chrome.storage.local.set({ [StorageKeys.THEME]: 'dark' });

        await importThemeInit();

        expect(document.body.classList.contains('theme-dark')).toBe(true);
        expect(document.body.classList.contains('theme-light')).toBe(false);
    });

    it('должен применить theme-light если в storage сохранена светлая тема', async () => {
        await chrome.storage.local.set({ [StorageKeys.THEME]: 'light' });

        await importThemeInit();

        expect(document.body.classList.contains('theme-light')).toBe(true);
        expect(document.body.classList.contains('theme-dark')).toBe(false);
    });

    it('должен унаследовать theme-dark от системы, если тема не задана вручную', async () => {
        (window as unknown as { matchMedia: unknown }).matchMedia = jest.fn(
            (query: string) => ({ matches: query.includes('dark') })
        );

        await importThemeInit();

        expect(document.body.classList.contains('theme-dark')).toBe(true);
        expect(document.body.classList.contains('theme-light')).toBe(false);
    });

    it('должен унаследовать theme-light от системы, если тема не задана вручную', async () => {
        (window as unknown as { matchMedia: unknown }).matchMedia = jest.fn(
            (query: string) => ({ matches: !query.includes('dark') })
        );

        await importThemeInit();

        expect(document.body.classList.contains('theme-light')).toBe(true);
        expect(document.body.classList.contains('theme-dark')).toBe(false);
    });

    it('должен применить theme-light по умолчанию, если matchMedia недоступно', async () => {
        await importThemeInit();

        expect(document.body.classList.contains('theme-light')).toBe(true);
        expect(document.body.classList.contains('theme-dark')).toBe(false);
    });

    it('должен применить дефолтную тему при ошибке чтения storage', async () => {
        (chrome.storage.local.get as jest.Mock).mockRejectedValueOnce(
            new Error('storage unavailable')
        );

        await importThemeInit();

        expect(document.body.classList.contains('theme-light')).toBe(true);
    });

    it('должен заменить противоположный класс темы, а не накапливать', async () => {
        document.body.classList.add('theme-light');
        await chrome.storage.local.set({ [StorageKeys.THEME]: 'dark' });

        await importThemeInit();

        expect(document.body.classList.contains('theme-dark')).toBe(true);
        expect(document.body.classList.contains('theme-light')).toBe(false);
    });
});
