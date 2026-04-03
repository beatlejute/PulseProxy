import { Storage } from '../shared/storage';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from '../shared/constants';
import { I18n } from '../shared/i18n';
import { SupportedLanguage, I18nKey, ThemeType } from '../types';
import { showAlert, showConfirm } from './dialog';
import { trackEvent, buildAffiliateUrl } from '../shared/analytics';
import { RemoteConfig } from '../shared/remote-config';

class SettingsService {
    private languageSelect: HTMLSelectElement | null = null;
    private syncToggle: HTMLInputElement | null = null;
    private proxyCheckToggle: HTMLInputElement | null = null;
    private themeToggle: HTMLInputElement | null = null;
    private exportButton: HTMLButtonElement | null = null;
    private importButton: HTMLButtonElement | null = null;
    private importFileInput: HTMLInputElement | null = null;

    async init(): Promise<void> {
        // Инициализируем Storage перед использованием
        await Storage.init();
        
        this.languageSelect = document.getElementById('language-select') as HTMLSelectElement;
        this.syncToggle = document.getElementById('sync-toggle') as HTMLInputElement;
        this.proxyCheckToggle = document.getElementById('proxy-check-toggle') as HTMLInputElement;
        this.themeToggle = document.getElementById('theme-toggle') as HTMLInputElement;
        this.exportButton = document.getElementById('export-button') as HTMLButtonElement;
        this.importButton = document.getElementById('import-button') as HTMLButtonElement;
        this.importFileInput = document.getElementById('import-file-input') as HTMLInputElement;

        this.initLanguageSelector();
        await this.initSyncToggle();
        await this.initProxyCheckToggle();
        await this.initThemeToggle();
        this.initImportExport();
        this.initVersion();
        this.initAffiliateLinkHandlers();
    }

    private initAffiliateLinkHandlers(): void {
        document.querySelectorAll<HTMLAnchorElement>('.promo-link.referral-link').forEach(link => {
            link.addEventListener('click', (e) => this.handleAffiliateLinkClick(e));
        });
    }

    private async handleAffiliateLinkClick(e: Event): Promise<void> {
        e.preventDefault();
        const link = e.currentTarget as HTMLAnchorElement;
        const url = RemoteConfig.referralLink;
        
        if (url && url !== '#') {
            const fullUrl = buildAffiliateUrl(url, 'settings');
            const provider = this.extractProviderFromUrl(url);
            
            await trackEvent('affiliate_link_clicked', {
                provider,
                placement: 'settings',
                link_url: fullUrl
            });
            
            chrome.tabs.create({ url: fullUrl });
        }
    }

