import { mockHelpers } from '../setup';

// Динамический импорт для правильного порядка инициализации
let I18n: typeof import('../../src/shared/i18n').I18n;

describe('i18n.ts - I18nService', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.resetModules();
        
        // Мок для fetch - возвращает тестовые переводы
        (global.fetch as jest.Mock).mockImplementation((url: string) => {
            if (url.includes('/en/')) {
                return Promise.resolve({
                    json: () => Promise.resolve({
                        buttonConnect: { message: 'Connect' },
                        buttonConnected: { message: 'Connected' },
                        buttonConnecting: { message: 'Connecting...' },
                        buttonError: { message: 'Error' },
                        extensionName: { message: 'Pulse Proxy' },
                    }),
                    ok: true,
                    status: 200,
                });
            }
            if (url.includes('/ru/')) {
                return Promise.resolve({
                    json: () => Promise.resolve({
                        buttonConnect: { message: 'Подключить' },
                        buttonConnected: { message: 'Подключено' },
                        buttonConnecting: { message: 'Подключение...' },
                        buttonError: { message: 'Ошибка' },
                        extensionName: { message: 'Pulse Proxy' },
                    }),
                    ok: true,
                    status: 200,
                });
            }
            // Для неподдерживаемых языков возвращаем ошибку
            return Promise.reject(new Error('Language not found'));
        });
        
        const i18nModule = await import('../../src/shared/i18n');
        I18n = i18nModule.I18n;
    });

    describe('init()', () => {
        it('should initialize with saved language', async () => {
            mockHelpers.setLocalStorageData({ language: 'ru' });
            
            await I18n.init();
            
            expect(I18n.getCurrentLanguage()).toBe('ru');
        });

        it('should detect browser language if no saved language', async () => {
            mockHelpers.setLocalStorageData({});
            (chrome.i18n.getUILanguage as jest.Mock).mockReturnValue('de');
            
            // Добавляем мок для немецкого
            (global.fetch as jest.Mock).mockImplementation((url: string) => {
                if (url.includes('/de/')) {
                    return Promise.resolve({
                        json: () => Promise.resolve({
                            buttonConnect: { message: 'Verbinden' },
                        }),
                        ok: true,
                        status: 200,
                    });
                }
                return Promise.reject(new Error('Language not found'));
            });
            
            await I18n.init();
            
            expect(I18n.getCurrentLanguage()).toBe('de');
        });

        it('should fallback to default language for unsupported browser language', async () => {
            mockHelpers.setLocalStorageData({});
            (chrome.i18n.getUILanguage as jest.Mock).mockReturnValue('unknown-lang');
            
            await I18n.init();
            
            expect(I18n.getCurrentLanguage()).toBe('en');
        });

        it('should load messages for the language', async () => {
            mockHelpers.setLocalStorageData({ language: 'en' });
            
            await I18n.init();
            
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('_locales/en/messages.json')
            );
        });
    });

    describe('getMessage()', () => {
        beforeEach(async () => {
            mockHelpers.setLocalStorageData({ language: 'en' });
            await I18n.init();
        });

        it('should return translated message', () => {
            const message = I18n.getMessage('buttonConnect');
            
            expect(message).toBe('Connect');
        });

        it('should return key if message not found', () => {
            const message = I18n.getMessage('nonExistentKey' as any);
            
            expect(message).toBe('nonExistentKey');
        });
    });

    describe('setLanguage()', () => {
        beforeEach(async () => {
            mockHelpers.setLocalStorageData({ language: 'en' });
            await I18n.init();
        });

        it('should change language', async () => {
            await I18n.setLanguage('ru');
            
            expect(I18n.getCurrentLanguage()).toBe('ru');
        });

        it('should save language to storage', async () => {
            await I18n.setLanguage('ru');
            
            expect(chrome.storage.local.set).toHaveBeenCalledWith(
                expect.objectContaining({ language: 'ru' }),
                expect.any(Function)
            );
        });

        it('should load new messages after language change', async () => {
            await I18n.setLanguage('ru');
            
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('_locales/ru/messages.json')
            );
            
            const message = I18n.getMessage('buttonConnect');
            expect(message).toBe('Подключить');
        });
    });

    describe('applyTranslations()', () => {
        beforeEach(async () => {
            mockHelpers.setLocalStorageData({ language: 'en' });
            await I18n.init();
            
            // Создаём тестовый DOM
            document.body.innerHTML = `
                <div>
                    <span data-i18n="buttonConnect">Original</span>
                    <span data-i18n="buttonConnected">Original</span>
                    <input data-i18n-placeholder="buttonConnect" placeholder="Original" />
                    <button data-i18n-title="buttonConnect" title="Original" aria-label="Original"></button>
                </div>
            `;
        });

        afterEach(() => {
            document.body.innerHTML = '';
        });

        it('should apply translations to elements with data-i18n', () => {
            I18n.applyTranslations();
            
            const span = document.querySelector('[data-i18n="buttonConnect"]');
            expect(span?.textContent).toBe('Connect');
        });

        it('should apply translations to multiple elements', () => {
            I18n.applyTranslations();
            
            const spans = document.querySelectorAll('[data-i18n]');
            expect(spans[0].textContent).toBe('Connect');
            expect(spans[1].textContent).toBe('Connected');
        });

        it('should apply translations to placeholders', () => {
            I18n.applyTranslations();

            const input = document.querySelector('[data-i18n-placeholder]') as HTMLInputElement;
            expect(input.placeholder).toBe('Connect');
        });

        it('should apply translations to title and aria-label via data-i18n-title', () => {
            I18n.applyTranslations();

            const button = document.querySelector('[data-i18n-title]') as HTMLButtonElement;
            expect(button.getAttribute('title')).toBe('Connect');
            expect(button.getAttribute('aria-label')).toBe('Connect');
        });
    });

    describe('getCurrentLanguage()', () => {
        it('should return current language', async () => {
            mockHelpers.setLocalStorageData({ language: 'ru' });
            await I18n.init();
            
            expect(I18n.getCurrentLanguage()).toBe('ru');
        });
    });

    describe('Fallback behavior', () => {
        it('should fallback to default language on load error', async () => {
            mockHelpers.setLocalStorageData({ language: 'invalid' as any });
            
            // Мок возвращает ошибку для invalid, но работает для en
            (global.fetch as jest.Mock).mockImplementation((url: string) => {
                if (url.includes('/invalid/')) {
                    return Promise.reject(new Error('Not found'));
                }
                if (url.includes('/en/')) {
                    return Promise.resolve({
                        json: () => Promise.resolve({
                            buttonConnect: { message: 'Connect' },
                        }),
                        ok: true,
                        status: 200,
                    });
                }
                return Promise.reject(new Error('Unknown'));
            });
            
            await I18n.init();
            
            // Должен вызвать fallback на английский
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('_locales/en/messages.json')
            );
        });
    });
});