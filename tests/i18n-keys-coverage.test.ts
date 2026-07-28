import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

describe('i18n keys coverage - aria proxy labels', () => {
    const LOCALES_DIR = join(__dirname, '..', '_locales');
    const REQUIRED_KEYS = ['ariaProxyOn', 'ariaProxyOff', 'ariaProxyConnecting', 'ariaProxyError'];

    const EXPECTED_RU = {
        ariaProxyOn: 'Прокси включён',
        ariaProxyOff: 'Прокси выключен',
        ariaProxyConnecting: 'Подключение',
        ariaProxyError: 'Ошибка подключения',
    };

    let enMessages: Record<string, { message: string }>;

    beforeAll(() => {
        const enPath = join(LOCALES_DIR, 'en', 'messages.json');
        const enContent = readFileSync(enPath, 'utf-8');
        enMessages = JSON.parse(enContent);
    });

    it('should have all locales directories', () => {
        const locales = readdirSync(LOCALES_DIR);
        expect(locales.length).toBeGreaterThan(0);
        expect(locales).toContain('en');
        expect(locales).toContain('ru');
    });

    it('should have all required keys in all locales with non-empty message', () => {
        const locales = readdirSync(LOCALES_DIR);

        locales.forEach((locale) => {
            const messagesPath = join(LOCALES_DIR, locale, 'messages.json');
            const content = readFileSync(messagesPath, 'utf-8');
            const messages = JSON.parse(content);

            REQUIRED_KEYS.forEach((key) => {
                expect(messages[key]).toBeDefined();
                expect(messages[key].message).toBeDefined();
                expect(messages[key].message).not.toBe('');
            });
        });
    });

    it('should have correct Russian translations for aria proxy labels', () => {
        const ruPath = join(LOCALES_DIR, 'ru', 'messages.json');
        const ruContent = readFileSync(ruPath, 'utf-8');
        const ruMessages = JSON.parse(ruContent);

        Object.entries(EXPECTED_RU).forEach(([key, expectedValue]) => {
            expect(ruMessages[key].message).toBe(
                expectedValue,
                `Russian translation for "${key}" should be "${expectedValue}", got "${ruMessages[key].message}"`
            );
        });
    });

    // Тест «non-en/ru локали = английские заглушки» удалён: с a6b8d88 aria-ключи
    // переведены на все языки, политика заглушек отменена. Наличие и непустота
    // ключей во всех локалях покрыты тестом выше.
});

describe('i18n keys coverage - public proxy background check', () => {
    const LOCALES_DIR = join(__dirname, '..', '_locales');
    const REQUIRED_KEYS = [
        'publicProxyStatusAlive',
        'publicProxyStatusDead',
        'publicProxyCheckNow',
    ];

    const EXPECTED_RU = {
        publicProxyStatusAlive: 'Работает',
        publicProxyStatusDead: 'Не работает',
        publicProxyCheckNow: 'Проверить',
    };

    it('should have all required keys in all locales with non-empty message', () => {
        const locales = readdirSync(LOCALES_DIR);

        locales.forEach((locale) => {
            const messagesPath = join(LOCALES_DIR, locale, 'messages.json');
            const content = readFileSync(messagesPath, 'utf-8');
            const messages = JSON.parse(content);

            REQUIRED_KEYS.forEach((key) => {
                expect(messages[key]).toBeDefined();
                expect(messages[key].message).toBeDefined();
                expect(messages[key].message).not.toBe('');
            });
        });
    });

    it('should have correct Russian translations', () => {
        const ruPath = join(LOCALES_DIR, 'ru', 'messages.json');
        const ruContent = readFileSync(ruPath, 'utf-8');
        const ruMessages = JSON.parse(ruContent);

        Object.entries(EXPECTED_RU).forEach(([key, expectedValue]) => {
            expect(ruMessages[key].message).toBe(expectedValue);
        });
    });
});

describe('i18n keys coverage - public proxies filters toggle', () => {
    const LOCALES_DIR = join(__dirname, '..', '_locales');
    const REQUIRED_KEYS = ['publicProxiesShowFilters', 'publicProxiesHideFilters'];

    const EXPECTED_RU = {
        publicProxiesShowFilters: 'Показать фильтры',
        publicProxiesHideFilters: 'Скрыть фильтры',
    };

    it('should have both toggle keys in all locales with non-empty message', () => {
        const locales = readdirSync(LOCALES_DIR);

        locales.forEach((locale) => {
            const messagesPath = join(LOCALES_DIR, locale, 'messages.json');
            const content = readFileSync(messagesPath, 'utf-8');
            const messages = JSON.parse(content);

            REQUIRED_KEYS.forEach((key) => {
                expect(messages[key]).toBeDefined();
                expect(messages[key].message).toBeDefined();
                expect(messages[key].message).not.toBe('');
            });
        });
    });

    it('should have correct Russian translations for toggle labels', () => {
        const ruPath = join(LOCALES_DIR, 'ru', 'messages.json');
        const ruMessages = JSON.parse(readFileSync(ruPath, 'utf-8'));

        Object.entries(EXPECTED_RU).forEach(([key, expectedValue]) => {
            expect(ruMessages[key].message).toBe(expectedValue);
        });
    });
});

