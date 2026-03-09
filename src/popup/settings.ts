import { Storage } from '../shared/storage';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from '../shared/constants';
import { I18n } from '../shared/i18n';
import { SupportedLanguage, I18nKey } from '../types';
import { showAlert, showConfirm } from './dialog';

class SettingsService {
    private languageSelect: HTMLSelectElement | null = null;
    private syncToggle: HTMLInputElement | null = null;
    private exportButton: HTMLButtonElement | null = null;
    private importButton: HTMLButtonElement | null = null;
    private importFileInput: HTMLInputElement | null = null;

    async init(): Promise<void> {
        // Инициализируем Storage перед использованием
        await Storage.init();
        
        this.languageSelect = document.getElementById('language-select') as HTMLSelectElement;
        this.syncToggle = document.getElementById('sync-toggle') as HTMLInputElement;
        this.exportButton = document.getElementById('export-button') as HTMLButtonElement;
        this.importButton = document.getElementById('import-button') as HTMLButtonElement;
        this.importFileInput = document.getElementById('import-file-input') as HTMLInputElement;

        this.initLanguageSelector();
        this.initSyncToggle();
        this.initImportExport();
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
                const warningMessages = validation.warnings
                    .map(w => I18n.getMessage(w as I18nKey))
                    .join('\n');
                console.warn('Settings: Import warnings:', warningMessages);
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