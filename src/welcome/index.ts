import { Storage } from '../shared/storage';

/**
 * Логика приветственной страницы (welcome.html, открывается при установке).
 * «Начать» разворачивает выбор из четырёх сценариев:
 *  - мастер настройки  → popup.html?view=page&tour=1 (обучение по шагам)
 *  - синхронизация     → включает sync и забирает настройки из облака
 *  - импорт            → файл настроек через file picker (клик = user gesture)
 *  - пропустить        → закрывает вкладку
 *
 * Тексты — через chrome.i18n (страница статична, язык браузера).
 */

export const PAGE_VIEW_URL = 'popup.html?view=page';
export const TOUR_URL = 'popup.html?view=page&tour=1';

/** Пауза перед переходом на страницу настроек — успеть прочитать статус */
const REDIRECT_DELAY_MS = 1500;

/**
 * Обёртка навигации: jsdom не реализует переход по location.href,
 * тесты подменяют методы через jest.spyOn.
 */
export const nav = {
    go(url: string): void {
        window.location.href = url;
    },
    close(): void {
        window.close();
    },
};

function msg(key: string, substitutions?: string[]): string {
    return chrome.i18n.getMessage(key, substitutions) || key;
}

function applyTranslations(): void {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        const message = chrome.i18n.getMessage(key);
        if (message) el.textContent = message;
    });
}

function setStatus(text: string, kind: 'progress' | 'success' | 'error'): void {
    const status = document.getElementById('welcome-status');
    if (!status) return;
    status.textContent = text;
    status.className = `welcome-status welcome-status--${kind}`;
}

function setOptionsDisabled(disabled: boolean): void {
    document.querySelectorAll<HTMLButtonElement>('.welcome-option').forEach(btn => {
        btn.disabled = disabled;
    });
}

function showOptions(): void {
    document.querySelector<HTMLElement>('.steps')?.style.setProperty('display', 'none');
    document.querySelector<HTMLElement>('.welcome-button')?.style.setProperty('display', 'none');
    document.querySelector<HTMLElement>('.welcome-options')?.classList.add('visible');
}

function scheduleRedirect(): void {
    window.setTimeout(() => nav.go(PAGE_VIEW_URL), REDIRECT_DELAY_MS);
}

async function enableSync(): Promise<void> {
    setOptionsDisabled(true);
    setStatus('…', 'progress');
    try {
        await Storage.init();
        const stats = await Storage.setSyncEnabled(true);
        const text = stats
            ? msg('syncEnabledStats', [String(stats.received), String(stats.added)])
            : msg('syncEnabled');
        setStatus(text, 'success');
        scheduleRedirect();
    } catch (error) {
        // Локализованный заголовок + техническая деталь для диагностики
        const detail = error instanceof Error ? `\n${error.message}` : '';
        setStatus(msg('welcomeSyncError') + detail, 'error');
        setOptionsDisabled(false);
    }
}

async function importSettings(file: File): Promise<void> {
    setOptionsDisabled(true);
    setStatus('…', 'progress');
    try {
        await Storage.init();
        const jsonString = await file.text();
        const validation = Storage.validateImportData(jsonString);
        if (!validation.valid) {
            const errors = validation.errors.map(e => msg(e)).join('\n');
            setStatus(`${msg('importValidationError')}\n${errors}`, 'error');
            setOptionsDisabled(false);
            return;
        }
        await Storage.importAllData(validation.data!, 'replace');
        setStatus(msg('importSuccess'), 'success');
        scheduleRedirect();
    } catch (error) {
        console.error('Welcome: import failed:', error);
        setStatus(msg('importValidationError'), 'error');
        setOptionsDisabled(false);
    }
}

export function initWelcome(): void {
    applyTranslations();

    document.querySelector<HTMLButtonElement>('.welcome-button')
        ?.addEventListener('click', () => showOptions());

    document.getElementById('welcome-option-wizard')
        ?.addEventListener('click', () => nav.go(TOUR_URL));

    document.getElementById('welcome-option-skip')
        ?.addEventListener('click', () => nav.close());

    document.getElementById('welcome-option-sync')
        ?.addEventListener('click', () => void enableSync());

    const importInput = document.getElementById('welcome-import-input') as HTMLInputElement | null;
    document.getElementById('welcome-option-import')
        // Клик по кнопке — user gesture: file picker разрешено открывать только из него
        ?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', () => {
        const file = importInput.files?.[0];
        // Сброс value: change не сработает при повторном выборе того же файла
        importInput.value = '';
        if (file) void importSettings(file);
    });
}

// Автозапуск: скрипт подключён в конце body, DOM уже разобран
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initWelcome());
} else {
    initWelcome();
}
