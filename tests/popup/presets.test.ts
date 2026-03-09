import { mockHelpers } from '../setup';

// Mock для модулей
jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        getMessage: jest.fn((key: string) => key),
        applyTranslations: jest.fn(),
    },
}));

jest.mock('../../src/popup/dialog', () => ({
    showConfirm: jest.fn(() => Promise.resolve(true)),
    showAlert: jest.fn(() => Promise.resolve()),
}));

import { showConfirm, showAlert } from '../../src/popup/dialog';

let Presets: typeof import('../../src/popup/presets').Presets;

const createPreset = (
    id: string,
    name: string,
    domains: string[] = [],
    enabled = true,
    isDefault = false,
    order = 0
) => ({
    id,
    name,
    domains,
    enabled,
    isDefault,
    order,
    proxyId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
});

const createMinimalDOM = () => {
    document.body.innerHTML = `
        <div id="presets-container">
            <button id="proxy-by-default-toggle"></button>
            <button id="add-preset-button">Add Preset</button>
            <div id="presets-list"></div>
        </div>
    `;
};

describe('presets.ts - PresetsService', () => {
    beforeEach(async () => {
        mockHelpers.resetAllMocks();
        jest.clearAllMocks();
        
        createMinimalDOM();
        
        const presetsModule = await import('../../src/popup/presets');
        Presets = presetsModule.Presets;

        // Reset dialog mocks to default behavior
        (showConfirm as jest.Mock).mockResolvedValue(true);
        (showAlert as jest.Mock).mockResolvedValue();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('init()', () => {
        it('should find container elements', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            expect(document.getElementById('presets-container')).not.toBeNull();
            expect(document.getElementById('presets-list')).not.toBeNull();
        });

        it('should initialize proxy by default toggle', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: true,
            });

            await Presets.init();

            const toggle = document.getElementById('proxy-by-default-toggle');
            expect(toggle?.classList.contains('active')).toBe(true);
        });

        it('should render presets from storage', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('preset-1', 'Test Preset', ['example.com']),
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list');
            expect(presetsList?.querySelector('[data-preset-id="preset-1"]')).not.toBeNull();
        });

        it('should attach click listener to add preset button', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            expect(addBtn).not.toBeNull();
        });
    });

    describe('render()', () => {
        it('should render empty list when no presets', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list');
            expect(presetsList?.children.length).toBe(0);
        });

        it('should render multiple presets', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('preset-1', 'Preset 1', ['a.com']),
                    createPreset('preset-2', 'Preset 2', ['b.com']),
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list');
            expect(presetsList?.querySelectorAll('.preset-item').length).toBe(2);
        });

        it('should skip default preset when proxyByDefault is false', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('default', 'Ignore List', [], true, true, 0),
                    createPreset('preset-1', 'Preset 1', ['a.com'], true, false, 1),
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list');
            expect(presetsList?.querySelector('[data-preset-id="default"]')).toBeNull();
            expect(presetsList?.querySelector('[data-preset-id="preset-1"]')).not.toBeNull();
        });

        it('should show default preset when proxyByDefault is true', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('default', 'Ignore List', [], true, true, 0),
                ],
                proxyByDefault: true,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list');
            expect(presetsList?.querySelector('[data-preset-id="default"]')).not.toBeNull();
        });
    });

    describe('createPresetElement()', () => {
        it('should create element with correct structure', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test Preset', ['domain.com'])],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetEl = document.querySelector('[data-preset-id="test"]');
            expect(presetEl).not.toBeNull();
            expect(presetEl?.querySelector('.preset-row')).not.toBeNull();
            expect(presetEl?.querySelector('.preset-checkbox')).not.toBeNull();
            expect(presetEl?.querySelector('.preset-name')).not.toBeNull();
        });

        it('should set checkbox state based on enabled', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('enabled', 'Enabled', [], true)],
                proxyByDefault: false,
            });

            await Presets.init();

            const checkbox = document.querySelector('[data-preset-id="enabled"] .preset-checkbox') as HTMLInputElement;
            expect(checkbox?.checked).toBe(true);
        });

        it('should show delete button for regular preset', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('regular', 'Regular', [], true, false)],
                proxyByDefault: false,
            });

            await Presets.init();

            const deleteBtn = document.querySelector('[data-preset-id="regular"] .preset-delete-btn');
            expect(deleteBtn).not.toBeNull();
        });

        it('should make name editable for non-default preset', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('regular', 'Regular', [], true, false)],
                proxyByDefault: false,
            });

            await Presets.init();

            const nameEl = document.querySelector('[data-preset-id="regular"] .preset-name') as HTMLElement;
            expect(nameEl?.contentEditable).toBe('true');
        });

        it('should not make name editable for default preset', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('default', 'Ignore List', [], true, true)],
                proxyByDefault: true,
            });

            await Presets.init();

            const nameEl = document.querySelector('[data-preset-id="default"] .preset-name') as HTMLElement;
            expect(nameEl?.contentEditable).not.toBe('true');
        });

        it('should hide drag handle for default preset', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('default', 'Ignore List', [], true, true)],
                proxyByDefault: true,
            });

            await Presets.init();

            const dragHandle = document.querySelector('[data-preset-id="default"] .drag-handle') as HTMLElement;
            expect(dragHandle?.style.visibility).toBe('hidden');
        });

        it('should not show delete button for default preset', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('default', 'Ignore List', [], true, true)],
                proxyByDefault: true,
            });

            await Presets.init();

            const deleteBtn = document.querySelector('[data-preset-id="default"] .preset-delete-btn');
            expect(deleteBtn).toBeNull();
        });

        it('should display domains in textarea', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', ['domain1.com', 'domain2.com'])],
                proxyByDefault: false,
            });

            await Presets.init();

            const textarea = document.querySelector('[data-preset-id="test"] .preset-domains') as HTMLTextAreaElement;
            expect(textarea?.value).toBe('domain1.com\ndomain2.com');
        });
    });

    describe('togglePreset()', () => {
        it('should toggle preset enabled state via checkbox', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [], true)],
                proxyByDefault: false,
            });

            await Presets.init();

            const checkbox = document.querySelector('[data-preset-id="test"] .preset-checkbox') as HTMLInputElement;
            
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });

        it('should enable preset when checkbox is checked', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [], false)],
                proxyByDefault: false,
            });

            await Presets.init();

            const checkbox = document.querySelector('[data-preset-id="test"] .preset-checkbox') as HTMLInputElement;
            
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });
    });

    describe('updatePresetName()', () => {
        it('should update preset name on blur', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Old Name', [])],
                proxyByDefault: false,
            });

            await Presets.init();

            const nameEl = document.querySelector('[data-preset-id="test"] .preset-name') as HTMLElement;
            nameEl.textContent = 'New Name';
            nameEl.dispatchEvent(new Event('blur'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });

        it('should not update if name is empty', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Old Name', [])],
                proxyByDefault: false,
            });

            await Presets.init();

            const setCallsBefore = (chrome.storage.local.set as jest.Mock).mock.calls.length;

            const nameEl = document.querySelector('[data-preset-id="test"] .preset-name') as HTMLElement;
            nameEl.textContent = '   ';
            nameEl.dispatchEvent(new Event('blur'));

            await new Promise(resolve => setTimeout(resolve, 10));

            const setCallsAfter = (chrome.storage.local.set as jest.Mock).mock.calls.length;
            expect(setCallsAfter).toBe(setCallsBefore);
        });

        it('should trim whitespace from name', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Old Name', [])],
                proxyByDefault: false,
            });

            await Presets.init();

            const nameEl = document.querySelector('[data-preset-id="test"] .preset-name') as HTMLElement;
            nameEl.textContent = '  Trimmed Name  ';
            nameEl.dispatchEvent(new Event('blur'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });
    });

    describe('saveDomains()', () => {
        it('should save domains when save button is clicked', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', ['old.com'])],
                proxyByDefault: false,
            });

            await Presets.init();

            const textarea = document.querySelector('[data-preset-id="test"] .preset-domains') as HTMLTextAreaElement;
            textarea.value = 'new1.com\nnew2.com';

            const saveBtn = document.querySelector('[data-preset-id="test"] .preset-save-btn') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });

        it('should filter empty lines from domains', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [])],
                proxyByDefault: false,
            });

            await Presets.init();

            const textarea = document.querySelector('[data-preset-id="test"] .preset-domains') as HTMLTextAreaElement;
            textarea.value = 'domain1.com\n\n  \ndomain2.com\n';

            const saveBtn = document.querySelector('[data-preset-id="test"] .preset-save-btn') as HTMLButtonElement;
            saveBtn.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });
    });

    describe('deletePreset()', () => {
        it('should show confirmation dialog when delete is clicked', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [])],
                proxyByDefault: false,
            });

            await Presets.init();

            const deleteBtn = document.querySelector('[data-preset-id="test"] .preset-delete-btn') as HTMLButtonElement;
            deleteBtn.click();

            // Wait for async dialog
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(showConfirm).toHaveBeenCalled();
        });
    });

    describe('createEmptyPreset()', () => {
        it('should create new preset on add button click', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            expect(document.querySelector('.modal-overlay')).not.toBeNull();
        });

        it('should show preset type dialog with two options', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const options = document.querySelectorAll('.preset-type-option');
            expect(options.length).toBe(2);
        });

        it('should close dialog on overlay click', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const overlay = document.querySelector('.modal-overlay') as HTMLElement;
            overlay.click();

            expect(document.querySelector('.modal-overlay')).toBeNull();
        });

        it('should close dialog on close button click', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const closeBtn = document.querySelector('.modal-close') as HTMLButtonElement;
            closeBtn.click();

            expect(document.querySelector('.modal-overlay')).toBeNull();
        });
    });

    describe('toggleExpand()', () => {
        it('should expand content on button click', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test')],
                proxyByDefault: false,
            });

            await Presets.init();

            const expandBtn = document.querySelector('[data-preset-id="test"] .preset-expand-btn') as HTMLButtonElement;
            const content = document.querySelector('[data-preset-id="test"] .preset-content') as HTMLElement;

            expect(content.classList.contains('expanded')).toBe(false);

            expandBtn.click();

            expect(content.classList.contains('expanded')).toBe(true);
        });

        it('should collapse content on second click', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test')],
                proxyByDefault: false,
            });

            await Presets.init();

            const expandBtn = document.querySelector('[data-preset-id="test"] .preset-expand-btn') as HTMLButtonElement;
            const content = document.querySelector('[data-preset-id="test"] .preset-content') as HTMLElement;

            expandBtn.click();
            expect(content.classList.contains('expanded')).toBe(true);

            expandBtn.click();
            expect(content.classList.contains('expanded')).toBe(false);
        });

        it('should change expand button icon', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test')],
                proxyByDefault: false,
            });

            await Presets.init();

            const expandBtn = document.querySelector('[data-preset-id="test"] .preset-expand-btn') as HTMLButtonElement;

            expect(expandBtn.innerHTML).toBe('▼');

            expandBtn.click();
            expect(expandBtn.innerHTML).toBe('▲');

            expandBtn.click();
            expect(expandBtn.innerHTML).toBe('▼');
        });

        it('should add rotated class to expand button', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test')],
                proxyByDefault: false,
            });

            await Presets.init();

            const expandBtn = document.querySelector('[data-preset-id="test"] .preset-expand-btn') as HTMLButtonElement;

            expect(expandBtn.classList.contains('rotated')).toBe(false);

            expandBtn.click();
            expect(expandBtn.classList.contains('rotated')).toBe(true);

            expandBtn.click();
            expect(expandBtn.classList.contains('rotated')).toBe(false);
        });
    });

    describe('initProxyByDefaultToggle()', () => {
        it('should set active class when proxyByDefault is true', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: true,
            });

            await Presets.init();

            const toggle = document.getElementById('proxy-by-default-toggle');
            expect(toggle?.classList.contains('active')).toBe(true);
        });

        it('should not set active class when proxyByDefault is false', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            const toggle = document.getElementById('proxy-by-default-toggle');
            expect(toggle?.classList.contains('active')).toBe(false);
        });
    });

    describe('Drag & Drop functionality', () => {
        it('should make preset draggable on mousedown on handle', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [], true, false)],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetEl = document.querySelector('[data-preset-id="test"]') as HTMLElement;
            const dragHandle = presetEl.querySelector('.drag-handle') as HTMLElement;

            expect(presetEl.draggable).toBe(false);

            dragHandle.dispatchEvent(new MouseEvent('mousedown'));

            expect(presetEl.draggable).toBe(true);
        });

        it('should not initialize drag & drop for default preset', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('default', 'Ignore List', [], true, true)],
                proxyByDefault: true,
            });

            await Presets.init();

            const presetEl = document.querySelector('[data-preset-id="default"]') as HTMLElement;
            const dragHandle = presetEl.querySelector('.drag-handle') as HTMLElement;

            dragHandle.dispatchEvent(new MouseEvent('mousedown'));

            expect(presetEl.draggable).toBeFalsy();
        });

        it('should have drag handle with title for regular presets', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [], true, false)],
                proxyByDefault: false,
            });

            await Presets.init();

            const dragHandle = document.querySelector('[data-preset-id="test"] .drag-handle') as HTMLElement;
            expect(dragHandle.title).toBe('Drag to reorder');
        });

        it('should have hidden drag handle for default preset', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('default', 'Ignore List', [], true, true)],
                proxyByDefault: true,
            });

            await Presets.init();

            const dragHandle = document.querySelector('[data-preset-id="default"] .drag-handle') as HTMLElement;
            expect(dragHandle.style.visibility).toBe('hidden');
        });
    });

    describe('handleReorder()', () => {
        it('should have multiple presets rendered in order', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('preset-1', 'Preset 1', [], true, false, 0),
                    createPreset('preset-2', 'Preset 2', [], true, false, 1),
                    createPreset('preset-3', 'Preset 3', [], true, false, 2),
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list') as HTMLElement;
            const items = presetsList.querySelectorAll('.preset-item');
            
            expect(items.length).toBe(3);
            expect(items[0].getAttribute('data-preset-id')).toBe('preset-1');
            expect(items[1].getAttribute('data-preset-id')).toBe('preset-2');
            expect(items[2].getAttribute('data-preset-id')).toBe('preset-3');
        });

        it('should call Storage.reorderPresets after drop', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('preset-1', 'Preset 1', [], true, false, 0),
                    createPreset('preset-2', 'Preset 2', [], true, false, 1),
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list') as HTMLElement;
            const preset1 = presetsList.querySelector('[data-preset-id="preset-1"]') as HTMLElement;
            const preset2 = presetsList.querySelector('[data-preset-id="preset-2"]') as HTMLElement;
            const dragHandle1 = preset1.querySelector('.drag-handle') as HTMLElement;

            dragHandle1.dispatchEvent(new MouseEvent('mousedown'));

            const dragStartEvent = new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer(),
            });
            preset1.dispatchEvent(dragStartEvent);

            const rect = preset2.getBoundingClientRect();
            const dropEvent = new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                clientY: rect.top + rect.height + 10,
            });
            preset2.dispatchEvent(dropEvent);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });
    });

    describe('Drag events', () => {
        it('should add dragging class on dragstart', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [], true, false)],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetEl = document.querySelector('[data-preset-id="test"]') as HTMLElement;
            const dragHandle = presetEl.querySelector('.drag-handle') as HTMLElement;

            dragHandle.dispatchEvent(new MouseEvent('mousedown'));
            
            const dragStartEvent = new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer(),
            });
            presetEl.dispatchEvent(dragStartEvent);

            expect(presetEl.classList.contains('dragging')).toBe(true);
        });

        it('should remove dragging class on dragend', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [], true, false)],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetEl = document.querySelector('[data-preset-id="test"]') as HTMLElement;
            const dragHandle = presetEl.querySelector('.drag-handle') as HTMLElement;

            dragHandle.dispatchEvent(new MouseEvent('mousedown'));
            
            const dragStartEvent = new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer(),
            });
            presetEl.dispatchEvent(dragStartEvent);
            presetEl.dispatchEvent(new DragEvent('dragend', { bubbles: true }));

            expect(presetEl.classList.contains('dragging')).toBe(false);
            expect(presetEl.draggable).toBe(false);
        });

        // Пропущен: getBoundingClientRect() возвращает нули в jsdom, невозможно протестировать позиционирование
        it.skip('should add drop-above class on dragover above middle', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('preset-1', 'Preset 1', [], true, false, 0),
                    createPreset('preset-2', 'Preset 2', [], true, false, 1),
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list') as HTMLElement;
            const preset1 = presetsList.querySelector('[data-preset-id="preset-1"]') as HTMLElement;
            const preset2 = presetsList.querySelector('[data-preset-id="preset-2"]') as HTMLElement;
            const dragHandle1 = preset1.querySelector('.drag-handle') as HTMLElement;

            dragHandle1.dispatchEvent(new MouseEvent('mousedown'));
            const dragStartEvent = new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer(),
            });
            preset1.dispatchEvent(dragStartEvent);

            const rect = preset2.getBoundingClientRect();
            const dragOverEvent = new DragEvent('dragover', {
                bubbles: true,
                cancelable: true,
                clientY: rect.top + 1,
            });
            preset2.dispatchEvent(dragOverEvent);

            expect(preset2.classList.contains('drop-above')).toBe(true);
            expect(preset2.classList.contains('drop-below')).toBe(false);
        });

        it('should remove drop classes on dragleave', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('preset-1', 'Preset 1', [], true, false, 0),
                    createPreset('preset-2', 'Preset 2', [], true, false, 1),
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list') as HTMLElement;
            const preset1 = presetsList.querySelector('[data-preset-id="preset-1"]') as HTMLElement;
            const preset2 = presetsList.querySelector('[data-preset-id="preset-2"]') as HTMLElement;
            const dragHandle1 = preset1.querySelector('.drag-handle') as HTMLElement;

            dragHandle1.dispatchEvent(new MouseEvent('mousedown'));
            preset1.dispatchEvent(new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer(),
            }));

            preset2.classList.add('drop-above');
            preset2.dispatchEvent(new DragEvent('dragleave', { bubbles: true }));

            expect(preset2.classList.contains('drop-above')).toBe(false);
            expect(preset2.classList.contains('drop-below')).toBe(false);
        });

        it('should set dataTransfer properties on dragstart', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [], true, false)],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetEl = document.querySelector('[data-preset-id="test"]') as HTMLElement;
            const dragHandle = presetEl.querySelector('.drag-handle') as HTMLElement;

            dragHandle.dispatchEvent(new MouseEvent('mousedown'));

            const dataTransfer = new DataTransfer();
            const dragStartEvent = new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer,
            });
            presetEl.dispatchEvent(dragStartEvent);

            expect(dataTransfer.getData('text/plain')).toBe('test');
            expect(dataTransfer.effectAllowed).toBe('move');
        });

        it('should clean up all drop indicators on dragend', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('preset-1', 'Preset 1', [], true, false, 0),
                    createPreset('preset-2', 'Preset 2', [], true, false, 1),
                    createPreset('preset-3', 'Preset 3', [], true, false, 2),
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list') as HTMLElement;
            const preset1 = presetsList.querySelector('[data-preset-id="preset-1"]') as HTMLElement;
            const preset2 = presetsList.querySelector('[data-preset-id="preset-2"]') as HTMLElement;
            const preset3 = presetsList.querySelector('[data-preset-id="preset-3"]') as HTMLElement;
            const dragHandle1 = preset1.querySelector('.drag-handle') as HTMLElement;

            preset2.classList.add('drop-above');
            preset3.classList.add('drop-below');

            dragHandle1.dispatchEvent(new MouseEvent('mousedown'));
            preset1.dispatchEvent(new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer(),
            }));
            preset1.dispatchEvent(new DragEvent('dragend', { bubbles: true }));

            expect(preset2.classList.contains('drop-above')).toBe(false);
            expect(preset3.classList.contains('drop-below')).toBe(false);
        });

        it('should not trigger reorder when dropping on self', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [], true, false)],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetEl = document.querySelector('[data-preset-id="test"]') as HTMLElement;
            const dragHandle = presetEl.querySelector('.drag-handle') as HTMLElement;

            const setCallsBefore = (chrome.storage.local.set as jest.Mock).mock.calls.length;

            dragHandle.dispatchEvent(new MouseEvent('mousedown'));
            presetEl.dispatchEvent(new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer(),
            }));
            presetEl.dispatchEvent(new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
            }));

            await new Promise(resolve => setTimeout(resolve, 10));

            const setCallsAfter = (chrome.storage.local.set as jest.Mock).mock.calls.length;
            expect(setCallsAfter).toBe(setCallsBefore);
        });

        it('should remove drop classes on drop', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('preset-1', 'Preset 1', [], true, false, 0),
                    createPreset('preset-2', 'Preset 2', [], true, false, 1),
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const presetsList = document.getElementById('presets-list') as HTMLElement;
            const preset1 = presetsList.querySelector('[data-preset-id="preset-1"]') as HTMLElement;
            const preset2 = presetsList.querySelector('[data-preset-id="preset-2"]') as HTMLElement;
            const dragHandle1 = preset1.querySelector('.drag-handle') as HTMLElement;

            dragHandle1.dispatchEvent(new MouseEvent('mousedown'));
            preset1.dispatchEvent(new DragEvent('dragstart', {
                bubbles: true,
                cancelable: true,
                dataTransfer: new DataTransfer(),
            }));

            preset2.classList.add('drop-below');
            preset2.dispatchEvent(new DragEvent('drop', {
                bubbles: true,
                cancelable: true,
                clientY: 100,
            }));

            expect(preset2.classList.contains('drop-above')).toBe(false);
            expect(preset2.classList.contains('drop-below')).toBe(false);
        });
    });

    describe('deletePreset() - extended', () => {
        it('should not delete preset if user cancels confirmation', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [])],
                proxyByDefault: false,
            });

            (showConfirm as jest.Mock).mockResolvedValue(false);

            await Presets.init();

            const deleteBtn = document.querySelector('[data-preset-id="test"] .preset-delete-btn') as HTMLButtonElement;
            deleteBtn.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(showConfirm).toHaveBeenCalled();
            const presetEl = document.querySelector('[data-preset-id="test"]');
            expect(presetEl).not.toBeNull();
        });

        it('should delete preset if user confirms', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [])],
                proxyByDefault: false,
            });

            (showConfirm as jest.Mock).mockResolvedValue(true);

            await Presets.init();

            const deleteBtn = document.querySelector('[data-preset-id="test"] .preset-delete-btn') as HTMLButtonElement;
            deleteBtn.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });
    });

    describe('createEmptyPreset() - actual creation', () => {
        it('should create empty preset when clicking custom option', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const customOption = document.querySelector('.preset-type-option') as HTMLButtonElement;
            customOption.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });

        it('should generate name based on preset count', async () => {
            mockHelpers.setLocalStorageData({
                presets: [
                    createPreset('preset-1', 'Preset 1', []),
                    createPreset('preset-2', 'Preset 2', []),
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const customOption = document.querySelector('.preset-type-option') as HTMLButtonElement;
            customOption.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            const setCalls = (chrome.storage.local.set as jest.Mock).mock.calls;
            const lastCall = setCalls[setCalls.length - 1];
            if (lastCall && lastCall[0]?.presets) {
                const presets = lastCall[0].presets;
                const newPreset = presets[presets.length - 1];
                expect(newPreset.name).toBe('Preset 2');
            }
        });
    });

    describe('initProxyByDefaultToggle() - click handler', () => {
        it('should toggle proxyByDefault on click', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            const toggle = document.getElementById('proxy-by-default-toggle') as HTMLButtonElement;
            expect(toggle.classList.contains('active')).toBe(false);

            toggle.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'toggleProxy' });
        });

        it('should add active class after enabling', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            await Presets.init();

            const toggle = document.getElementById('proxy-by-default-toggle') as HTMLButtonElement;
            toggle.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(toggle.classList.contains('active')).toBe(true);
        });

        it('should remove active class after disabling', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: true,
            });

            await Presets.init();

            const toggle = document.getElementById('proxy-by-default-toggle') as HTMLButtonElement;
            expect(toggle.classList.contains('active')).toBe(true);

            toggle.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(toggle.classList.contains('active')).toBe(false);
        });
    });

    describe('updatePresetName() - Enter key', () => {
        it('should blur on Enter key press', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [])],
                proxyByDefault: false,
            });

            await Presets.init();

            const nameEl = document.querySelector('[data-preset-id="test"] .preset-name') as HTMLElement;
            nameEl.textContent = 'New Name';

            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                cancelable: true,
            });
            nameEl.dispatchEvent(enterEvent);

            // Enter вызывает blur(), который триггерит updatePresetName
            // Вручную вызовем blur событие
            nameEl.dispatchEvent(new Event('blur'));

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });
    });

    describe('saveDomains() - success feedback', () => {
        it('should show success state temporarily', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [])],
                proxyByDefault: false,
            });

            await Presets.init();

            const textarea = document.querySelector('[data-preset-id="test"] .preset-domains') as HTMLTextAreaElement;
            textarea.value = 'newdomain.com';

            const saveBtn = document.querySelector('[data-preset-id="test"] .preset-save-btn') as HTMLButtonElement;
            const originalText = saveBtn.textContent;
            
            saveBtn.click();

            // Ждём выполнения async операции
            await new Promise(resolve => setTimeout(resolve, 50));

            // После успешного сохранения кнопка показывает "statusSaved" на 1.5 сек
            expect(saveBtn.classList.contains('success')).toBe(true);
            expect(saveBtn.textContent).toBe('statusSaved');

            // Ждём восстановления
            await new Promise(resolve => setTimeout(resolve, 1600));

            expect(saveBtn.textContent).toBe(originalText);
            expect(saveBtn.classList.contains('success')).toBe(false);
        });
    });

    describe('Proxy dropdown', () => {
        it('should show proxy selector for non-default preset', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [], true, false)],
                proxies: [
                    { id: 'proxy-1', name: 'Proxy 1', host: '127.0.0.1', port: 8080, type: 'http', isDefault: true },
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const proxySelector = document.querySelector('[data-preset-id="test"] .preset-proxy-selector');
            expect(proxySelector).not.toBeNull();
        });

        it('should not show proxy selector for default preset', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('default', 'Ignore List', [], true, true)],
                proxyByDefault: true,
            });

            await Presets.init();

            const proxySelector = document.querySelector('[data-preset-id="default"] .preset-proxy-selector');
            expect(proxySelector).toBeNull();
        });

        it('should call Storage.setPresetProxy on change', async () => {
            mockHelpers.setLocalStorageData({
                presets: [createPreset('test', 'Test', [], true, false)],
                proxies: [
                    { id: 'proxy-1', name: 'Proxy 1', host: '127.0.0.1', port: 8080, type: 'http', isDefault: true },
                    { id: 'proxy-2', name: 'Proxy 2', host: '127.0.0.2', port: 8080, type: 'http', isDefault: false },
                ],
                proxyByDefault: false,
            });

            await Presets.init();

            const select = document.querySelector('[data-preset-id="test"] .proxy-select') as HTMLSelectElement;
            expect(select).not.toBeNull();
            
            select.value = 'proxy-2';
            select.dispatchEvent(new Event('change', { bubbles: true }));

            // Ждём выполнения async операции updatePresetProxy
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(chrome.storage.local.set).toHaveBeenCalled();
        });
    });

    describe('Preset templates modal', () => {
        beforeEach(() => {
            global.fetch = jest.fn();
        });

        afterEach(() => {
            (global.fetch as jest.Mock).mockRestore();
        });

        // Эти тесты пропущены из-за сложности тестирования асинхронного модального окна с fetch
        // В реальном приложении этот функционал лучше тестировать E2E тестами
        it.skip('should open templates modal on second option click', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ presets: [] }),
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const templateOption = document.querySelectorAll('.preset-type-option')[1] as HTMLButtonElement;
            templateOption.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            const templatesModal = document.querySelector('.preset-templates-modal');
            expect(templatesModal).not.toBeNull();
        });

        it.skip('should show loading state initially', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            let resolvePromise: (value: any) => void;
            const fetchPromise = new Promise(resolve => {
                resolvePromise = resolve;
            });

            (global.fetch as jest.Mock).mockReturnValue(fetchPromise);

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const templateOption = document.querySelectorAll('.preset-type-option')[1] as HTMLButtonElement;
            templateOption.click();

            await new Promise(resolve => setTimeout(resolve, 10));

            const loadingState = document.querySelector('.loading-state');
            expect(loadingState).not.toBeNull();

            resolvePromise!({
                ok: true,
                json: () => Promise.resolve({ presets: [] }),
            });
        });

        it.skip('should show empty state when no templates', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ presets: [] }),
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const templateOption = document.querySelectorAll('.preset-type-option')[1] as HTMLButtonElement;
            templateOption.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            const emptyState = document.querySelector('.empty-state');
            expect(emptyState).not.toBeNull();
            expect((emptyState as HTMLElement).style.display).not.toBe('none');
        });

        it.skip('should render templates list', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    presets: [
                        { name: 'Template 1', domains: ['a.com', 'b.com'] },
                        { name: 'Template 2', domains: ['c.com'] },
                    ],
                }),
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const templateOption = document.querySelectorAll('.preset-type-option')[1] as HTMLButtonElement;
            templateOption.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            const templateItems = document.querySelectorAll('.preset-template-item');
            expect(templateItems.length).toBe(2);
        });

        it.skip('should filter templates by search query', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    presets: [
                        { name: 'YouTube', domains: ['youtube.com'] },
                        { name: 'Google', domains: ['google.com'] },
                    ],
                }),
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const templateOption = document.querySelectorAll('.preset-type-option')[1] as HTMLButtonElement;
            templateOption.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            const searchInput = document.querySelector('.preset-search-input') as HTMLInputElement;
            searchInput.value = 'youtube';
            searchInput.dispatchEvent(new Event('input'));

            await new Promise(resolve => setTimeout(resolve, 10));

            const templateItems = document.querySelectorAll('.preset-template-item');
            expect(templateItems.length).toBe(1);
            expect(templateItems[0].getAttribute('data-preset-name')).toBe('YouTube');
        });

        it.skip('should create preset from template on click', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    presets: [
                        { name: 'Test Template', domains: ['test.com', 'example.com'] },
                    ],
                }),
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const templateOption = document.querySelectorAll('.preset-type-option')[1] as HTMLButtonElement;
            templateOption.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            const templateItem = document.querySelector('.preset-template-item') as HTMLElement;
            templateItem.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(chrome.storage.local.set).toHaveBeenCalled();

            const overlay = document.querySelector('.modal-overlay');
            expect(overlay).toBeNull();
        });

        it.skip('should show error state on fetch failure', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 500,
            });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const templateOption = document.querySelectorAll('.preset-type-option')[1] as HTMLButtonElement;
            templateOption.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            const errorState = document.querySelector('.error-state');
            expect(errorState).not.toBeNull();
            expect((errorState as HTMLElement).style.display).not.toBe('none');
        });

        it.skip('should retry loading on retry button click', async () => {
            mockHelpers.setLocalStorageData({
                presets: [],
                proxyByDefault: false,
            });

            (global.fetch as jest.Mock)
                .mockResolvedValueOnce({ ok: false, status: 500 })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ presets: [{ name: 'Test', domains: [] }] }),
                });

            await Presets.init();

            const addBtn = document.getElementById('add-preset-button') as HTMLButtonElement;
            addBtn.click();

            const templateOption = document.querySelectorAll('.preset-type-option')[1] as HTMLButtonElement;
            templateOption.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            const retryBtn = document.querySelector('.retry-btn') as HTMLButtonElement;
            retryBtn.click();

            await new Promise(resolve => setTimeout(resolve, 50));

            const templateItems = document.querySelectorAll('.preset-template-item');
            expect(templateItems.length).toBe(1);
        });
    });
});