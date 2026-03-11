/**
 * ModalBuilder - Fluent API для создания модальных окон
 *
 * Устраняет дублирование кода при создании однотипных модальных окон.
 * Использует safe DOM API (без innerHTML) для предотвращения XSS атак.
 *
 * @example
 * ```typescript
 * const modal = ModalBuilder.create('Add Proxy')
 *   .withField('Host', 'text', 'host', 'Enter host')
 *   .withField('Port', 'number', 'port')
 *   .withSelect('Type', 'type', [
 *     { value: 'http', label: 'HTTP' },
 *     { value: 'https', label: 'HTTPS' },
 *   ])
 *   .withButton('Add', 'primary', (data) => {
 *     console.log('Form data:', data);
 *   })
 *   .withCancelButton()
 *   .build();
 *
 * document.body.appendChild(modal);
 * ```
 */

import { adjustContainerHeight } from './dom-utils';

/**
 * Опция для select поля
 */
export interface SelectOption {
    value: string;
    label: string;
}

/**
 * Данные формы, собираемые из всех полей
 */
export type FormData = Record<string, string>;

/**
 * Тип кнопки (variant)
 */
export type ButtonVariant = 'primary' | 'secondary';

/**
 * Обработчик подтверждения формы
 */
export type ConfirmHandler = (data: FormData) => void;

/**
 * ModalBuilder - Fluent API для построения модальных окон
 *
 * Поддерживает создание полей ввода, select, кнопок.
 * Автоматически собирает данные формы при подтверждении.
 * Использует безопасные DOM API (без innerHTML).
 */
export class ModalBuilder {
    /** Оверлей модального окна */
    private overlay: HTMLDivElement;
    /** Контент модального окна */
    private modal: HTMLDivElement;
    /** Тело модального окна (для добавления полей) */
    private body: HTMLDivElement;
    /** Футер модального окна (для кнопок) */
    private footer: HTMLDivElement;
    /** Обработчик подтверждения */
    private confirmHandler: ConfirmHandler | null = null;
    /** Основная кнопка (для вызова обработчика) */
    private primaryButton: HTMLButtonElement | null = null;

    /**
     * Создаёт новый ModalBuilder с указанным заголовком
     *
     * @param title - Заголовок модального окна
     * @returns Новый экземпляр ModalBuilder
     *
     * @example
     * ```typescript
     * ModalBuilder.create('Add Proxy')
     * ```
     */
    static create(title: string): ModalBuilder {
        return new ModalBuilder(title);
    }

    /**
     * Приватный конструктор для использования через static create
     *
     * @param title - Заголовок модального окна
     */
    private constructor(title: string) {
        // Создаём оверлей
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';

        // Создаём модальное окно
        this.modal = document.createElement('div');
        this.modal.className = 'modal';

        // Заголовок
        const header = document.createElement('div');
        header.className = 'modal-header';

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;

        // Кнопка закрытия
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => this.close());

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        // Тело
        this.body = document.createElement('div');
        this.body.className = 'modal-body';

        // Футер
        this.footer = document.createElement('div');
        this.footer.className = 'modal-footer';

        // Собираем структуру
        this.modal.appendChild(header);
        this.modal.appendChild(this.body);
        this.modal.appendChild(this.footer);
        this.overlay.appendChild(this.modal);

