/**
 * Тесты для ModalBuilder - Fluent API для создания модальных окон
 */

import { ModalBuilder } from '../../src/popup/modal-builder';

describe('ModalBuilder', () => {
    beforeEach(() => {
        // Очищаем DOM перед каждым тестом
        document.body.innerHTML = '';
    });

    describe('создание модального окна', () => {
        it('должен создать модальное окно с заголовком', () => {
            const modal = ModalBuilder.create('Test Title').build();

            expect(modal).toBeDefined();
            expect(modal.classList.contains('modal-overlay')).toBe(true);

            const titleEl = modal.querySelector('.modal-header h3');
            expect(titleEl?.textContent).toBe('Test Title');
        });

        it('должен создать структуру модального окна (header, body, footer)', () => {
            const modal = ModalBuilder.create('Title').build();

            expect(modal.querySelector('.modal-header')).toBeTruthy();
            expect(modal.querySelector('.modal-body')).toBeTruthy();
            expect(modal.querySelector('.modal-footer')).toBeTruthy();
        });

        it('должен закрываться по клику на кнопку закрытия', () => {
            const modal = ModalBuilder.create('Title').build();
            document.body.appendChild(modal);

            const closeBtn = modal.querySelector('.modal-close') as HTMLButtonElement;
            closeBtn.click();

            // После клика модальное окно должно быть удалено из DOM
            expect(document.body.contains(modal)).toBe(false);
        });

        it('должен закрываться по клику на оверлей', () => {
            const modal = ModalBuilder.create('Title').build();
            document.body.appendChild(modal);

            const overlay = modal as HTMLElement;
            overlay.click();

            expect(document.body.contains(modal)).toBe(false);
        });
    });

    describe('метод withField', () => {
        it('должен добавить текстовое поле с label', () => {
            const modal = ModalBuilder.create('Title')
                .withField('Username', 'text', 'username')
                .build();

            const body = modal.querySelector('.modal-body');
            const label = body?.querySelector('label');
            const input = body?.querySelector('input[name="username"]') as HTMLInputElement;

            expect(label?.textContent).toBe('Username');
            expect(input).toBeDefined();
            expect(input.type).toBe('text');
            expect(input.name).toBe('username');
        });

        it('должен добавить поле с placeholder', () => {
            const modal = ModalBuilder.create('Title')
                .withField('Email', 'email', 'email', 'Enter your email')
                .build();

            const input = modal.querySelector('input[name="email"]') as HTMLInputElement;
            expect(input.placeholder).toBe('Enter your email');
        });

        it('должен добавить textarea для типа textarea', () => {
            const modal = ModalBuilder.create('Title')
                .withField('Description', 'textarea', 'description')
                .build();

            const textarea = modal.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
            expect(textarea).toBeDefined();
        });

        it('должен добавить select для типа select с опциями', () => {
            const options = [
                { value: 'http', label: 'HTTP' },
                { value: 'https', label: 'HTTPS' },
            ];

            const modal = ModalBuilder.create('Title')
                .withField('Protocol', 'select', 'protocol', undefined, options)
                .build();

            const select = modal.querySelector('select[name="protocol"]') as HTMLSelectElement;
            expect(select).toBeDefined();
            expect(select.options.length).toBe(2);
            expect(select.options[0].value).toBe('http');
            expect(select.options[0].label).toBe('HTTP');
        });
    });

    describe('метод withSelect', () => {
        it('должен добавить select с label и опциями', () => {
            const options = [
                { value: '1', label: 'Option 1' },
                { value: '2', label: 'Option 2' },
            ];

            const modal = ModalBuilder.create('Title')
                .withSelect('Choose', 'choice', options)
                .build();

            const label = modal.querySelector('label');
            const select = modal.querySelector('select[name="choice"]') as HTMLSelectElement;

            expect(label?.textContent).toBe('Choose');
            expect(select).toBeDefined();
            expect(select.options.length).toBe(2);
        });
    });

    describe('метод withButton', () => {
        it('должен добавить кнопку с текстом', () => {
            const onClickMock = jest.fn();

            const modal = ModalBuilder.create('Title')
                .withButton('Submit', 'primary', onClickMock)
                .build();

            const footer = modal.querySelector('.modal-footer');
            const button = footer?.querySelector('button.btn-primary') as HTMLButtonElement;

            expect(button).toBeDefined();
            expect(button.textContent).toBe('Submit');

            button.click();
            expect(onClickMock).toHaveBeenCalled();
        });

        it('должен добавить кнопку с variant secondary', () => {
            const modal = ModalBuilder.create('Title')
                .withButton('Cancel', 'secondary', jest.fn())
                .build();

            const button = modal.querySelector('button.btn-secondary') as HTMLButtonElement;
            expect(button).toBeDefined();
        });
    });

    describe('метод withCancelButton', () => {
        it('должен добавить кнопку отмены с текстом по умолчанию', () => {
            const modal = ModalBuilder.create('Title')
                .withCancelButton()
                .build();

            const cancelButton = modal.querySelector('button.btn-cancel') as HTMLButtonElement;
            expect(cancelButton).toBeDefined();
            expect(cancelButton.textContent).toBe('Cancel');
        });

        it('должен добавить кнопку отмены с кастомным текстом', () => {
            const modal = ModalBuilder.create('Title')
                .withCancelButton('No')
                .build();

            const cancelButton = modal.querySelector('button.btn-cancel') as HTMLButtonElement;
            expect(cancelButton.textContent).toBe('No');
        });
    });

    describe('метод onConfirm', () => {
        it('должен вызвать обработчик при клике на primary кнопку', () => {
            const onConfirmMock = jest.fn();
            const formData = { username: 'test' };

            const modal = ModalBuilder.create('Title')
                .withField('Username', 'text', 'username')
                .withButton('OK', 'primary', jest.fn())
                .onConfirm(onConfirmMock)
                .build();

            const okButton = modal.querySelector('button.btn-primary') as HTMLButtonElement;
            okButton.click();

            expect(onConfirmMock).toHaveBeenCalled();
        });
    });

    describe('сбор данных формы', () => {
        it('должен собрать данные из всех полей формы', () => {
            let capturedData: Record<string, string> = {};

            const modal = ModalBuilder.create('Form')
                .withField('Name', 'text', 'name')
                .withField('Email', 'email', 'email')
                .withButton('Submit', 'primary', jest.fn())
                .onConfirm((data) => {
                    capturedData = data;
                })
                .build();

            // Заполняем поля
            const nameInput = modal.querySelector('input[name="name"]') as HTMLInputElement;
            const emailInput = modal.querySelector('input[name="email"]') as HTMLInputElement;
            nameInput.value = 'John';
            emailInput.value = 'john@example.com';

            // Кликаем Submit
            const submitButton = modal.querySelector('button.btn-primary') as HTMLButtonElement;
            submitButton.click();

            expect(capturedData.name).toBe('John');
            expect(capturedData.email).toBe('john@example.com');
        });

        it('должен собрать данные из textarea', () => {
            let capturedData: Record<string, string> = {};

            const modal = ModalBuilder.create('Form')
                .withField('Description', 'textarea', 'description')
                .withButton('Submit', 'primary', jest.fn())
                .onConfirm((data) => {
                    capturedData = data;
                })
                .build();

            const textarea = modal.querySelector('textarea[name="description"]') as HTMLTextAreaElement;
            textarea.value = 'Some description';

            const submitButton = modal.querySelector('button.btn-primary') as HTMLButtonElement;
            submitButton.click();

            expect(capturedData.description).toBe('Some description');
        });

        it('должен собрать данные из select', () => {
            let capturedData: Record<string, string> = {};

            const options = [
                { value: 'opt1', label: 'Option 1' },
                { value: 'opt2', label: 'Option 2' },
            ];

            const modal = ModalBuilder.create('Form')
                .withSelect('Choose', 'choice', options)
                .withButton('Submit', 'primary', jest.fn())
                .onConfirm((data) => {
                    capturedData = data;
                })
                .build();

            const select = modal.querySelector('select[name="choice"]') as HTMLSelectElement;
            select.value = 'opt2';

            const submitButton = modal.querySelector('button.btn-primary') as HTMLButtonElement;
            submitButton.click();

            expect(capturedData.choice).toBe('opt2');
        });
    });

    describe('Fluent API - цепочка вызовов', () => {
        it('должен поддерживать цепочку вызовов методов', () => {
            const modal = ModalBuilder.create('Complex Form')
                .withField('Name', 'text', 'name')
                .withField('Email', 'email', 'email')
                .withSelect('Role', 'role', [
                    { value: 'admin', label: 'Admin' },
                    { value: 'user', label: 'User' },
                ])
                .withButton('Submit', 'primary', jest.fn())
                .withCancelButton('No')
                .onConfirm(jest.fn())
                .build();

            expect(modal.querySelector('input[name="name"]')).toBeDefined();
            expect(modal.querySelector('input[name="email"]')).toBeDefined();
            expect(modal.querySelector('select[name="role"]')).toBeDefined();
            expect(modal.querySelector('button.btn-primary')).toBeDefined();
            expect(modal.querySelector('button.btn-cancel')).toBeDefined();
        });
    });

    describe('метод withContent', () => {
        it('должен добавить произвольный элемент в тело модала', () => {
            const customEl = document.createElement('div');
            customEl.className = 'custom-content';
            customEl.textContent = 'Custom content';

            const modal = ModalBuilder.create('Title')
                .withContent(customEl)
                .build();

            const body = modal.querySelector('.modal-body');
            expect(body?.querySelector('.custom-content')).toBeTruthy();
            expect(body?.querySelector('.custom-content')?.textContent).toBe('Custom content');
        });

        it('должен поддерживать несколько withContent вызовов', () => {
            const el1 = document.createElement('p');
            el1.className = 'para-1';
            const el2 = document.createElement('p');
            el2.className = 'para-2';

            const modal = ModalBuilder.create('Title')
                .withContent(el1)
                .withContent(el2)
                .build();

            const body = modal.querySelector('.modal-body');
            expect(body?.querySelector('.para-1')).toBeTruthy();
            expect(body?.querySelector('.para-2')).toBeTruthy();
        });

        it('должен сочетаться с withField и withButton', () => {
            const customEl = document.createElement('ul');
            customEl.className = 'options-list';

            const modal = ModalBuilder.create('Choose type')
                .withContent(customEl)
                .withButton('OK', 'primary', jest.fn())
                .withCancelButton()
                .build();

            expect(modal.querySelector('.options-list')).toBeTruthy();
            expect(modal.querySelector('button.btn-primary')).toBeTruthy();
            expect(modal.querySelector('button.btn-cancel')).toBeTruthy();
        });

        it('должен поддерживать сценарий showPresetTypeDialog (список кнопок опций)', () => {
            const optionsList = document.createElement('div');
            optionsList.className = 'preset-type-options';

            ['manual', 'template', 'import'].forEach((type) => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.dataset['value'] = type;
                btn.textContent = type;
                optionsList.appendChild(btn);
            });

            const modal = ModalBuilder.create('Select Preset Type')
                .withContent(optionsList)
                .withCancelButton()
                .build();

            const options = modal.querySelectorAll('.option-btn');
            expect(options.length).toBe(3);
        });

        it('должен поддерживать сценарий showPresetTemplatesModal (контент с поиском)', () => {
            const searchContainer = document.createElement('div');
            searchContainer.className = 'search-container';

            const searchInput = document.createElement('input');
            searchInput.type = 'search';
            searchInput.name = 'search';
            searchContainer.appendChild(searchInput);

            const list = document.createElement('div');
            list.className = 'templates-list';

            const modal = ModalBuilder.create('Templates')
                .withContent(searchContainer)
                .withContent(list)
                .withButton('Apply', 'primary', jest.fn())
                .withCancelButton()
                .build();

            expect(modal.querySelector('.search-container')).toBeTruthy();
            expect(modal.querySelector('.templates-list')).toBeTruthy();
        });

        it('должен возвращать this для цепочки вызовов', () => {
            const builder = ModalBuilder.create('Title');
            const el = document.createElement('div');
            const result = builder.withContent(el);
            expect(result).toBe(builder);
        });
    });

    describe('безопасность (XSS prevention)', () => {
        it('должен использовать textContent вместо innerHTML для текста', () => {
            const modal = ModalBuilder.create('<script>alert("XSS")</script>').build();

            const titleEl = modal.querySelector('.modal-header h3');
            // textContent должен содержать literal текст, а не выполнять скрипт
            expect(titleEl?.textContent).toBe('<script>alert("XSS")</script>');
        });

        it('должен экранировать HTML в label полей', () => {
            const modal = ModalBuilder.create('Title')
                .withField('<script>bad</script>', 'text', 'field')
                .build();

            const label = modal.querySelector('label');
            expect(label?.textContent).toBe('<script>bad</script>');
        });
    });
});
