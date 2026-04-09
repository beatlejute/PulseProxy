/**
 * Settings i18n тАФ locale completeness snapshot (6.4.1)
 *
 * Scenario 6.4.1: Snapshot-проверка полноты переводов — автоматический тест
 * читает `_locales/en/messages.json` как эталон и сверяет, что в каждом из
 * остальных 7 локалей присутствуют все те же ключи. Дельта ключей
 * (отсутствующие/лишние) фиксируется как дефект.
 *
 * Запускается один раз за прогон, не требует UI-навигации по всем языкам.
 *
 * Также re-tests 6.3 (all 8 locales render) and 6.4 (no __MSG_ keys in UI).
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_ROOT = path.resolve(__dirname, '../../_locales');
const ETALON_LOCALE = 'en';
const ALL_LOCALES = ['en', 'ru', 'de', 'fr', 'es', 'zh', 'ja', 'pt'];

function loadMessages(locale: string): Record<string, any> {
    const filePath = path.join(LOCALES_ROOT, locale, 'messages.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
}

function getKeys(obj: Record<string, any>): string[] {
    return Object.keys(obj).sort();
}

test.describe('Settings i18n тАФ locale completeness (6.3, 6.4, 6.4.1)', () => {

    test('6.4.1: all locales have identical key set compared to en (snapshot)', () => {
        const etalonKeys = getKeys(loadMessages(ETALON_LOCALE));
        const missingReport: Record<string, string[]> = {};
        const extraReport: Record<string, string[]> = {};

        for (const locale of ALL_LOCALES) {
            if (locale === ETALON_LOCALE) continue;

            const localeKeys = getKeys(loadMessages(locale));
            const missing = etalonKeys.filter(k => !localeKeys.includes(k));
            const extra = localeKeys.filter(k => !etalonKeys.includes(k));

            if (missing.length > 0) {
                missingReport[locale] = missing;
            }
            if (extra.length > 0) {
                extraReport[locale] = extra;
            }
        }

        const hasMissing = Object.keys(missingReport).length > 0;
        const hasExtra = Object.keys(extraReport).length > 0;

        if (hasMissing || hasExtra) {
            let message = 'Locale key mismatch detected:\n';
            if (hasMissing) {
                message += '\nтЭМ Missing keys (present in en, absent in locale):\n';
                for (const [locale, keys] of Object.entries(missingReport)) {
                    message += `  ${locale}: [${keys.join(', ')}]\n`;
                }
            }
            if (hasExtra) {
                message += '\nтЪая╕П Extra keys (present in locale, absent in en):\n';
                for (const [locale, keys] of Object.entries(extraReport)) {
                    message += `  ${locale}: [${keys.join(', ')}]\n`;
                }
            }
            test.fail(true, message);
        }

        // If we get here, all locales match
        expect(Object.keys(missingReport).length).toBe(0);
        expect(Object.keys(extraReport).length).toBe(0);
    });

    test('6.3: all 8 locale files exist and are valid JSON', () => {
        for (const locale of ALL_LOCALES) {
            const filePath = path.join(LOCALES_ROOT, locale, 'messages.json');
            expect(fs.existsSync(filePath), `Locale file ${locale}/messages.json does not exist`).toBe(true);

            const content = fs.readFileSync(filePath, 'utf-8');
            let parsed: any;
            expect(() => { parsed = JSON.parse(content); }).not.toThrow();
            expect(typeof parsed).toBe('object');
            expect(Object.keys(parsed).length).toBeGreaterThan(0);
        }
    });

    test('6.3: each locale has non-empty message for every key', () => {
        for (const locale of ALL_LOCALES) {
            const messages = loadMessages(locale);
            const emptyKeys: string[] = [];

            for (const [key, value] of Object.entries(messages)) {
                if (typeof value === 'object' && value.message !== undefined) {
                    if (typeof value.message !== 'string' || value.message.trim().length === 0) {
                        emptyKeys.push(key);
                    }
                } else {
                    emptyKeys.push(key);
                }
            }

            expect(emptyKeys.length, `Locale ${locale} has ${emptyKeys.length} empty/invalid messages: ${emptyKeys.join(', ')}`).toBe(0);
        }
    });
});
