import { Storage } from './storage';
import { SupportedLanguage, I18nKey } from '../types';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from './constants';

interface MessageEntry {
    message: string;
    description?: string;
}

type MessagesData = Record<string, MessageEntry>;

class I18nService {
    private currentLanguage: SupportedLanguage = DEFAULT_LANGUAGE;
    private messages: MessagesData = {};

    async init(): Promise<void> {
        // Загрузить сохранённый язык или определить по браузеру
        const savedLang = await Storage.getLanguage();
        this.currentLanguage = savedLang || this.detectBrowserLanguage();
        // Загрузить переводы для текущего языка
        await this.loadMessages(this.currentLanguage);
    }

    private detectBrowserLanguage(): SupportedLanguage {
        const browserLang = chrome.i18n.getUILanguage().split('-')[0];
        return SUPPORTED_LANGUAGES.includes(browserLang as SupportedLanguage)
            ? (browserLang as SupportedLanguage)
            : DEFAULT_LANGUAGE;
    }

    private async loadMessages(lang: SupportedLanguage): Promise<void> {
        try {
            const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
            const response = await fetch(url);
            this.messages = await response.json();
            console.log(`I18n: Loaded messages for language: ${lang}`);
        } catch (error) {
            console.error(`I18n: Failed to load messages for ${lang}:`, error);
            // Fallback к дефолтному языку
            if (lang !== DEFAULT_LANGUAGE) {
                await this.loadMessages(DEFAULT_LANGUAGE);
            }
        }
    }

    async setLanguage(lang: SupportedLanguage): Promise<void> {
        this.currentLanguage = lang;
        await Storage.setLanguage(lang);
        await this.loadMessages(lang);
    }

    getMessage(key: I18nKey, substitutions?: string[]): string {
        // Используем загруженные переводы
        const entry = this.messages[key];
        if (!entry?.message) return key;
        
        let message = entry.message;
        
        // Поддержка placeholders ($1, $2, ... и именованных типа $COUNT$)
        if (substitutions && substitutions.length > 0) {
            substitutions.forEach((sub, index) => {
                // Заменяем $1, $2, и т.д.
                message = message.replace(new RegExp(`\\$${index + 1}`, 'g'), sub);
            });
            // Также заменяем именованные placeholders если они совпадают с первой подстановкой
            if (substitutions[0]) {
                message = message.replace(/\$COUNT\$/g, substitutions[0]);
            }
        }
        
        return message;
    }

    applyTranslations(): void {
        // Обработка data-i18n атрибутов для текста
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n') as I18nKey;
            el.textContent = this.getMessage(key);
        });

        // Обработка data-i18n-placeholder атрибутов для placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder') as I18nKey;
            (el as HTMLInputElement).placeholder = this.getMessage(key);
        });
    }

    getCurrentLanguage(): SupportedLanguage {
        return this.currentLanguage;
    }
}

export const I18n = new I18nService();