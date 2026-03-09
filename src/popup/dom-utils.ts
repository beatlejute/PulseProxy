/**
 * Adjusts the container height based on modal overlay height.
 * When a modal is open, sets container min-height to match modal height.
 * When modal is closed, resets to default height (220px).
 */
export function adjustContainerHeight(): void {
    const container = document.querySelector('.container');
    const modalOverlay = document.querySelector('.modal-overlay');

    if (modalOverlay && container) {
        // Get actual height of modal overlay
        const overlayHeight = modalOverlay.getBoundingClientRect().height;

        // Set container min-height to at least this height
        (container as HTMLElement).style.minHeight = overlayHeight + 'px';

    } else if (container) {
        // If modal is closed — reset to default height
        (container as HTMLElement).style.minHeight = '220px';
    }
}