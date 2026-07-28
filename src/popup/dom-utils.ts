/**
 * Chrome caps the extension popup document at 600px height.
 * Fullheight modals stretch the container to this limit so the popup
 * window grows and flex lists inside the modal get real height
 * (otherwise `flex: 1; min-height: 0` collapses them to 0px).
 */
const FULLHEIGHT_MODAL_MIN_HEIGHT = 600;

/**
 * Adjusts the container height based on modal overlay height.
 * When a modal is open, sets container min-height to match modal height;
 * fullheight modals are guaranteed at least FULLHEIGHT_MODAL_MIN_HEIGHT.
 * When modal is closed, resets to default height (220px).
 */
export function adjustContainerHeight(): void {
    const container = document.querySelector('.container');
    const modalOverlay = document.querySelector('.modal-overlay');

    if (modalOverlay && container) {
        // Get actual height of modal overlay
        const overlayHeight = modalOverlay.getBoundingClientRect().height;

        const minHeight = modalOverlay.classList.contains('modal-overlay--fullheight')
            ? Math.max(overlayHeight, FULLHEIGHT_MODAL_MIN_HEIGHT)
            : overlayHeight;

        (container as HTMLElement).style.minHeight = minHeight + 'px';

    } else if (container) {
        // If modal is closed — reset to default height
        (container as HTMLElement).style.minHeight = '220px';
    }
}
