import { I18n } from '../shared/i18n';
import { PresetTemplate, PresetTemplatesResponse } from '../types';
import { fetchWithFallback } from '../shared/fetch-with-fallback';
import { ModalHelper } from './modal-helper';

const PRESET_TEMPLATES_PRIMARY_URL = 'https://raw.githubusercontent.com/beatlejute/PulseProxy/refs/heads/main/sources/presets.json';
const PRESET_TEMPLATES_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/beatlejute/PulseProxy@master/sources/presets.json';

export function showPresetTypeDialog(
    onCreateOwn: () => void,
    onShowTemplates: () => void
): void {
    const { body, closeModal, build } = ModalHelper.createSimple(
        I18n.getMessage('presetTypeDialogTitle'),
        'preset-type-modal',
        'presets'
    );

    const options = document.createElement('div');
    options.className = 'preset-type-options';

    const customOption = document.createElement('button');
    customOption.className = 'preset-type-option';
    const customOptionIcon = document.createElement('span');
    customOptionIcon.className = 'option-icon';
    customOptionIcon.textContent = '✏️';
    const customOptionText = document.createElement('span');
    customOptionText.className = 'option-text';
    customOptionText.textContent = I18n.getMessage('presetTypeCreateOwn');
    customOption.appendChild(customOptionIcon);
    customOption.appendChild(customOptionText);
    customOption.addEventListener('click', () => {
        closeModal();
        onCreateOwn();
    });

    const templateOption = document.createElement('button');
    templateOption.className = 'preset-type-option';
    const templateOptionIcon = document.createElement('span');
    templateOptionIcon.className = 'option-icon';
    templateOptionIcon.textContent = '📋';
    const templateOptionText = document.createElement('span');
    templateOptionText.className = 'option-text';
    templateOptionText.textContent = I18n.getMessage('presetTypeSelectPreset');
    templateOption.appendChild(templateOptionIcon);
    templateOption.appendChild(templateOptionText);
    templateOption.addEventListener('click', () => {
        closeModal();
        onShowTemplates();
    });

    options.appendChild(customOption);
    options.appendChild(templateOption);
    body.appendChild(options);

    build();
}

export async function showPresetTemplatesModal(
    onCreateFromTemplate: (template: PresetTemplate) => Promise<void>
): Promise<void> {
    const { body, closeModal, build } = ModalHelper.create({
        title: I18n.getMessage('presetListTitle'),
        modalClass: 'preset-templates-modal',
        fullHeight: true,
        column: 'presets'
    });

    const searchContainer = document.createElement('div');
    searchContainer.className = 'preset-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'preset-search-input';
    searchInput.placeholder = I18n.getMessage('presetSearchPlaceholder');
    searchContainer.appendChild(searchInput);

    const listContainer = document.createElement('div');
    listContainer.className = 'preset-templates-list';

    const loadingState = document.createElement('div');
    loadingState.className = 'loading-state';
    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'spinner';
    const loadingText = document.createElement('span');
    loadingText.textContent = I18n.getMessage('presetListLoading');
    loadingState.appendChild(loadingSpinner);
    loadingState.appendChild(loadingText);

    const errorState = document.createElement('div');
    errorState.className = 'error-state';
    errorState.style.display = 'none';
    const errorText = document.createElement('span');
    errorText.textContent = I18n.getMessage('presetListError');
    const errorRetryBtn = document.createElement('button');
    errorRetryBtn.className = 'retry-btn';
    errorRetryBtn.textContent = I18n.getMessage('presetListRetry');
    errorState.appendChild(errorText);
    errorState.appendChild(errorRetryBtn);

    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.style.display = 'none';
    const emptyText = document.createElement('span');
    emptyText.textContent = I18n.getMessage('presetListEmpty');
    emptyState.appendChild(emptyText);

    const templatesContent = document.createElement('div');
    templatesContent.className = 'templates-content';
    templatesContent.style.display = 'none';

    listContainer.appendChild(loadingState);
    listContainer.appendChild(errorState);
    listContainer.appendChild(emptyState);
    listContainer.appendChild(templatesContent);

    body.appendChild(searchContainer);
    body.appendChild(listContainer);

    build();

    let templates: PresetTemplate[] = [];

    const loadTemplates = async () => {
        loadingState.style.display = 'flex';
        errorState.style.display = 'none';
        emptyState.style.display = 'none';
        templatesContent.style.display = 'none';

        try {
            templates = await fetchPresetTemplates();
            loadingState.style.display = 'none';

            if (templates.length === 0) {
                emptyState.style.display = 'block';
            } else {
                templatesContent.style.display = 'flex';
                renderTemplatesList(templatesContent, templates, closeModal, onCreateFromTemplate);
            }
        } catch (error) {
            console.error('Presets: Failed to load templates:', error);
            loadingState.style.display = 'none';
            errorState.style.display = 'flex';
        }
    };

    const retryBtn = errorState.querySelector('.retry-btn');
    retryBtn?.addEventListener('click', loadTemplates);

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        const filtered = filterPresetTemplates(templates, query);

        if (filtered.length === 0) {
            templatesContent.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            templatesContent.style.display = 'flex';
            renderTemplatesList(templatesContent, filtered, closeModal, onCreateFromTemplate);
        }
    });

    await loadTemplates();
}

async function fetchPresetTemplates(): Promise<PresetTemplate[]> {
    const cacheBuster = `?_t=${Date.now()}`;
    const urls = [
        `${PRESET_TEMPLATES_PRIMARY_URL}${cacheBuster}`,
        `${PRESET_TEMPLATES_FALLBACK_URL}${cacheBuster}`,
    ];
    const data = await fetchWithFallback<PresetTemplatesResponse>(urls);
    return data.presets || [];
}

function filterPresetTemplates(templates: PresetTemplate[], query: string): PresetTemplate[] {
    if (!query) return templates;
    const lowerQuery = query.toLowerCase();
    return templates.filter(t => t.name.toLowerCase().includes(lowerQuery));
}

function renderTemplatesList(
    container: HTMLElement,
    templates: PresetTemplate[],
    closeModal: () => void,
    onCreateFromTemplate: (template: PresetTemplate) => Promise<void>
): void {
    container.replaceChildren();

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
            closeModal();
            await onCreateFromTemplate(template);
        });

        container.appendChild(item);
    }
}
