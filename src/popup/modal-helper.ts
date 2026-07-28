/**
 * ModalHelper — утилита для создания структуры модальных окон
 *
 * Устраняет дублирование кода при создании модальных окон с одинаковой структурой:
 * - overlay + modal
 * - header с заголовком и кнопкой закрытия
 * - body для контента
 * - footer для кнопок
 *
 * @example
 * ```typescript
 * const { modal, body, footer, closeModal } = ModalHelper.create('Title');
 *
 * // Добавить контент в body
 * const content = document.createElement('div');
 * body.appendChild(content);
 *
 * // Добавить кнопки в footer
 * const saveBtn = createElementFromTemplate<HTMLButtonElement>('button', {
 *     className: 'btn btn-primary',
 *     textContent: 'Save'
 * });
 * footer.appendChild(saveBtn);
 *
 * // Открыть модалку
 * modal.build();
 * ```
 */

import { adjustContainerHeight } from './dom-utils';
import { getModalHost } from './view-mode';
import { TabId } from '../types';

/**
 * Конфигурация модального окна
 */
export interface ModalConfig {
    /** Заголовок модального окна */
    title: string;
    /** Дополнительные CSS классы для modal */
    modalClass?: string;
    /** Показывать ли кнопку закрытия (по умолчанию true) */
    showCloseButton?: boolean;
    /** Закрыть по клику на overlay (по умолчанию true) */
    closeOnOverlayClick?: boolean;
    /** Закрыть по Escape (по умолчанию true) */
    closeOnEscape?: boolean;
    /** Сделать overlay на полную высоту экрана */
    fullHeight?: boolean;
    /** Колонка, к которой относится модалка (в page-режиме overlay накрывает её) */
    column?: TabId;
}

/**
 * Результат создания модального окна
 */
export interface ModalResult {
    /** Оверлей модального окна */
    overlay: HTMLDivElement;
    /** Модальное окно */
    modal: HTMLDivElement;
    /** Заголовок модального окна */
    header: HTMLDivElement;
    /** Тело модального окна (для добавления контента) */
    body: HTMLDivElement;
    /** Футер модального окна (для кнопок) */
    footer: HTMLDivElement;
    /** Функция закрытия модального окна */
    closeModal: () => void;
    /**
     * Регистрирует колбэк, который вызывается при ЛЮБОМ закрытии модалки
     * (крестик, клик по overlay, Escape, программный closeModal). Вызывается
     * ровно один раз. Нужен потребителям, оборачивающим модалку в Promise,
     * чтобы не оставить его висящим при закрытии без выбора.
     */
    onClose: (callback: () => void) => void;
    /** Построитель — добавляет модалку в DOM и возвращает overlay */
    build: () => HTMLDivElement;
}

/**
 * ModalHelper — фабрика для создания модальных окон
 */
export class ModalHelper {
    /**
     * Создаёт новое модальное окно с указанной структурой
     *
     * @param config - Конфигурация модального окна
     * @returns Объект с элементами модального окна и утилитами
     *
     * @example
     * ```typescript
     * const { modal, body, footer, closeModal } = ModalHelper.create({
     *     title: 'Add Proxy',
     *     modalClass: 'proxy-form-modal'
     * });
     *
     * // Добавить контент
     * const form = document.createElement('form');
     * body.appendChild(form);
     *
     * // Добавить кнопки
     * const saveBtn = document.createElement('button');
     * saveBtn.textContent = 'Save';
     * footer.appendChild(saveBtn);
     *
     * // Открыть
     * build();
     * ```
     */
    static create(config: ModalConfig): ModalResult {
        const {
            title,
            modalClass = '',
            showCloseButton = true,
            closeOnOverlayClick = true,
            closeOnEscape = true,
        } = config;

        // Создаём оверлей
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        if (config.fullHeight) {
            overlay.classList.add('modal-overlay--fullheight');
        }

        // Создаём модальное окно
        const modal = document.createElement('div');
        modal.className = `modal${modalClass ? ` ${modalClass}` : ''}`;

        // Колбэки, вызываемые при закрытии (любым путём), и защита от повторного
        // закрытия. Escape-хендлер держим в переменной, чтобы снимать его на ВСЕХ
        // путях закрытия, а не только когда закрыли именно Escape'ом (иначе он
        // копился на document при каждом открытии модалки — утечка).
        const closeCallbacks: Array<() => void> = [];
        let closed = false;
        let escapeHandler: ((e: KeyboardEvent) => void) | null = null;

        // Функция закрытия (должна быть определена до использования)
        const closeModal = (): void => {
            if (closed) return;
            closed = true;
            if (escapeHandler) {
                document.removeEventListener('keydown', escapeHandler);
                escapeHandler = null;
            }
            overlay.remove();
            adjustContainerHeight();
            for (const cb of closeCallbacks) {
                try {
                    cb();
                } catch (error) {
                    console.error('ModalHelper: onClose callback failed:', error);
                }
            }
        };

        const onClose = (callback: () => void): void => {
            closeCallbacks.push(callback);
        };

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        header.appendChild(titleEl);

        // Кнопка закрытия
        if (showCloseButton) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close';
            closeBtn.textContent = '×';
            closeBtn.addEventListener('click', closeModal);
            header.appendChild(closeBtn);
        }

        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';

