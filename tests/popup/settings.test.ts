/**
 * @jest-environment jsdom
 */

// Mock для модулей
jest.mock('../../src/shared/storage', () => ({
    Storage: {
        init: jest.fn().mockResolvedValue(undefined),
        getSyncEnabled: jest.fn().mockResolvedValue(false),
        setSyncEnabled: jest.fn().mockResolvedValue(undefined),
        getProxyCheckEnabled: jest.fn().mockResolvedValue(true),
        setProxyCheckEnabled: jest.fn().mockResolvedValue(undefined),
        getTheme: jest.fn().mockResolvedValue('light'),
        getStoredTheme: jest.fn().mockResolvedValue(undefined),
        setTheme: jest.fn().mockResolvedValue(undefined),
        exportAllData: jest.fn().mockResolvedValue({
            version: '1.0.0',
            exportDate: '2025-01-24T00:00:00.000Z',
            data: {
                settings: { proxyEnabled: false },
                proxies: [],
                presets: [],
            },
        }),
        validateImportData: jest.fn().mockReturnValue({
            valid: true,
            errors: [],
            warnings: [],
            data: {
                version: '1.0.0',
                exportDate: '2025-01-24T00:00:00.000Z',
                data: {
                    settings: { proxyEnabled: false },
                    proxies: [],
                    presets: [],
                },
            },
        }),
        importAllData: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        getMessage: jest.fn((key: string) => key),
        applyTranslations: jest.fn(),
        getCurrentLanguage: jest.fn().mockReturnValue('en'),
        setLanguage: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../../src/shared/constants', () => ({
    // Реальные константы (ProxyState и др. нужны транзитивным импортам, напр. ui.ts),
    // переопределяем только языки для компактности тестов
    ...jest.requireActual('../../src/shared/constants'),
    SUPPORTED_LANGUAGES: ['en', 'ru', 'de', 'fr'],
    LANGUAGE_NAMES: {
        en: 'English',
        ru: 'Русский',
        de: 'Deutsch',
        fr: 'Français',
    },
}));

jest.mock('../../src/popup/ui', () => ({
    UI: {
        updateState: jest.fn(),
        getCurrentState: jest.fn().mockReturnValue('disconnected'),
    },
}));

jest.mock('../../src/shared/analytics', () => ({
    trackEvent: jest.fn().mockResolvedValue(undefined),
    buildAffiliateUrl: jest.fn((url: string, placement: string) => `${url}?utm_source=${placement}`),
}));

jest.mock('../../src/shared/remote-config', () => ({
    RemoteConfig: { referralLink: 'https://example.com/ref' },
}));

jest.mock('../../src/popup/dialog', () => ({
    showConfirm: jest.fn(() => Promise.resolve(true)),
    showAlert: jest.fn(() => Promise.resolve()),
}));

import { Settings } from '../../src/popup/settings';
import { Storage } from '../../src/shared/storage';
import { I18n } from '../../src/shared/i18n';
import { SUPPORTED_LANGUAGES } from '../../src/shared/constants';
import { showConfirm, showAlert } from '../../src/popup/dialog';
import { trackEvent, buildAffiliateUrl } from '../../src/shared/analytics';
import { RemoteConfig } from '../../src/shared/remote-config';

describe('settings.ts - SettingsService', () => {
    beforeEach(() => {
        // Сбрасываем DOM
        document.body.innerHTML = `
            <select id="language-select"></select>
            <input type="checkbox" id="sync-toggle">
            <input type="checkbox" id="proxy-check-toggle">
            <input type="checkbox" id="theme-toggle">
            <button id="export-button">Export</button>
            <button id="import-button">Import</button>
            <input type="file" id="import-file-input" accept=".json">
            <span id="version-number"></span>
            <a class="promo-link referral-link" href="#">Promo</a>
        `;

        // Мок chrome.tabs
        (global as any).chrome.tabs = { create: jest.fn() };

        // Сбрасываем моки
        jest.clearAllMocks();

        // Сбрасываем глобальные функции
        window.confirm = jest.fn(() => true);
        window.alert = jest.fn();

        // Устанавливаем значения по умолчанию для диалогов
        (showConfirm as jest.Mock).mockResolvedValue(true);
        (showAlert as jest.Mock).mockResolvedValue();

        // Мокаем URL API
        global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
        global.URL.revokeObjectURL = jest.fn();
    });

    describe('init()', () => {
        it('should find all required elements', async () => {
            await Settings.init();

            expect(document.getElementById('language-select')).not.toBeNull();
            expect(document.getElementById('sync-toggle')).not.toBeNull();
            expect(document.getElementById('export-button')).not.toBeNull();
            expect(document.getElementById('import-button')).not.toBeNull();
            expect(document.getElementById('import-file-input')).not.toBeNull();
        });

        it('should call Storage.init', async () => {
            await Settings.init();

            expect(Storage.init).toHaveBeenCalled();
        });

        it('should initialize language selector', async () => {
            await Settings.init();

            const select = document.getElementById('language-select') as HTMLSelectElement;
            expect(select.options.length).toBe(SUPPORTED_LANGUAGES.length);
        });

        it('should initialize sync toggle', async () => {
            (Storage.getSyncEnabled as jest.Mock).mockResolvedValue(true);

            await Settings.init();

            const toggle = document.getElementById('sync-toggle') as HTMLInputElement;
            expect(toggle.checked).toBe(true);
        });
    });

    describe('initLanguageSelector()', () => {
        it('should populate language options', async () => {
            await Settings.init();

            const select = document.getElementById('language-select') as HTMLSelectElement;
            const options = Array.from(select.options);
            
            expect(options.map(o => o.value)).toEqual(['en', 'ru', 'de', 'fr']);
        });

        it('should set current language as selected', async () => {
            (I18n.getCurrentLanguage as jest.Mock).mockReturnValue('ru');

            await Settings.init();

            const select = document.getElementById('language-select') as HTMLSelectElement;
            expect(select.value).toBe('ru');
        });

        it('should call I18n.setLanguage on change', async () => {
            await Settings.init();

            const select = document.getElementById('language-select') as HTMLSelectElement;
            select.value = 'de';
            select.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(I18n.setLanguage).toHaveBeenCalledWith('de');
            expect(I18n.applyTranslations).toHaveBeenCalled();
        });
    });

    describe('initSyncToggle()', () => {
        it('should load current sync state', async () => {
            (Storage.getSyncEnabled as jest.Mock).mockResolvedValue(true);

            await Settings.init();

            const toggle = document.getElementById('sync-toggle') as HTMLInputElement;
            expect(toggle.checked).toBe(true);
        });

        it('should show confirmation dialog on change', async () => {
            await Settings.init();

            const toggle = document.getElementById('sync-toggle') as HTMLInputElement;
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));

            expect(showConfirm).toHaveBeenCalled();
        });

        it('should call Storage.setSyncEnabled if confirmed', async () => {
            (showConfirm as jest.Mock).mockResolvedValue(true);

            await Settings.init();

            const toggle = document.getElementById('sync-toggle') as HTMLInputElement;
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(Storage.setSyncEnabled).toHaveBeenCalledWith(true);
        });

        it('should revert checkbox if cancelled', async () => {
            (showConfirm as jest.Mock).mockResolvedValue(false);

            await Settings.init();

            const toggle = document.getElementById('sync-toggle') as HTMLInputElement;
            const initialChecked = toggle.checked;
            toggle.checked = !initialChecked;
            toggle.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(toggle.checked).toBe(initialChecked);
        });

        it('should show merge stats alert after enabling sync', async () => {
            (showConfirm as jest.Mock).mockResolvedValue(true);
            (Storage.setSyncEnabled as jest.Mock).mockResolvedValue({ received: 3, added: 2 });

            await Settings.init();

            const toggle = document.getElementById('sync-toggle') as HTMLInputElement;
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(I18n.getMessage).toHaveBeenCalledWith('syncEnabledStats', ['3', '2']);
            expect(showAlert).toHaveBeenCalledWith('syncEnabledStats', 'settings');
        });

        it('should not show stats alert when disabling sync', async () => {
            (Storage.getSyncEnabled as jest.Mock).mockResolvedValue(true);
            (showConfirm as jest.Mock).mockResolvedValue(true);
            (Storage.setSyncEnabled as jest.Mock).mockResolvedValue(null);

            await Settings.init();

            const toggle = document.getElementById('sync-toggle') as HTMLInputElement;
            toggle.checked = false;
            toggle.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(Storage.setSyncEnabled).toHaveBeenCalledWith(false);
            expect(showAlert).not.toHaveBeenCalled();
        });

        it('should revert checkbox and show alert on error', async () => {
            (showConfirm as jest.Mock).mockResolvedValue(true);
            (Storage.setSyncEnabled as jest.Mock).mockRejectedValue(new Error('Sync error'));

            await Settings.init();

            const toggle = document.getElementById('sync-toggle') as HTMLInputElement;
            const initialChecked = toggle.checked;
            toggle.checked = !initialChecked;
            toggle.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(toggle.checked).toBe(initialChecked);
            expect(showAlert).toHaveBeenCalled();
        });
    });

    describe('initImportExport()', () => {
        it('should trigger file input on import button click', async () => {
            await Settings.init();

            const importBtn = document.getElementById('import-button') as HTMLButtonElement;
            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const clickSpy = jest.spyOn(fileInput, 'click');

            importBtn.click();

            expect(clickSpy).toHaveBeenCalled();
        });
    });

    describe('handleExport()', () => {
        it('should call Storage.exportAllData', async () => {
            await Settings.init();

            const exportBtn = document.getElementById('export-button') as HTMLButtonElement;
            exportBtn.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(Storage.exportAllData).toHaveBeenCalled();
        });

        it('should create and click download link', async () => {
            const appendChildSpy = jest.spyOn(document.body, 'appendChild');
            const removeChildSpy = jest.spyOn(document.body, 'removeChild');

            await Settings.init();

            const exportBtn = document.getElementById('export-button') as HTMLButtonElement;
            exportBtn.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(appendChildSpy).toHaveBeenCalled();
            expect(removeChildSpy).toHaveBeenCalled();
            expect(URL.revokeObjectURL).toHaveBeenCalled();
        });

        it('should show alert on export error', async () => {
            (Storage.exportAllData as jest.Mock).mockRejectedValue(new Error('Export error'));

            await Settings.init();

            const exportBtn = document.getElementById('export-button') as HTMLButtonElement;
            exportBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(showAlert).toHaveBeenCalled();
        });
    });

    describe('handleImport()', () => {
        const createMockFile = (content: string, name = 'test.json'): File => {
            const blob = new Blob([content], { type: 'application/json' });
            const file = new File([blob], name, { type: 'application/json' });
            // jsdom не реализует text() для File, добавляем его вручную
            (file as any).text = jest.fn().mockResolvedValue(content);
            return file;
        };

        it('should validate import data', async () => {
            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile('{"version":"1.0.0"}');

            // Мокаем files
            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(Storage.validateImportData).toHaveBeenCalled();
        });

        it('should show error if validation fails', async () => {
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: false,
                errors: ['importErrorInvalidJson'],
                warnings: [],
                data: null,
            });

            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile('invalid json');

            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(showAlert).toHaveBeenCalled();
            expect(Storage.importAllData).not.toHaveBeenCalled();
        });

        it('should show confirmation before import', async () => {
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: true,
                errors: [],
                warnings: [],
                data: { version: '1.0.0', data: {} },
            });

            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile('{"version":"1.0.0"}');

            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(showConfirm).toHaveBeenCalled();
        });

        it('should not import if cancelled', async () => {
            (showConfirm as jest.Mock).mockResolvedValue(false);
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: true,
                errors: [],
                warnings: [],
                data: { version: '1.0.0', data: {} },
            });

            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile('{"version":"1.0.0"}');

            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(Storage.importAllData).not.toHaveBeenCalled();
        });

        it('should call Storage.importAllData on confirmation', async () => {
            (showConfirm as jest.Mock).mockResolvedValue(true);
            const importData = {
                version: '1.0.0',
                exportDate: '2025-01-24T00:00:00.000Z',
                data: {
                    settings: { proxyEnabled: true },
                    proxies: [],
                    presets: [],
                },
            };
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: true,
                errors: [],
                warnings: [],
                data: importData,
            });

            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile(JSON.stringify(importData));

            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(Storage.importAllData).toHaveBeenCalledWith(importData, 'replace');
        });

        it('should show success alert on successful import', async () => {
            (showConfirm as jest.Mock).mockResolvedValue(true);
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: true,
                errors: [],
                warnings: [],
                data: { version: '1.0.0', data: {} },
            });

            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile('{"version":"1.0.0"}');

            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(showAlert).toHaveBeenCalledWith('importSuccess', 'settings');
        });

        it('should reset file input after import', async () => {
            (showConfirm as jest.Mock).mockResolvedValue(true);
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: true,
                errors: [],
                warnings: [],
                data: { version: '1.0.0', data: {} },
            });

            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile('{"version":"1.0.0"}');

            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(fileInput.value).toBe('');
        });

        it('should log warnings during import', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            (showConfirm as jest.Mock).mockResolvedValue(true);
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: true,
                errors: [],
                warnings: ['importWarningDeprecatedField'],
                data: { version: '1.0.0', data: {} },
            });

            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile('{"version":"1.0.0"}');

            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should handle import error', async () => {
            (showConfirm as jest.Mock).mockResolvedValue(true);
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: true,
                errors: [],
                warnings: [],
                data: { version: '1.0.0', data: {} },
            });
            (Storage.importAllData as jest.Mock).mockRejectedValue(new Error('Import failed'));

            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile('{"version":"1.0.0"}');

            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(showAlert).toHaveBeenCalledWith('importValidationError', 'settings');
        });

        it('should show newerVersion confirm dialog when warnings contain newerVersion (version > EXPORT_FORMAT_VERSION)', async () => {
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: true,
                errors: [],
                warnings: ['newerVersion'],
                data: { version: '1.0.0', data: {} },
            });
            (showConfirm as jest.Mock).mockResolvedValue(true);

            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile('{"version":999}');

            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(showConfirm).toHaveBeenCalledWith(
                'newerVersionConfirm',
                expect.objectContaining({ okText: 'continue', cancelText: 'cancel' })
            );
        });

        it('should not show newerVersion confirm dialog when warnings are empty (version <= EXPORT_FORMAT_VERSION)', async () => {
            (Storage.validateImportData as jest.Mock).mockReturnValue({
                valid: true,
                errors: [],
                warnings: [],
                data: { version: '1.0.0', data: {} },
            });
            (showConfirm as jest.Mock).mockResolvedValue(true);

            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            const file = createMockFile('{"version":1}');

            Object.defineProperty(fileInput, 'files', {
                value: [file],
                writable: true,
            });

            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(showConfirm).not.toHaveBeenCalledWith(
                'newerVersionConfirm',
                expect.anything()
            );
            expect(showConfirm).toHaveBeenCalledWith('importConfirm', { column: 'settings' });
        });
    });

    describe('showSaveSuccess()', () => {
        it('should temporarily show success state on a button', async () => {
            jest.useFakeTimers();

            await Settings.init();

            const button = document.getElementById('export-button') as HTMLButtonElement;
            button.textContent = 'Export';

            // Access private method via bracket notation
            (Settings as any).showSaveSuccess(button);

            expect(button.textContent).toBe('statusSaved');
            expect(button.classList.contains('success')).toBe(true);

            // Advance past the 1500ms timeout
            jest.advanceTimersByTime(1500);

            expect(button.textContent).toBe('Export');
            expect(button.classList.contains('success')).toBe(false);

            jest.useRealTimers();
        });

        it('should do nothing when button is null', async () => {
            await Settings.init();

            // Should not throw
            (Settings as any).showSaveSuccess(null);
        });
    });

    describe('initProxyCheckToggle()', () => {
        it('should load current proxy check state', async () => {
            (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(true);

            await Settings.init();

            const toggle = document.getElementById('proxy-check-toggle') as HTMLInputElement;
            expect(toggle.checked).toBe(true);
        });

        it('should set checkbox to false when storage returns false', async () => {
            (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(false);

            await Settings.init();

            const toggle = document.getElementById('proxy-check-toggle') as HTMLInputElement;
            expect(toggle.checked).toBe(false);
        });

        it('should call Storage.setProxyCheckEnabled on change', async () => {
            await Settings.init();

            const toggle = document.getElementById('proxy-check-toggle') as HTMLInputElement;
            toggle.checked = false;
            toggle.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(Storage.setProxyCheckEnabled).toHaveBeenCalledWith(false);
        });
    });

    describe('initThemeToggle()', () => {
        afterEach(() => {
            delete (window as unknown as { matchMedia?: unknown }).matchMedia;
        });

        it('should save theme to storage when setTheme is called', async () => {
            (Storage.getStoredTheme as jest.Mock).mockResolvedValue('light');

            await Settings.init();

            const toggle = document.getElementById('theme-toggle') as HTMLInputElement;
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(Storage.setTheme).toHaveBeenCalledWith('dark');
        });

        it('should reflect current theme from storage on init', async () => {
            (Storage.getStoredTheme as jest.Mock).mockResolvedValue('dark');

            await Settings.init();

            const toggle = document.getElementById('theme-toggle') as HTMLInputElement;
            expect(toggle.checked).toBe(true);
        });

        it('should apply CSS class to document.body on theme change', async () => {
            (Storage.getStoredTheme as jest.Mock).mockResolvedValue('light');

            await Settings.init();

            const toggle = document.getElementById('theme-toggle') as HTMLInputElement;
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(document.body.classList.contains('theme-dark')).toBe(true);
        });

        it('should inherit dark theme from system when not set manually', async () => {
            (Storage.getStoredTheme as jest.Mock).mockResolvedValue(undefined);
            (window as unknown as { matchMedia: unknown }).matchMedia = jest.fn(
                (query: string) => ({
                    matches: query.includes('dark'),
                    media: query,
                    addEventListener: jest.fn(),
                    removeEventListener: jest.fn(),
                })
            );

            await Settings.init();

            const toggle = document.getElementById('theme-toggle') as HTMLInputElement;
            expect(toggle.checked).toBe(true);
            expect(document.body.classList.contains('theme-dark')).toBe(true);
            expect(Storage.setTheme).not.toHaveBeenCalled();
        });

        it('should inherit light theme from system when not set manually', async () => {
            (Storage.getStoredTheme as jest.Mock).mockResolvedValue(undefined);
            (window as unknown as { matchMedia: unknown }).matchMedia = jest.fn(
                (query: string) => ({
                    matches: !query.includes('dark'),
                    media: query,
                    addEventListener: jest.fn(),
                    removeEventListener: jest.fn(),
                })
            );

            await Settings.init();

            const toggle = document.getElementById('theme-toggle') as HTMLInputElement;
            expect(toggle.checked).toBe(false);
            expect(document.body.classList.contains('theme-light')).toBe(true);
        });
    });

    describe('initVersion()', () => {
        it('should set version text from manifest', async () => {
            await Settings.init();

            const versionEl = document.getElementById('version-number') as HTMLSpanElement;
            expect(versionEl.textContent).toBe('1.0.0');
        });

        it('should not throw when version element is missing', async () => {
            document.getElementById('version-number')?.remove();

            // Should not throw
            await Settings.init();
            expect(Storage.init).toHaveBeenCalled();
        });
    });

    describe('initAffiliateLinkHandlers()', () => {
        it('should track event and open tab on referral link click', async () => {
            await Settings.init();

            const link = document.querySelector('.promo-link.referral-link') as HTMLAnchorElement;
            link.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(trackEvent).toHaveBeenCalledWith('affiliate_link_clicked', {
                provider: 'example',
                placement: 'settings',
                link_url: 'https://example.com/ref?utm_source=settings',
            });

            expect(chrome.tabs.create).toHaveBeenCalledWith({
                url: 'https://example.com/ref?utm_source=settings',
            });
        });

        it('should call buildAffiliateUrl with correct params', async () => {
            await Settings.init();

            const link = document.querySelector('.promo-link.referral-link') as HTMLAnchorElement;
            link.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(buildAffiliateUrl).toHaveBeenCalledWith('https://example.com/ref', 'settings');
        });

        it('should not open tab when referral link is empty', async () => {
            (RemoteConfig as any).referralLink = '';

            await Settings.init();

            const link = document.querySelector('.promo-link.referral-link') as HTMLAnchorElement;
            link.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(chrome.tabs.create).not.toHaveBeenCalled();

            // Restore
            (RemoteConfig as any).referralLink = 'https://example.com/ref';
        });

        it('should not open tab when referral link is #', async () => {
            (RemoteConfig as any).referralLink = '#';

            await Settings.init();

            const link = document.querySelector('.promo-link.referral-link') as HTMLAnchorElement;
            link.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(chrome.tabs.create).not.toHaveBeenCalled();

            // Restore
            (RemoteConfig as any).referralLink = 'https://example.com/ref';
        });
    });

    describe('Edge cases', () => {
        it('should handle missing language selector', async () => {
            document.body.innerHTML = `
                <input type="checkbox" id="sync-toggle">
                <button id="export-button">Export</button>
                <button id="import-button">Import</button>
                <input type="file" id="import-file-input" accept=".json">
            `;

            // Не должно выбросить ошибку
            await Settings.init();
            expect(Storage.init).toHaveBeenCalled();
        });

        it('should handle missing sync toggle', async () => {
            document.body.innerHTML = `
                <select id="language-select"></select>
                <button id="export-button">Export</button>
                <button id="import-button">Import</button>
                <input type="file" id="import-file-input" accept=".json">
            `;

            // Не должно выбросить ошибку
            await Settings.init();
            expect(Storage.init).toHaveBeenCalled();
        });

        it('should handle missing import/export buttons', async () => {
            document.body.innerHTML = `
                <select id="language-select"></select>
                <input type="checkbox" id="sync-toggle">
            `;

            // Не должно выбросить ошибку
            await Settings.init();
            expect(Storage.init).toHaveBeenCalled();
        });

        it('should handle file input without files', async () => {
            await Settings.init();

            const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
            
            Object.defineProperty(fileInput, 'files', {
                value: [],
                writable: true,
            });

            // Не должно выбросить ошибку
            fileInput.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(Storage.validateImportData).not.toHaveBeenCalled();
        });
    });
});