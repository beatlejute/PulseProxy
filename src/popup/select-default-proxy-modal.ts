import { ProxyServer } from '../types';
import { createElementFromTemplate } from './safe-dom';
import { ModalHelper } from './modal-helper';

export async function showSelectDefaultProxyModal(proxies: ProxyServer[]): Promise<string | null> {
    if (proxies.length === 0) {
        return null; // Edge case: empty list — no rendering
    }

    return new Promise((resolve) => {
        // settle резолвит промис ровно один раз. Выбор прокси резолвит id ДО
        // закрытия, поэтому последующий onClose→settle(null) уже игнорируется.
        let settled = false;
        const settle = (value: string | null): void => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const { body, closeModal, build, onClose } = ModalHelper.create({
            title: 'Select Default Proxy',
            modalClass: 'select-default-proxy-modal',
            column: 'proxy'
        });

        // Любой путь закрытия без выбора (крестик, клик по overlay, Escape,
        // программный closeModal) резолвит null — промис не зависает.
        onClose(() => settle(null));

        const listDiv = createElementFromTemplate<HTMLDivElement>('div', { className: 'select-default-proxy-list' });

        proxies.forEach(proxy => {
            const item = createProxyItem(proxy, () => {
                settle(proxy.id);
                closeModal();
            });
            listDiv.appendChild(item);
        });

        body.appendChild(listDiv);
        build();
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