        // Footer
        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        // Собираем структуру
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        // Закрытие по клику на оверлей
        if (closeOnOverlayClick) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal();
                }
            });
        }

        // Закрытие по Escape. Хендлер снимается внутри closeModal на любом пути
        // закрытия — здесь только регистрируем его.
        if (closeOnEscape) {
            escapeHandler = (e: KeyboardEvent): void => {
                if (e.key === 'Escape') {
                    closeModal();
                }
            };
            document.addEventListener('keydown', escapeHandler);
        }

        // Построитель
        const build = (): HTMLDivElement => {
            getModalHost(config.column).appendChild(overlay);
            adjustContainerHeight();

            // Применяем локализацию если доступна
            if (typeof window !== 'undefined' && 'I18n' in window) {
                const i18n = (window as Record<string, unknown>).I18n as { applyTranslations?: () => void } | undefined;
                i18n?.applyTranslations?.();
            }

            return overlay;
        };

        return { overlay, modal, header, body, footer, closeModal, onClose, build };
    }

    /**
     * Создаёт модальное окно с простым заголовком (без footer)
     * Используется для диалогов выбора опций
     *
     * @param title - Заголовок модального окна
     * @param modalClass - Дополнительные CSS классы
     * @returns Объект с элементами и функцией закрытия
     *
     * @example
     * ```typescript
     * const { body, closeModal } = ModalHelper.createSimple('Select Type', 'preset-type-modal');
     *
     * // Добавить кнопки выбора
     * const optionBtn = document.createElement('button');
     * optionBtn.className = 'preset-type-option';
     * body.appendChild(optionBtn);
     *
     * build();
     * ```
     */
    static createSimple(title: string, modalClass?: string, column?: TabId): Omit<ModalResult, 'footer'> {
        const result = ModalHelper.create({ title, modalClass, column });
        const { overlay, modal, header, body, closeModal, onClose, build } = result;

        return { overlay, modal, header, body, closeModal, onClose, build };
    }

    /**
     * Добавляет кнопку в footer модального окна
     *
     * @param footer - Footer элемент модального окна
     * @param text - Текст кнопки
     * @param className - CSS класс кнопки (например, 'btn btn-primary')
     * @param onClick - Обработчик клика
     * @returns Созданная кнопка
     */
    static addButton(
        footer: HTMLDivElement,
        text: string,
        className: string,
        onClick?: () => void
    ): HTMLButtonElement {
        const button = document.createElement('button');
        button.className = className;
        button.textContent = text;

        if (onClick) {
            button.addEventListener('click', onClick);
        }

        footer.appendChild(button);
        return button;
    }

    /**
     * Добавляет стандартные кнопки Save/Cancel в footer
     *
     * @param footer - Footer элемент модального окна
     * @param onSave - Обработчик сохранения
     * @param onCancel - Обработчик отмены (по умолчанию закрывает модалку)
     * @returns Объект с кнопками { saveBtn, cancelBtn }
     */
    static addStandardButtons(
        footer: HTMLDivElement,
        onSave: () => void,
        onCancel?: () => void
    ): { saveBtn: HTMLButtonElement; cancelBtn: HTMLButtonElement } {
        const cancelBtn = ModalHelper.addButton(
            footer,
            'Cancel',
            'btn btn-secondary modal-cancel',
            onCancel
        );

        const saveBtn = ModalHelper.addButton(
            footer,
            'Save',
            'btn btn-primary modal-save',
            onSave
        );

        return { saveBtn, cancelBtn };
    }
}
