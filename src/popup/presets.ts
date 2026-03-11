import { Storage } from '../shared/storage';
import { I18n } from '../shared/i18n';
import { Preset, PresetTemplate, ProxyServer } from '../types';
import { adjustContainerHeight } from './dom-utils';
import { showAlert, showConfirm } from './dialog';
import { showPresetTypeDialog, showPresetTemplatesModal } from './preset-dialogs';
import { PresetDragController } from './preset-drag';
import { createProxyDropdown } from './preset-proxy-dropdown';

class PresetsService {
    private container: HTMLElement | null = null;
    private presetsListEl: HTMLElement | null = null;
    private addPresetBtn: HTMLButtonElement | null = null;
    private proxyByDefaultToggle: HTMLButtonElement | null = null;
    private proxyByDefault: boolean = false;
    private readonly dragController = new PresetDragController();

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

        this.proxyByDefault = await Storage.getProxyByDefault();
        this.updateToggleState();

        this.proxyByDefaultToggle.addEventListener('click', async () => {
            const enabled = !this.proxyByDefault;

            try {
                await Storage.setProxyByDefault(enabled);
                this.proxyByDefault = enabled;
                this.updateToggleState();
                console.log('Presets: Proxy by default', enabled ? 'enabled' : 'disabled');

                await this.render();

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
        const proxies = await Storage.getProxies();
        console.log('Presets: Rendering presets:', presets);

        // DocumentFragment для batch DOM-обновлений (устраняет layout thrashing)
        const fragment = document.createDocumentFragment();

        for (const preset of presets) {
            if (preset.isDefault && !this.proxyByDefault) {
                console.log('Presets: Skipping Ignore List preset (proxyByDefault is false)');
                continue;
            }

            console.log('Presets: Creating element for preset:', preset.id, 'name:', preset.name);
            const presetEl = await this.createPresetElement(preset, proxies);
            fragment.appendChild(presetEl);
        }

        this.presetsListEl.replaceChildren(fragment);
    }

    private async createPresetElement(preset: Preset, proxies: ProxyServer[]): Promise<HTMLElement> {
        const presetEl = document.createElement('div');
        presetEl.className = 'preset-item';
        presetEl.setAttribute('data-preset-id', preset.id);

        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        if (preset.isDefault) {
            dragHandle.style.visibility = 'hidden';
            dragHandle.style.cursor = 'default';
        } else {
            dragHandle.title = 'Drag to reorder';
        }

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'preset-checkbox';
        checkbox.checked = preset.enabled;
        checkbox.addEventListener('change', () => this.togglePreset(preset.id, checkbox.checked));

        const header = document.createElement('div');
        header.className = 'preset-header';

        const nameContainer = document.createElement('div');
        nameContainer.className = 'preset-name-container';

        const nameEl = document.createElement('span');
        nameEl.className = 'preset-name';
        if (preset.isDefault) {
            nameEl.textContent = I18n.getMessage('ignoreListName');
        } else {
            nameEl.textContent = preset.name || 'Preset';
        }
        console.log('Presets: nameEl.textContent =', nameEl.textContent);

        if (preset.isDefault) {
            nameContainer.appendChild(nameEl);
        } else {
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

        const expandBtn = document.createElement('button');
        expandBtn.className = 'preset-expand-btn';
        expandBtn.textContent = '▼';
        expandBtn.addEventListener('click', () => this.toggleExpand(presetEl, expandBtn));

        header.appendChild(nameContainer);
        header.appendChild(expandBtn);

        const content = document.createElement('div');
        content.className = 'preset-content';

        const textarea = document.createElement('textarea');
        textarea.className = 'preset-domains';
        textarea.value = preset.domains.join('\n');
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

        if (!preset.isDefault) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-button preset-delete-btn';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = I18n.getMessage('buttonDeletePreset');
            deleteBtn.addEventListener('click', () => this.deletePreset(preset.id));
            buttonsRow.appendChild(deleteBtn);
        }

        if (!preset.isDefault) {
            const proxySelector = await createProxyDropdown(preset, proxies, (proxyId) => {
                this.updatePresetProxy(preset.id, proxyId);
            });
            content.appendChild(proxySelector);
        }

        content.appendChild(textarea);
        content.appendChild(buttonsRow);

        const row = document.createElement('div');
        row.className = 'preset-row';
        row.appendChild(dragHandle);
        row.appendChild(checkbox);
        row.appendChild(header);

        presetEl.appendChild(row);
        presetEl.appendChild(content);

        if (!preset.isDefault) {
            this.dragController.init(presetEl, preset.id);
        }

        return presetEl;
    }

    private toggleExpand(presetEl: HTMLElement, expandBtn: HTMLButtonElement): void {
        const content = presetEl.querySelector('.preset-content');
        if (content) {
            const isExpanded = content.classList.contains('expanded');
            content.classList.toggle('expanded', !isExpanded);
            expandBtn.textContent = isExpanded ? '▼' : '▲';
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

        const originalText = saveBtn.textContent;
        saveBtn.textContent = I18n.getMessage('statusSaved');
        saveBtn.classList.add('success');

        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.classList.remove('success');
        }, 1500);
    }

    private addNewPreset(): void {
        showPresetTypeDialog(
            () => this.createEmptyPreset(),
            () => showPresetTemplatesModal(async (template) => {
                await this.createPresetFromTemplate(template);
            })
        );
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

        this.expandAndFocusPreset(newPreset.id);
    }

    private expandAndFocusPreset(presetId: string): void {
        const newEl = this.presetsListEl?.querySelector(`[data-preset-id="${presetId}"]`);
        if (newEl) {
            const content = newEl.querySelector('.preset-content');
            const expandBtn = newEl.querySelector('.preset-expand-btn') as HTMLButtonElement;
            if (content && expandBtn) {
                content.classList.add('expanded');
                expandBtn.textContent = '▲';
                expandBtn.classList.add('rotated');
            }
            const nameEl = newEl.querySelector('.preset-name') as HTMLElement;
            if (nameEl) {
                nameEl.focus();
                const range = document.createRange();
                range.selectNodeContents(nameEl);
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
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

        this.expandAndFocusPreset(newPreset.id);
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