        // Закрытие по клику на оверлей
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });
    }

    /**
     * Добавляет произвольный HTML элемент в тело модального окна.
     *
     * Используется для сложных сценариев (диалоги выбора, списки с фильтрами),
     * где стандартные поля формы недостаточны.
     *
     * @param element - Произвольный HTML элемент для добавления в body
     * @returns Текущий экземпляр для цепочки вызовов
     *
     * @example
     * ```typescript
     * const optionsList = document.createElement('div');
     * // ... наполнить контент ...
     * ModalBuilder.create('Select Type')
     *   .withContent(optionsList)
     *   .withCancelButton()
     *   .build();
     * ```
     */
    withContent(element: HTMLElement): this {
        this.body.appendChild(element);
        return this;
    }

    /**
     * Добавляет поле ввода в модальное окно
     *
     * @param label - Текст метки поля
     * @param inputType - Тип поля: 'text', 'email', 'number', 'password', 'textarea', 'select'
     * @param name - Имя поля (для сбора данных формы)
     * @param placeholder - Опциональный placeholder
     * @param options - Опции для типа 'select'
     * @returns Текущий экземпляр для цепочки вызовов
     *
     * @example
     * ```typescript
     * .withField('Username', 'text', 'username', 'Enter username')
     * .withField('Protocol', 'select', 'protocol', undefined, [
     *   { value: 'http', label: 'HTTP' },
     *   { value: 'https', label: 'HTTPS' },
     * ])
     * ```
     */
    withField(
        label: string,
        inputType: string,
        name: string,
        placeholder?: string,
        options?: SelectOption[]
    ): this {
        const fieldContainer = document.createElement('div');
        fieldContainer.className = 'form-field';

        // Label
        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        fieldContainer.appendChild(labelEl);

        // Input element
        let inputElement: HTMLElement;

        if (inputType === 'textarea') {
            inputElement = document.createElement('textarea');
            if (placeholder) {
                (inputElement as HTMLTextAreaElement).placeholder = placeholder;
            }
        } else if (inputType === 'select' && options) {
            inputElement = document.createElement('select');
            options.forEach((opt) => {
                const optionEl = document.createElement('option');
                optionEl.value = opt.value;
                optionEl.textContent = opt.label;
                inputElement.appendChild(optionEl);
            });
        } else {
            inputElement = document.createElement('input');
            (inputElement as HTMLInputElement).type = inputType;
            (inputElement as HTMLInputElement).placeholder = placeholder || '';
        }

        (inputElement as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).name = name;
        fieldContainer.appendChild(inputElement);

        this.body.appendChild(fieldContainer);

        return this;
    }

    /**
     * Добавляет select поле в модальное окно
     *
     * @param label - Текст метки поля
     * @param name - Имя поля (для сбора данных формы)
     * @param options - Список опций для выбора
     * @returns Текущий экземпляр для цепочки вызовов
     *
     * @example
     * ```typescript
     * .withSelect('Choose option', 'option', [
     *   { value: '1', label: 'Option 1' },
     *   { value: '2', label: 'Option 2' },
     * ])
     * ```
     */
    withSelect(label: string, name: string, options: SelectOption[]): this {
        return this.withField(label, 'select', name, undefined, options);
    }

    /**
     * Добавляет кнопку в футер модального окна
     *
     * @param text - Текст кнопки
     * @param variant - Вариант кнопки: 'primary' или 'secondary'
     * @param onClick - Обработчик клика (вызывается с данными формы)
     * @returns Текущий экземпляр для цепочки вызовов
     *
     * @example
     * ```typescript
     * .withButton('Save', 'primary', (data) => {
     *   console.log('Saved:', data);
     * })
     * ```
     */
    withButton(text: string, variant: ButtonVariant, onClick: (data: FormData) => void): this {
        const button = document.createElement('button');
        button.className = `btn btn-${variant}`;
        button.textContent = text;

        button.addEventListener('click', () => {
            const formData = this.getFormData();
            onClick(formData);
        });

        // Сохраняем ссылку на primary кнопку для onConfirm
        if (variant === 'primary') {
            this.primaryButton = button;
        }

        this.footer.appendChild(button);

        return this;
    }

    /**
     * Добавляет кнопку отмены в футер модального окна
     *
     * @param text - Текст кнопки (по умолчанию 'Cancel')
     * @returns Текущий экземпляр для цепочки вызовов
     *
     * @example
     * ```typescript
     * .withCancelButton()
     * .withCancelButton('No')
     * ```
     */
    withCancelButton(text?: string): this {
        const cancelButton = document.createElement('button');
        cancelButton.className = 'btn btn-cancel';
        cancelButton.textContent = text || 'Cancel';

        cancelButton.addEventListener('click', () => this.close());

        this.footer.appendChild(cancelButton);

        return this;
    }

    /**
     * Устанавливает обработчик подтверждения формы
     * Вызывается при клике на primary кнопку
     *
     * @param handler - Функция обратного вызова с данными формы
     * @returns Текущий экземпляр для цепочки вызовов
     *
     * @example
     * ```typescript
     * .onConfirm((data) => {
     *   console.log('Form submitted:', data);
     * })
     * ```
     */
    onConfirm(handler: ConfirmHandler): this {
        this.confirmHandler = handler;

        // Если primary кнопка уже создана, обновляем её обработчик
        if (this.primaryButton) {
            // Клонируем кнопку чтобы заменить обработчик
            const newButton = this.primaryButton.cloneNode(true) as HTMLButtonElement;
            this.primaryButton.parentNode?.replaceChild(newButton, this.primaryButton);

            newButton.addEventListener('click', () => {
                if (this.confirmHandler) {
                    const formData = this.getFormData();
                    this.confirmHandler(formData);
                }
            });

            this.primaryButton = newButton;
        }

        return this;
    }

    /**
     * Собирает данные из всех полей формы в модальном окне
     *
     * @returns Объект с данными формы { [fieldName]: value }
     */
    private getFormData(): FormData {
        const formData: FormData = {};

        // Собираем input и textarea
        const inputs = this.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
        inputs.forEach((input) => {
            formData[input.name] = input.value;
        });

        // Собираем select
        const selects = this.body.querySelectorAll<HTMLSelectElement>('select');
        selects.forEach((select) => {
            formData[select.name] = select.value;
        });

        return formData;
    }

    /**
     * Закрывает модальное окно и удаляет из DOM
     */
    private close(): void {
        this.overlay.remove();
        adjustContainerHeight();
    }

    /**
     * Строит и возвращает готовое модальное окно
     *
     * @returns HTML элемент оверлея модального окна
     *
     * @example
     * ```typescript
     * const modal = ModalBuilder.create('Title')
     *   .withField('Name', 'text', 'name')
     *   .build();
     *
     * document.body.appendChild(modal);
     * ```
     */
    build(): HTMLElement {
        // Применяем локализацию если доступна
        if (typeof window !== 'undefined' && 'I18n' in window) {
            const i18n = (window as Record<string, unknown>).I18n as { applyTranslations?: () => void } | undefined;
            i18n?.applyTranslations?.();
        }

        // Добавляем в DOM
        document.body.appendChild(this.overlay);
        adjustContainerHeight();

        return this.overlay;
    }
}
