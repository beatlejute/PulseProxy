import { ProxyServer } from '../types';
import { createElementFromTemplate, setAttr } from './safe-dom';
import { ModalHelper } from './modal-helper';

export async function showSelectDefaultProxyModal(proxies: ProxyServer[]): Promise<string | null> {
    if (proxies.length === 0) {
        return null; // Edge case: empty list — no rendering
    }

    return new Promise((resolve) => {
        const { body, closeModal: originalCloseModal, build, header } = ModalHelper.create({
            title: 'Select Default Proxy',
            modalClass: 'select-default-proxy-modal'
        });

        // Create a dispatching wrapper for closeModal
        const dispatchCloseAndClose = (): void => {
            const modalEl = document.querySelector('.select-default-proxy-modal');
            if (modalEl) {
                modalEl.dispatchEvent(new Event('modal-close'));
            }
            originalCloseModal();
        };

        const listDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'select-default-proxy-list' });

        proxies.forEach(proxy => {
            const item = createProxyItem(proxy, () => {
                resolve(proxy.id);
                dispatchCloseAndClose();
            });
            listDiv.appendChild(item);
        });

        body.appendChild(listDiv);
        build();

        // Re-wire the close button to use our dispatch wrapper
        const closeBtn = header.querySelector('.modal-close') as HTMLButtonElement;
        if (closeBtn) {
            // Remove the original click listener by replacing the element
            const newCloseBtn = closeBtn.cloneNode(true) as HTMLButtonElement;
            closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);

            // Add new listener that dispatches the event
            newCloseBtn.addEventListener('click', dispatchCloseAndClose);
        }

        const modalEl = document.querySelector('.select-default-proxy-modal');
        if (modalEl) {
            const closeHandler = () => {
                resolve(null);
            };
            modalEl.addEventListener('modal-close', closeHandler, { once: true });

            // Also handle Escape key by dispatching the modal-close event
            // (ModalHelper's Escape listener uses the original closeModal)
            const escapeHandler = (e: KeyboardEvent): void => {
                if (e.key === 'Escape') {
                    modalEl.dispatchEvent(new Event('modal-close'));
                }
            };
            document.addEventListener('keydown', escapeHandler, { once: true });
        }
    });
}

function createProxyItem(proxy: ProxyServer, onSelect: () => void): HTMLElement {
    const item = document.createElement('div');
    item.className = 'select-default-proxy-item';

    // Color dot
    const dot = createElementFromTemplate<HTMLSpanElement>('span', { className: 'proxy-color-dot' });
    dot.style.backgroundColor = proxy.color || '#888';
    item.appendChild(dot);

    const mainDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'proxy-item-main' });

    const nameSpan = createElementFromTemplate<HTMLSpanElement>('span', {
        className: 'proxy-item-name',
        textContent: proxy.name || `${proxy.host}:${proxy.port}`
    });
    mainDiv.appendChild(nameSpan);

    const addressSpan = createElementFromTemplate<HTMLSpanElement>('span', {
        className: 'proxy-item-address',
        textContent: `${proxy.host}:${proxy.port}`
    });
    mainDiv.appendChild(addressSpan);

    item.appendChild(mainDiv);

    // Protocol type badge
    const typeBadge = createElementFromTemplate<HTMLSpanElement>('span', {
        className: 'proxy-item-type',
        textContent: proxy.type.toUpperCase()
    });
    item.appendChild(typeBadge);

    item.addEventListener('click', () => {
        onSelect();
    });

    return item;
}