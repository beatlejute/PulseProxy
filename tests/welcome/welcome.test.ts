import { mockHelpers } from '../setup';

jest.mock('../../src/shared/storage', () => ({
    Storage: {
        init: jest.fn(() => Promise.resolve()),
        setSyncEnabled: jest.fn(() => Promise.resolve({ received: 3, added: 2 })),
        validateImportData: jest.fn(),
        importAllData: jest.fn(() => Promise.resolve()),
    },
}));

import { initWelcome, nav, TOUR_URL, PAGE_VIEW_URL } from '../../src/welcome/index';
import { Storage } from '../../src/shared/storage';

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function renderWelcomeDom(): void {
    document.body.innerHTML = `
        <div class="steps"></div>
        <button class="welcome-button"></button>
        <div class="welcome-options">
            <button id="welcome-option-wizard" class="welcome-option"></button>
            <button id="welcome-option-sync" class="welcome-option"></button>
            <button id="welcome-option-import" class="welcome-option"></button>
            <button id="welcome-option-skip" class="welcome-option"></button>
            <div id="welcome-status" class="welcome-status"></div>
            <input type="file" id="welcome-import-input" />
        </div>
    `;
}

function createMockFile(content: string, name = 'settings.json'): File {
    const file = new File([content], name, { type: 'application/json' });
    // jsdom не реализует text() для File
    (file as unknown as { text: () => Promise<string> }).text = jest.fn().mockResolvedValue(content);
    return file;
}

function selectImportFile(content: string): void {
    const input = document.getElementById('welcome-import-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [createMockFile(content)], writable: true });
    input.dispatchEvent(new Event('change'));
}

function status(): HTMLElement {
    return document.getElementById('welcome-status') as HTMLElement;
}

describe('welcome — выбор сценария после «Начать»', () => {
    let goSpy: jest.SpyInstance;
    let closeSpy: jest.SpyInstance;

    beforeEach(() => {
        mockHelpers.resetAllMocks();
        jest.clearAllMocks();
        (Storage.setSyncEnabled as jest.Mock).mockResolvedValue({ received: 3, added: 2 });
        renderWelcomeDom();
        goSpy = jest.spyOn(nav, 'go').mockImplementation(() => {});
        closeSpy = jest.spyOn(nav, 'close').mockImplementation(() => {});
        initWelcome();
    });

    afterEach(() => {
        goSpy.mockRestore();
        closeSpy.mockRestore();
        jest.useRealTimers();
    });

    it('«Начать» показывает опции и скрывает шаги', () => {
        (document.querySelector('.welcome-button') as HTMLButtonElement).click();

        expect(document.querySelector('.welcome-options')!.classList.contains('visible')).toBe(true);
        expect((document.querySelector('.steps') as HTMLElement).style.display).toBe('none');
        expect((document.querySelector('.welcome-button') as HTMLElement).style.display).toBe('none');
    });

    it('«Мастер настройки» открывает page-режим с туром', () => {
        document.getElementById('welcome-option-wizard')!.click();

        expect(goSpy).toHaveBeenCalledWith(TOUR_URL);
        expect(TOUR_URL).toContain('view=page');
        expect(TOUR_URL).toContain('tour=1');
    });

    it('«Пропустить» закрывает окно', () => {
        document.getElementById('welcome-option-skip')!.click();

        expect(closeSpy).toHaveBeenCalled();
    });

    describe('синхронизация', () => {
        it('включает sync, показывает статистику и уходит на страницу настроек', async () => {
            jest.useFakeTimers();

            document.getElementById('welcome-option-sync')!.click();
            await jest.advanceTimersByTimeAsync(0);

            expect(Storage.init).toHaveBeenCalled();
            expect(Storage.setSyncEnabled).toHaveBeenCalledWith(true);
            expect(status().textContent).toContain('syncEnabledStats');
            expect(status().classList.contains('welcome-status--success')).toBe(true);

            await jest.advanceTimersByTimeAsync(1500);
            expect(goSpy).toHaveBeenCalledWith(PAGE_VIEW_URL);
        });

        it('при ошибке показывает её и возвращает кнопки', async () => {
            (Storage.setSyncEnabled as jest.Mock).mockRejectedValue(new Error('quota exceeded'));

            document.getElementById('welcome-option-sync')!.click();
            await flush();

            expect(status().textContent).toContain('welcomeSyncError');
            expect(status().textContent).toContain('quota exceeded');
            expect(status().classList.contains('welcome-status--error')).toBe(true);
            expect((document.getElementById('welcome-option-sync') as HTMLButtonElement).disabled).toBe(false);
            expect(goSpy).not.toHaveBeenCalled();
        });

        it('пока идёт синхронизация — кнопки заблокированы', () => {
            document.getElementById('welcome-option-sync')!.click();

            expect((document.getElementById('welcome-option-wizard') as HTMLButtonElement).disabled).toBe(true);
        });
    });

    describe('импорт настроек', () => {
        it('кнопка импорта открывает file picker', () => {
            const input = document.getElementById('welcome-import-input') as HTMLInputElement;
            const clickSpy = jest.spyOn(input, 'click').mockImplementation(() => {});

            document.getElementById('welcome-option-import')!.click();

            expect(clickSpy).toHaveBeenCalled();
        });

        it('валидный файл импортируется, показывается успех и редирект', async () => {
            jest.useFakeTimers();
            const data = { version: 1, data: {} };
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: true,
                errors: [],
                warnings: [],
                data,
            });

            selectImportFile('{"version":1}');
            await jest.advanceTimersByTimeAsync(0);

            expect(Storage.importAllData).toHaveBeenCalledWith(data, 'replace');
            expect(status().textContent).toBe('importSuccess');

            await jest.advanceTimersByTimeAsync(1500);
            expect(goSpy).toHaveBeenCalledWith(PAGE_VIEW_URL);
        });

        it('сбрасывает value инпута — повторный выбор того же файла сработает', async () => {
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: false, errors: ['invalidJson'], warnings: [],
            });
            const input = document.getElementById('welcome-import-input') as HTMLInputElement;

            selectImportFile('bad');
            await flush();

            expect(input.value).toBe('');
        });

        it('невалидный файл — ошибка, импорт не выполняется', async () => {
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: false,
                errors: ['invalidJson'],
                warnings: [],
            });

            selectImportFile('not a json');
            await flush();

            expect(Storage.importAllData).not.toHaveBeenCalled();
            expect(status().textContent).toContain('importValidationError');
            expect(status().textContent).toContain('invalidJson');
            expect(status().classList.contains('welcome-status--error')).toBe(true);
            expect(goSpy).not.toHaveBeenCalled();
        });
    });
});
