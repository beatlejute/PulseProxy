import { I18n } from '../shared/i18n';
import { adjustContainerHeight } from './dom-utils';
import { setSafeHTML } from './safe-dom';

/**
 * Диалоговое окно с сообщением и кнопкой OK (аналог alert).
 * Возвращает Promise, который разрешается при закрытии диалога.
 */
export function showAlert(message: string): Promise<void> {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal';

        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h3');
        title.textContent = I18n.getMessage('alertTitle') || 'Alert';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => {
            overlay.remove();
            adjustContainerHeight();
            resolve();
        });
        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal-body';
        const messageEl = document.createElement('p');
        messageEl.textContent = message;
        messageEl.style.margin = '0';
        body.appendChild(messageEl);

        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const okButton = document.createElement('button');
        okButton.className = 'btn btn-primary';
        okButton.textContent = I18n.getMessage('ok') || 'OK';
        okButton.addEventListener('click', () => {
            overlay.remove();
            adjustContainerHeight();
            resolve();
        });
        footer.appendChild(okButton);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        adjustContainerHeight();

        // Закрытие по клику на оверлей
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                adjustContainerHeight();
                resolve();
            }
        });
    });
}

/**
 * Диалоговое окно подтверждения с кнопками OK (Да) и Cancel (Нет).
 * Возвращает Promise<boolean> (true если пользователь подтвердил).
 */
export function showConfirm(message: string, options?: {
    title?: string;
    okText?: string;
    cancelText?: string;
    htmlMessage?: string;
}): Promise<boolean> {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal';

        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h3');
        title.textContent = options?.title || I18n.getMessage('confirmTitle') || 'Confirm';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => {
            overlay.remove();
            adjustContainerHeight();
            resolve(false);
        });
        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal-body';
        const messageEl = document.createElement('div');
        if (options?.htmlMessage) {
            setSafeHTML(messageEl, options.htmlMessage);
        } else {
            messageEl.textContent = message;
        }
        messageEl.style.margin = '0';
        body.appendChild(messageEl);

        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        const cancelButton = document.createElement('button');
        cancelButton.className = 'btn btn-secondary';
        cancelButton.textContent = options?.cancelText || I18n.getMessage('cancel') || 'Cancel';
        cancelButton.addEventListener('click', () => {
            overlay.remove();
            adjustContainerHeight();
            resolve(false);
        });
        const okButton = document.createElement('button');
        okButton.className = 'btn btn-primary';
        okButton.textContent = options?.okText || I18n.getMessage('ok') || 'OK';
        okButton.addEventListener('click', () => {
            overlay.remove();
            adjustContainerHeight();
            resolve(true);
        });
        footer.appendChild(cancelButton);
        footer.appendChild(okButton);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        adjustContainerHeight();

        // Закрытие по клику на оверлей
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                adjustContainerHeight();
                resolve(false);
            }
        });
    });
}