describe('i18n keys coverage - welcome options & setup tour', () => {
    const LOCALES_DIR = join(__dirname, '..', '_locales');
    const REQUIRED_KEYS = [
        'welcomeChooseTitle',
        'welcomeOptionWizard',
        'welcomeOptionWizardDesc',
        'welcomeOptionSync',
        'welcomeOptionSyncDesc',
        'welcomeOptionImport',
        'welcomeOptionImportDesc',
        'welcomeOptionSkip',
        'welcomeSyncError',
        'tourStepCounter',
        'tourStepAddProxyTitle',
        'tourStepAddProxyText',
        'tourStepModeTitle',
        'tourStepModeText',
        'tourChoiceAllSites',
        'tourChoiceSelectedSites',
        'tourStepPresetsTitle',
        'tourStepPresetsText',
        'tourStepConnectTitle',
        'tourStepConnectText',
        'tourStepPinTitle',
        'tourStepPinText',
        'tourNext',
        'tourDone',
        'tourSkip',
    ];

    const EXPECTED_RU = {
        welcomeOptionWizard: 'Мастер настройки',
        welcomeOptionSync: 'Синхронизация настроек',
        welcomeOptionImport: 'Импорт настроек',
        welcomeOptionSkip: 'Пропустить',
        tourChoiceAllSites: 'Все сайты',
        tourChoiceSelectedSites: 'Отдельные сайты',
        tourNext: 'Далее',
        tourDone: 'Готово',
        tourSkip: 'Пропустить обучение',
    };

    it('should have all welcome/tour keys in all locales with non-empty message', () => {
        const locales = readdirSync(LOCALES_DIR);

        locales.forEach((locale) => {
            const messagesPath = join(LOCALES_DIR, locale, 'messages.json');
            const messages = JSON.parse(readFileSync(messagesPath, 'utf-8'));

            REQUIRED_KEYS.forEach((key) => {
                expect(messages[key]).toBeDefined();
                expect(messages[key].message).toBeDefined();
                expect(messages[key].message).not.toBe('');
            });
        });
    });

    it('should have correct Russian translations', () => {
        const ruPath = join(LOCALES_DIR, 'ru', 'messages.json');
        const ruMessages = JSON.parse(readFileSync(ruPath, 'utf-8'));

        Object.entries(EXPECTED_RU).forEach(([key, expectedValue]) => {
            expect(ruMessages[key].message).toBe(expectedValue);
        });
    });

    it('tourStepCounter should keep $1/$2 placeholders in every locale', () => {
        const locales = readdirSync(LOCALES_DIR);

        locales.forEach((locale) => {
            const messagesPath = join(LOCALES_DIR, locale, 'messages.json');
            const messages = JSON.parse(readFileSync(messagesPath, 'utf-8'));

            expect(messages.tourStepCounter.message).toContain('$1');
            expect(messages.tourStepCounter.message).toContain('$2');
        });
    });
});

describe('i18n keys coverage - open in tab button', () => {
    const LOCALES_DIR = join(__dirname, '..', '_locales');
    const REQUIRED_KEYS = ['buttonOpenInTab'];

    const EXPECTED_RU = {
        buttonOpenInTab: 'Открыть во вкладке',
    };

    it('should have the key in all locales with non-empty message', () => {
        const locales = readdirSync(LOCALES_DIR);

        locales.forEach((locale) => {
            const messagesPath = join(LOCALES_DIR, locale, 'messages.json');
            const content = readFileSync(messagesPath, 'utf-8');
            const messages = JSON.parse(content);

            REQUIRED_KEYS.forEach((key) => {
                expect(messages[key]).toBeDefined();
                expect(messages[key].message).toBeDefined();
                expect(messages[key].message).not.toBe('');
            });
        });
    });

    it('should have correct Russian translation', () => {
        const ruPath = join(LOCALES_DIR, 'ru', 'messages.json');
        const ruMessages = JSON.parse(readFileSync(ruPath, 'utf-8'));

        Object.entries(EXPECTED_RU).forEach(([key, expectedValue]) => {
            expect(ruMessages[key].message).toBe(expectedValue);
        });
    });
});
