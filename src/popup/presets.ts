import { Storage } from '../shared/storage';
import { I18n } from '../shared/i18n';
import { Preset, ProxyServer, PresetTemplate, PresetTemplatesResponse } from '../types';
import { DEFAULT_PRESET_ID } from '../shared/constants';
import { adjustContainerHeight } from './dom-utils';
import { showAlert, showConfirm } from './dialog';

const PRESET_TEMPLATES_URL = 'https://cdn.jsdelivr.net/gh/beatlejute/PulseProxy@master/sources/presets.json';

class PresetsService {
    private container: HTMLElement | null = null;
    private presetsListEl: HTMLElement | null = null;
    private addPresetBtn: HTMLButtonElement | null = null;
    private draggedElement: HTMLElement | null = null;
    private proxyByDefaultToggle: HTMLButtonElement | null = null;
    private proxyByDefault: boolean = false;

    async init(): Promise<void> {
        this.container = document.getElementById('presets-container');
        this.presetsListEl = document.getElementById('presets-list');
        this.addPresetBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
        this.proxyByDefaultToggle = document.getElementById('proxy-by-default-toggle') as HTMLButtonElement;

        if (this.addPresetBtn) {
            this.addPresetBtn.addEventListener('click', () => this.addNewPreset());
        }

        await this.initProxyByDefaultToggle();
        await this.render();
    }

    private async initProxyByDefaultToggle(): Promise<void> {
        if (!this.proxyByDefaultToggle) return;

        // Загружаем текущее состояние
        this.proxyByDefault = await Storage.getProxyByDefault();
        this.updateToggleState();

        // Обработчик клика
        this.proxyByDefaultToggle.addEventListener('click', async () => {
            const enabled = !this.proxyByDefault;
            
            try {
                await Storage.setProxyByDefault(enabled);
                this.proxyByDefault = enabled;
                this.updateToggleState();
                console.log('Presets: Proxy by default', enabled ? 'enabled' : 'disabled');
                
                // Перерендерим пресеты для показа/скрытия Ignore List
                await this.render();
                
                // Отправляем сообщение для обновления прокси
                chrome.runtime.sendMessage({ action: 'toggleProxy' });
            } catch (error) {
                console.error('Presets: Failed to change proxy by default:', error);
            }
        });
    }

    private updateToggleState(): void {
        if (!this.proxyByDefaultToggle) return;
        
        if (this.proxyByDefault) {
            this.proxyByDefaultToggle.classList.add('active');
        } else {
            this.proxyByDefaultToggle.classList.remove('active');
        }
    }

    async render(): Promise<void> {
        if (!this.presetsListEl) return;

        const presets = await Storage.getPresets();
        console.log('Presets: Rendering presets:', presets);
        this.presetsListEl.innerHTML = '';

        for (const preset of presets) {
            // Ignore List (isDefault) показывается только при proxyByDefault=true
            if (preset.isDefault && !this.proxyByDefault) {
                console.log('Presets: Skipping Ignore List preset (proxyByDefault is false)');
                continue;
            }
            
            console.log('Presets: Creating element for preset:', preset.id, 'name:', preset.name);
            const presetEl = await this.createPresetElement(preset);
            this.presetsListEl!.appendChild(presetEl);
        }
    }

