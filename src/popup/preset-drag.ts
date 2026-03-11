import { Storage } from '../shared/storage';

export class PresetDragController {
    private draggedElement: HTMLElement | null = null;

    init(presetElement: HTMLElement, presetId: string): void {
        const dragHandle = presetElement.querySelector('.drag-handle');

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

        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = clientY < midY;

        if (insertBefore) {
            container.insertBefore(dragged, target);
        } else {
            container.insertBefore(dragged, target.nextSibling);
        }

        const orderedIds = Array.from(container.querySelectorAll('.preset-item'))
            .map(el => el.getAttribute('data-preset-id'))
            .filter(Boolean) as string[];

        await Storage.reorderPresets(orderedIds);
    }
}
