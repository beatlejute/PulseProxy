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

    it('should have fallback values (English) for non-en/ru locales', () => {
        const locales = readdirSync(LOCALES_DIR).filter((locale) => locale !== 'en' && locale !== 'ru');

        locales.forEach((locale) => {
            const messagesPath = join(LOCALES_DIR, locale, 'messages.json');
            const content = readFileSync(messagesPath, 'utf-8');
            const messages = JSON.parse(content);

            REQUIRED_KEYS.forEach((key) => {
                expect(messages[key].message).toBe(
                    enMessages[key].message,
                    `Locale "${locale}" key "${key}" should match English fallback, got "${messages[key].message}" instead of "${enMessages[key].message}"`
                );
            });
        });
    });
});