    private extractProviderFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.replace(/^www\./, '');
            return hostname.split('.')[0];
        } catch {
            return 'unknown';
        }
    }

    private initLanguageSelector(): void {
        if (!this.languageSelect) return;

        // Заполняем селектор языками
        SUPPORTED_LANGUAGES.forEach((lang) => {
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = LANGUAGE_NAMES[lang];
            this.languageSelect!.appendChild(option);
        });

        // Устанавливаем текущий язык
        this.languageSelect.value = I18n.getCurrentLanguage();

        // Обработчик изменения языка
        this.languageSelect.addEventListener('change', async () => {
            const newLang = this.languageSelect!.value as SupportedLanguage;
            await I18n.setLanguage(newLang);
            I18n.applyTranslations();
        });
    }

    private async initSyncToggle(): Promise<void> {
        if (!this.syncToggle) return;

        // Загружаем текущее состояние синхронизации
        const syncEnabled = await Storage.getSyncEnabled();
        this.syncToggle.checked = syncEnabled;

        // Обработчик изменения
        this.syncToggle.addEventListener('change', async () => {
            const enabled = this.syncToggle!.checked;
            
            // Запрашиваем подтверждение
            const confirmMessage = enabled
                ? I18n.getMessage('syncEnableConfirm')
                : I18n.getMessage('syncDisableConfirm');
            
            const confirmed = await showConfirm(confirmMessage);
            if (!confirmed) {
                // Отменяем изменение
                this.syncToggle!.checked = !enabled;
                return;
            }

            try {
                await Storage.setSyncEnabled(enabled);
                console.log('Settings: Sync', enabled ? 'enabled' : 'disabled');
            } catch (error) {
                console.error('Settings: Failed to change sync state:', error);
                // Откатываем UI при ошибке
                this.syncToggle!.checked = !enabled;
                await showAlert(error instanceof Error ? error.message : 'Failed to change sync state');
            }
        });
    }

    private async initProxyCheckToggle(): Promise<void> {
        if (!this.proxyCheckToggle) return;

        const proxyCheckEnabled = await Storage.getProxyCheckEnabled();
        this.proxyCheckToggle.checked = proxyCheckEnabled;

        this.proxyCheckToggle.addEventListener('change', async () => {
            const enabled = this.proxyCheckToggle!.checked;
            await Storage.setProxyCheckEnabled(enabled);
        });
    }

    private async initThemeToggle(): Promise<void> {
        if (!this.themeToggle) return;

        const currentTheme = await Storage.getTheme();
        this.themeToggle.checked = currentTheme === 'dark';
        this.applyThemeClass(currentTheme);

        this.themeToggle.addEventListener('change', async () => {
            const newTheme = this.themeToggle!.checked ? 'dark' : 'light';
            await Storage.setTheme(newTheme);
            this.applyThemeClass(newTheme);
        });
    }

    private applyThemeClass(theme: ThemeType): void {
        if (theme === 'dark') {
            document.body.classList.add('theme-dark');
            document.body.classList.remove('theme-light');
        } else {
            document.body.classList.add('theme-light');
            document.body.classList.remove('theme-dark');
        }
    }

    private initVersion(): void {
        const versionEl = document.getElementById('version-number');
        if (versionEl) {
            versionEl.textContent = chrome.runtime.getManifest().version;
        }
    }

    private initImportExport(): void {
        // Экспорт
        this.exportButton?.addEventListener('click', async () => {
            await this.handleExport();
        });

        // Импорт - открытие диалога выбора файла
        this.importButton?.addEventListener('click', () => {
            this.importFileInput?.click();
        });

        // Обработка выбранного файла
        this.importFileInput?.addEventListener('change', async (event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];
            if (file) {
                await this.handleImport(file);
                target.value = ''; // Сброс для возможности повторного выбора
            }
        });
    }

    private async handleExport(): Promise<void> {
        try {
            const exportData = await Storage.exportAllData();
            const jsonString = JSON.stringify(exportData, null, 2);
            
            // Создание и скачивание файла
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const timestamp = new Date().toISOString().slice(0, 10);
            const filename = `pulseproxy-settings-${timestamp}.json`;
            
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('Settings: Export completed');
        } catch (error) {
            console.error('Settings: Export failed:', error);
            await showAlert(I18n.getMessage('exportError'));
        }
    }

    private async handleImport(file: File): Promise<void> {
        try {
            const jsonString = await file.text();
            
            // Валидация
            const validation = Storage.validateImportData(jsonString);
            
            if (!validation.valid) {
                const errorMessages = validation.errors
                    .map(e => I18n.getMessage(e as I18nKey))
                    .join('\n');
                await showAlert(I18n.getMessage('importValidationError') + '\n' + errorMessages);
                return;
            }
            
            // Предупреждения
            if (validation.warnings.length > 0) {
                // Проверяем наличие предупреждения о новой версии
                const newerVersionIndex = validation.warnings.indexOf('newerVersion');
                if (newerVersionIndex !== -1) {
                    // Показываем специальный диалог для новой версии
                    const confirmed = await showConfirm(
                        I18n.getMessage('newerVersionConfirm'),
                        {
                            okText: I18n.getMessage('continue'),
                            cancelText: I18n.getMessage('cancel')
                        }
                    );
                    if (!confirmed) {
                        return;
                    }
                    // Удаляем это предупреждение из массива, чтобы не дублировать
                    validation.warnings.splice(newerVersionIndex, 1);
                }

                // Остальные предупреждения выводим в консоль
                if (validation.warnings.length > 0) {
                    const warningMessages = validation.warnings
                        .map(w => I18n.getMessage(w as I18nKey))
                        .join('\n');
                    console.warn('Settings: Import warnings:', warningMessages);
                }
            }
            
            // Подтверждение импорта
            const confirmMessage = I18n.getMessage('importConfirm');
            const confirmed = await showConfirm(confirmMessage);
            if (!confirmed) {
                return;
            }
            
            // Импорт данных
            await Storage.importAllData(validation.data!, 'replace');
            
            // Уведомление об успехе
            await showAlert(I18n.getMessage('importSuccess'));
            
            // Перезагрузка страницы для применения новых настроек
            window.location.reload();
        } catch (error) {
            console.error('Settings: Import failed:', error);
            await showAlert(I18n.getMessage('importValidationError'));
        }
    }

    private showSaveSuccess(button: HTMLButtonElement | null): void {
        if (!button) return;

        const originalText = button.textContent;
        button.textContent = I18n.getMessage('statusSaved');
        button.classList.add('success');

        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('success');
        }, 1500);
    }
}

export const Settings = new SettingsService();