    private async createPresetElement(preset: Preset): Promise<HTMLElement> {
        const presetEl = document.createElement('div');
        presetEl.className = 'preset-item';
        presetEl.setAttribute('data-preset-id', preset.id);

        // Drag handle (только для не-default пресетов)
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        if (preset.isDefault) {
            // Скрываем drag handle для default пресета
            dragHandle.style.visibility = 'hidden';
            dragHandle.style.cursor = 'default';
        } else {
            dragHandle.title = 'Drag to reorder';
        }

        // Checkbox для включения/отключения
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'preset-checkbox';
        checkbox.checked = preset.enabled;
        checkbox.addEventListener('change', () => this.togglePreset(preset.id, checkbox.checked));

        // Header с названием
        const header = document.createElement('div');
        header.className = 'preset-header';

        const nameContainer = document.createElement('div');
        nameContainer.className = 'preset-name-container';

        const nameEl = document.createElement('span');
        nameEl.className = 'preset-name';
        // Для Ignore List используем локализованное имя
        if (preset.isDefault) {
            nameEl.textContent = I18n.getMessage('ignoreListName');
        } else {
            nameEl.textContent = preset.name || 'Preset';
        }
        console.log('Presets: nameEl.textContent =', nameEl.textContent);

        if (preset.isDefault) {
            // Для Ignore List не показываем бейдж "По умолчанию" и не делаем имя редактируемым
            nameContainer.appendChild(nameEl);
        } else {
            // Редактируемое имя для не-default пресетов
            nameEl.contentEditable = 'true';
            nameEl.addEventListener('blur', () => this.updatePresetName(preset.id, nameEl.textContent || ''));
            nameEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    nameEl.blur();
                }
            });
            nameContainer.appendChild(nameEl);
        }

        // Кнопка раскрытия/сворачивания
        const expandBtn = document.createElement('button');
        expandBtn.className = 'preset-expand-btn';
        expandBtn.innerHTML = '▼';
        expandBtn.addEventListener('click', () => this.toggleExpand(presetEl, expandBtn));

        header.appendChild(nameContainer);
        header.appendChild(expandBtn);

        // Контент (домены)
        const content = document.createElement('div');
        content.className = 'preset-content';

        const textarea = document.createElement('textarea');
        textarea.className = 'preset-domains';
        textarea.value = preset.domains.join('\n');
        // Для Ignore List используем специальный placeholder
        textarea.placeholder = preset.isDefault
            ? I18n.getMessage('placeholderIgnoreList')
            : I18n.getMessage('placeholderDomain');

        const buttonsRow = document.createElement('div');
        buttonsRow.className = 'preset-buttons';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-button preset-save-btn';
        saveBtn.textContent = I18n.getMessage('buttonSaveDomains');
        saveBtn.addEventListener('click', () => this.saveDomains(preset.id, textarea, saveBtn));

        buttonsRow.appendChild(saveBtn);

        // Кнопка удаления (только для не-default пресетов)
        if (!preset.isDefault) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-button preset-delete-btn';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = I18n.getMessage('buttonDeletePreset');
            deleteBtn.addEventListener('click', () => this.deletePreset(preset.id));
            buttonsRow.appendChild(deleteBtn);
        }

        // Добавляем selector прокси (не для Ignore List - он всегда DIRECT)
        if (!preset.isDefault) {
            const proxySelector = await this.createProxyDropdown(preset);
            content.appendChild(proxySelector);
        }
        
        content.appendChild(textarea);
        content.appendChild(buttonsRow);

        // Строка с drag handle, checkbox и header
        const row = document.createElement('div');
        row.className = 'preset-row';
        row.appendChild(dragHandle);
        row.appendChild(checkbox);
        row.appendChild(header);

        // Собираем элемент
        presetEl.appendChild(row);
        presetEl.appendChild(content);

        // Инициализируем Drag & Drop (только для не-default пресетов)
        if (!preset.isDefault) {
            this.initDragAndDrop(presetEl, preset.id);
        }

        return presetEl;
    }

    private initDragAndDrop(presetElement: HTMLElement, presetId: string): void {
        const dragHandle = presetElement.querySelector('.drag-handle');

        // Делаем элемент draggable только при захвате за handle
        dragHandle?.addEventListener('mousedown', () => {
            presetElement.draggable = true;
        });

        presetElement.addEventListener('dragstart', (e) => {
            this.draggedElement = presetElement;
            presetElement.classList.add('dragging');
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', presetId);
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        presetElement.addEventListener('dragend', () => {
            presetElement.draggable = false;
            presetElement.classList.remove('dragging');
            this.draggedElement = null;
            // Убираем все индикаторы drop-зоны
            document.querySelectorAll('.preset-item').forEach(el => {
                el.classList.remove('drop-above', 'drop-below');
            });
        });

        presetElement.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (this.draggedElement && this.draggedElement !== presetElement) {
                const rect = presetElement.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    presetElement.classList.add('drop-above');
                    presetElement.classList.remove('drop-below');
                } else {
                    presetElement.classList.add('drop-below');
                    presetElement.classList.remove('drop-above');
                }
            }
        });

        presetElement.addEventListener('dragleave', () => {
            presetElement.classList.remove('drop-above', 'drop-below');
        });

        presetElement.addEventListener('drop', async (e) => {
            e.preventDefault();
            presetElement.classList.remove('drop-above', 'drop-below');

            if (this.draggedElement && this.draggedElement !== presetElement) {
                await this.handleReorder(this.draggedElement, presetElement, e.clientY);
            }
        });
    }

    private async handleReorder(dragged: HTMLElement, target: HTMLElement, clientY: number): Promise<void> {
        const container = dragged.parentElement;
        if (!container) return;

        // Определяем позицию вставки
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = clientY < midY;

        // Перемещаем в DOM
        if (insertBefore) {
            container.insertBefore(dragged, target);
        } else {
            container.insertBefore(dragged, target.nextSibling);
        }

        // Собираем новый порядок
        const orderedIds = Array.from(container.querySelectorAll('.preset-item'))
            .map(el => el.getAttribute('data-preset-id'))
            .filter(Boolean) as string[];

        // Сохраняем в storage
        await Storage.reorderPresets(orderedIds);
    }

    private toggleExpand(presetEl: HTMLElement, expandBtn: HTMLButtonElement): void {
        const content = presetEl.querySelector('.preset-content');
        if (content) {
            const isExpanded = content.classList.contains('expanded');
            content.classList.toggle('expanded', !isExpanded);
            expandBtn.innerHTML = isExpanded ? '▼' : '▲';
            expandBtn.classList.toggle('rotated', !isExpanded);
        }
    }

    private async togglePreset(id: string, enabled: boolean): Promise<void> {
        await Storage.setPresetEnabled(id, enabled);
        console.log('Presets: Toggled preset', id, 'to', enabled);
    }

    private async updatePresetName(id: string, name: string): Promise<void> {
        const trimmedName = name.trim();
        if (!trimmedName) return;

        await Storage.updatePreset(id, { name: trimmedName });
        console.log('Presets: Updated preset name', id, 'to', trimmedName);
    }

    private async saveDomains(id: string, textarea: HTMLTextAreaElement, saveBtn: HTMLButtonElement): Promise<void> {
        const domainsText = textarea.value.trim();
        const domains = domainsText
            .split('\n')
            .map(d => d.trim())
            .filter(d => d.length > 0);

        await Storage.updatePreset(id, { domains });
        console.log('Presets: Saved domains for preset', id, domains);

        // Показываем успех
        const originalText = saveBtn.textContent;
        saveBtn.textContent = I18n.getMessage('statusSaved');
        saveBtn.classList.add('success');

        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.classList.remove('success');
        }, 1500);
    }

    private async addNewPreset(): Promise<void> {
        this.showPresetTypeDialog();
    }

    private showPresetTypeDialog(): void {
        // Создаём оверлей
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        // Создаём модальное окно
        const modal = document.createElement('div');
        modal.className = 'modal preset-type-modal';

        // Функция закрытия оверлея
        const closeOverlay = () => {
            overlay.remove();
            adjustContainerHeight();
        };

        // Заголовок
        const header = document.createElement('div');
        header.className = 'modal-header';
        
        const title = document.createElement('h3');
        title.textContent = I18n.getMessage('presetTypeDialogTitle');
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', closeOverlay);
        
        header.appendChild(title);
        header.appendChild(closeBtn);

        // Тело модального окна
        const body = document.createElement('div');
        body.className = 'modal-body';

        const options = document.createElement('div');
        options.className = 'preset-type-options';

        // Кнопка "Создать свой"
        const customOption = document.createElement('button');
        customOption.className = 'preset-type-option';
        customOption.innerHTML = `
            <span class="option-icon">✏️</span>
            <span class="option-text">${I18n.getMessage('presetTypeCreateOwn')}</span>
        `;
        customOption.addEventListener('click', () => {
            closeOverlay();
            this.createEmptyPreset();
        });

        // Кнопка "Выбрать из предустановленных"
        const templateOption = document.createElement('button');
        templateOption.className = 'preset-type-option';
        templateOption.innerHTML = `
            <span class="option-icon">📋</span>
            <span class="option-text">${I18n.getMessage('presetTypeSelectPreset')}</span>
        `;
        templateOption.addEventListener('click', () => {
            closeOverlay();
            this.showPresetTemplatesModal();
        });

        options.appendChild(customOption);
        options.appendChild(templateOption);
        body.appendChild(options);

        modal.appendChild(header);
        modal.appendChild(body);
        overlay.appendChild(modal);

        // Закрытие по клику на оверлей
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeOverlay();
            }
        });

        document.body.appendChild(overlay);
        adjustContainerHeight();
    }

    private async createEmptyPreset(): Promise<void> {
        const presets = await Storage.getPresets();
        const newName = `Preset ${presets.length}`;

        const newPreset = await Storage.addPreset({
            name: newName,
            domains: [],
            enabled: true,
            isDefault: false,
            order: presets.length,
            proxyId: null,
        });

        console.log('Presets: Added new preset', newPreset);
        await this.render();

        // Раскрываем новый пресет и фокусируемся на имени
        this.expandAndFocusPreset(newPreset.id);
    }

    private expandAndFocusPreset(presetId: string): void {
        const newEl = this.presetsListEl?.querySelector(`[data-preset-id="${presetId}"]`);
        if (newEl) {
            const content = newEl.querySelector('.preset-content');
            const expandBtn = newEl.querySelector('.preset-expand-btn') as HTMLButtonElement;
            if (content && expandBtn) {
                content.classList.add('expanded');
                expandBtn.innerHTML = '▲';
                expandBtn.classList.add('rotated');
            }
            const nameEl = newEl.querySelector('.preset-name') as HTMLElement;
            if (nameEl) {
                nameEl.focus();
                // Выделяем весь текст
                const range = document.createRange();
                range.selectNodeContents(nameEl);
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
        }
    }

    private async showPresetTemplatesModal(): Promise<void> {
        // Создаём оверлей
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        // Создаём модальное окно
        const modal = document.createElement('div');
        modal.className = 'modal preset-templates-modal';

        // Функция закрытия оверлея
        const closeOverlay = () => {
            overlay.remove();
            adjustContainerHeight();
        };

        // Заголовок
        const header = document.createElement('div');
        header.className = 'modal-header';
        
        const title = document.createElement('h3');
        title.textContent = I18n.getMessage('presetListTitle');
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', closeOverlay);
        
        header.appendChild(title);
        header.appendChild(closeBtn);

        // Тело модального окна
        const body = document.createElement('div');
        body.className = 'modal-body';

        // Поле поиска
        const searchContainer = document.createElement('div');
        searchContainer.className = 'preset-search';
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'preset-search-input';
        searchInput.placeholder = I18n.getMessage('presetSearchPlaceholder');
        
        searchContainer.appendChild(searchInput);

        // Список пресетов
        const listContainer = document.createElement('div');
        listContainer.className = 'preset-templates-list';

        // Состояние загрузки
        const loadingState = document.createElement('div');
        loadingState.className = 'loading-state';
        loadingState.innerHTML = `
            <div class="spinner"></div>
            <span>${I18n.getMessage('presetListLoading')}</span>
        `;

        // Состояние ошибки
        const errorState = document.createElement('div');
        errorState.className = 'error-state';
        errorState.style.display = 'none';
        errorState.innerHTML = `
            <span>${I18n.getMessage('presetListError')}</span>
            <button class="retry-btn">${I18n.getMessage('presetListRetry')}</button>
        `;

        // Пустое состояние
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.style.display = 'none';
        emptyState.innerHTML = `<span>${I18n.getMessage('presetListEmpty')}</span>`;

        // Контент списка
        const templatesContent = document.createElement('div');
        templatesContent.className = 'templates-content';
        templatesContent.style.display = 'none';

        listContainer.appendChild(loadingState);
        listContainer.appendChild(errorState);
        listContainer.appendChild(emptyState);
        listContainer.appendChild(templatesContent);

        body.appendChild(searchContainer);
        body.appendChild(listContainer);

        modal.appendChild(header);
        modal.appendChild(body);
        overlay.appendChild(modal);

        // Закрытие по клику на оверлей
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeOverlay();
            }
        });

        document.body.appendChild(overlay);
        adjustContainerHeight();

        // Загружаем пресеты
        let templates: PresetTemplate[] = [];

        const loadTemplates = async () => {
            loadingState.style.display = 'flex';
            errorState.style.display = 'none';
            emptyState.style.display = 'none';
            templatesContent.style.display = 'none';

            try {
                templates = await this.fetchPresetTemplates();
                loadingState.style.display = 'none';

                if (templates.length === 0) {
                    emptyState.style.display = 'block';
                } else {
                    templatesContent.style.display = 'flex';
                    this.renderTemplatesList(templatesContent, templates, overlay);
                }
            } catch (error) {
                console.error('Presets: Failed to load templates:', error);
                loadingState.style.display = 'none';
                errorState.style.display = 'flex';
            }
        };

        // Обработчик кнопки "Повторить"
        const retryBtn = errorState.querySelector('.retry-btn');
        retryBtn?.addEventListener('click', loadTemplates);

        // Обработчик поиска
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            const filtered = this.filterPresetTemplates(templates, query);
            
            if (filtered.length === 0) {
                templatesContent.style.display = 'none';
                emptyState.style.display = 'block';
            } else {
                emptyState.style.display = 'none';
                templatesContent.style.display = 'flex';
                this.renderTemplatesList(templatesContent, filtered, overlay);
            }
        });

        // Запускаем загрузку
        await loadTemplates();
    }

    private async fetchPresetTemplates(): Promise<PresetTemplate[]> {
        const response = await fetch(PRESET_TEMPLATES_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: PresetTemplatesResponse = await response.json();
        return data.presets || [];
    }

    private filterPresetTemplates(templates: PresetTemplate[], query: string): PresetTemplate[] {
        if (!query) return templates;
        const lowerQuery = query.toLowerCase();
        return templates.filter(t => t.name.toLowerCase().includes(lowerQuery));
    }

    private renderTemplatesList(container: HTMLElement, templates: PresetTemplate[], overlay: HTMLElement): void {
        container.innerHTML = '';

        for (const template of templates) {
            const item = document.createElement('div');
            item.className = 'preset-template-item';
            item.setAttribute('data-preset-name', template.name);

            const nameEl = document.createElement('span');
            nameEl.className = 'template-name';
            nameEl.textContent = template.name;

            const countEl = document.createElement('span');
            countEl.className = 'template-domains-count';
            countEl.textContent = I18n.getMessage('presetDomainsCount', [template.domains.length.toString()]);

            item.appendChild(nameEl);
            item.appendChild(countEl);

            item.addEventListener('click', async () => {
                overlay.remove();
                adjustContainerHeight();
                await this.createPresetFromTemplate(template);
            });

            container.appendChild(item);
        }
    }

    private async createPresetFromTemplate(template: PresetTemplate): Promise<void> {
        const presets = await Storage.getPresets();

        const newPreset = await Storage.addPreset({
            name: template.name,
            domains: [...template.domains],
            enabled: true,
            isDefault: false,
            order: presets.length,
            proxyId: null,
        });

        console.log('Presets: Created preset from template', template.name, newPreset);
        await this.render();

        // Раскрываем новый пресет
        this.expandAndFocusPreset(newPreset.id);
    }

    private async createProxyDropdown(preset: Preset): Promise<HTMLElement> {
        const proxies = await Storage.getProxies();
        const defaultProxy = proxies.find(p => p.isDefault);
        
        const container = document.createElement('div');
        container.className = 'preset-proxy-selector';
        
        const label = document.createElement('label');
        label.textContent = I18n.getMessage('labelSelectProxy');
        
        const select = document.createElement('select');
        select.className = 'proxy-select';
        
        // Опция "По умолчанию"
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        const defaultProxyLabel = defaultProxy
            ? (defaultProxy.name || `${defaultProxy.host}:${defaultProxy.port}`)
            : null;
        defaultOption.textContent = defaultProxyLabel
            ? `${I18n.getMessage('proxyDefault')} (${defaultProxyLabel})`
            : I18n.getMessage('proxyNone');
        if (!preset.proxyId) {
            defaultOption.selected = true;
        }
        select.appendChild(defaultOption);
        
        // Остальные прокси (исключаем дефолтный, так как он уже показан в опции "По умолчанию")
        proxies
            .filter(proxy => !proxy.isDefault)
            .forEach(proxy => {
                const option = document.createElement('option');
                option.value = proxy.id;
                option.textContent = proxy.name || `${proxy.type.toUpperCase()}://${proxy.host}:${proxy.port}`;
                if (preset.proxyId === proxy.id) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        
        select.addEventListener('change', () => this.updatePresetProxy(preset.id, select.value || null));
        
        container.appendChild(label);
        container.appendChild(select);
        return container;
    }

    private async updatePresetProxy(presetId: string, proxyId: string | null): Promise<void> {
        await Storage.setPresetProxy(presetId, proxyId);
        console.log('Presets: Updated proxy for preset', presetId, 'to', proxyId);
    }

    private async deletePreset(id: string): Promise<void> {
        const confirmMessage = I18n.getMessage('confirmDeletePreset');
        const confirmed = await showConfirm(confirmMessage);
        if (!confirmed) return;

        try {
            await Storage.deletePreset(id);
            console.log('Presets: Deleted preset', id);
            await this.render();
        } catch (error) {
            console.error('Presets: Failed to delete preset:', error);
            await showAlert(error instanceof Error ? error.message : 'Failed to delete preset');
        }
    }
}

export const Presets = new PresetsService();