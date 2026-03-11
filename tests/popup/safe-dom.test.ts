import { escapeHtml, createElementFromTemplate, setText, setAttr } from '../../src/popup/safe-dom';

describe('safe-dom.ts - Safe DOM Utilities', () => {
    describe('escapeHtml()', () => {
        it('should escape ampersand', () => {
            expect(escapeHtml('A & B')).toBe('A &amp; B');
        });

        it('should escape less-than sign', () => {
            expect(escapeHtml('A < B')).toBe('A &lt; B');
        });

        it('should escape greater-than sign', () => {
            expect(escapeHtml('A > B')).toBe('A &gt; B');
        });

        it('should escape double quotes', () => {
            expect(escapeHtml('Say "Hello"')).toBe('Say &quot;Hello&quot;');
        });

        it('should escape single quotes', () => {
            expect(escapeHtml("It's")).toBe('It&#39;s');
        });

        it('should escape all HTML characters together', () => {
            const input = '<div onclick="alert(\'XSS\')">Hello & World</div>';
            const expected = '&lt;div onclick=&quot;alert(&#39;XSS&#39;)&quot;&gt;Hello &amp; World&lt;/div&gt;';
            expect(escapeHtml(input)).toBe(expected);
        });

        it('should return empty string for empty input', () => {
            expect(escapeHtml('')).toBe('');
        });

        it('should return same string for plain text without HTML chars', () => {
            expect(escapeHtml('Hello World')).toBe('Hello World');
        });

        it('should handle multiple occurrences of same character', () => {
            expect(escapeHtml('A & B & C')).toBe('A &amp; B &amp; C');
            expect(escapeHtml('<tag><tag>')).toBe('&lt;tag&gt;&lt;tag&gt;');
        });

        it('should handle null-like values gracefully', () => {
            expect(escapeHtml(null as unknown as string)).toBe('');
            expect(escapeHtml(undefined as unknown as string)).toBe('');
        });
    });

    describe('createElementFromTemplate()', () => {
        it('should create a div element with textContent', () => {
            const el = createElementFromTemplate('div', { textContent: 'Hello' });
            expect(el.tagName).toBe('DIV');
            expect(el.textContent).toBe('Hello');
        });

        it('should create a button element with class and textContent', () => {
            const el = createElementFromTemplate('button', {
                className: 'btn btn-primary',
                textContent: 'Click me'
            });
            expect(el.tagName).toBe('BUTTON');
            expect(el.className).toBe('btn btn-primary');
            expect(el.textContent).toBe('Click me');
        });

        it('should create an input element with type and value', () => {
            const el = createElementFromTemplate<HTMLInputElement>('input', {
                type: 'text',
                value: 'test value',
                placeholder: 'Enter text'
            });
            expect(el.tagName).toBe('INPUT');
            expect(el.type).toBe('text');
            expect(el.value).toBe('test value');
            expect(el.placeholder).toBe('Enter text');
        });

        it('should create an anchor element with href', () => {
            const el = createElementFromTemplate<HTMLAnchorElement>('a', {
                href: 'https://example.com',
                textContent: 'Link',
                target: '_blank'
            });
            expect(el.tagName).toBe('A');
            expect(el.href).toBe('https://example.com/');
            expect(el.textContent).toBe('Link');
            expect(el.target).toBe('_blank');
        });

        it('should create element with id', () => {
            const el = createElementFromTemplate('div', { id: 'my-element' });
            expect(el.id).toBe('my-element');
        });

        it('should create element with multiple classes', () => {
            const el = createElementFromTemplate('div', { className: 'class1 class2 class3' });
            expect(el.classList.contains('class1')).toBe(true);
            expect(el.classList.contains('class2')).toBe(true);
            expect(el.classList.contains('class3')).toBe(true);
        });

        it('should create element with data attributes', () => {
            const el = createElementFromTemplate<HTMLDivElement>('div', {
                dataset: {
                    test: 'value1',
                    id: '123'
                }
            });
            expect(el.dataset.test).toBe('value1');
            expect(el.dataset.id).toBe('123');
        });

        it('should create element with style properties', () => {
            const el = createElementFromTemplate<HTMLDivElement>('div', {
                style: {
                    color: 'red',
                    backgroundColor: 'blue'
                }
            });
            expect(el.style.color).toBe('red');
            expect(el.style.backgroundColor).toBe('blue');
        });

        it('should create span element', () => {
            const el = createElementFromTemplate<HTMLSpanElement>('span', {
                textContent: 'Inline text'
            });
            expect(el.tagName).toBe('SPAN');
            expect(el.textContent).toBe('Inline text');
        });

        it('should create element without properties', () => {
            const el = createElementFromTemplate('div', {});
            expect(el.tagName).toBe('DIV');
            expect(el.textContent).toBe('');
        });
    });

    describe('setText()', () => {
        it('should set textContent on element', () => {
            const el = document.createElement('div');
            setText(el, 'Hello World');
            expect(el.textContent).toBe('Hello World');
        });

        it('should escape HTML when setting text', () => {
            const el = document.createElement('div');
            setText(el, '<script>alert("XSS")</script>');
            expect(el.textContent).toBe('<script>alert("XSS")</script>');
            // textContent автоматически экранирует HTML при получении innerHTML
            expect(el.innerHTML).toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
        });

        it('should replace existing text', () => {
            const el = document.createElement('div');
            el.textContent = 'Old text';
            setText(el, 'New text');
            expect(el.textContent).toBe('New text');
        });

        it('should set empty string', () => {
            const el = document.createElement('div');
            el.textContent = 'Some text';
            setText(el, '');
            expect(el.textContent).toBe('');
        });
    });

    describe('setAttr()', () => {
        it('should set attribute on element', () => {
            const el = document.createElement('div');
            setAttr(el, 'data-test', 'value');
            expect(el.getAttribute('data-test')).toBe('value');
        });

        it('should update existing attribute', () => {
            const el = document.createElement('input');
            el.setAttribute('type', 'text');
            setAttr(el, 'type', 'password');
            expect(el.getAttribute('type')).toBe('password');
        });

        it('should set href attribute on anchor', () => {
            const el = document.createElement('a');
            setAttr(el, 'href', 'https://example.com');
            expect(el.getAttribute('href')).toBe('https://example.com');
        });

        it('should set src attribute on image', () => {
            const el = document.createElement('img');
            setAttr(el, 'src', 'image.png');
            expect(el.getAttribute('src')).toBe('image.png');
        });

        it('should set aria attributes for accessibility', () => {
            const el = document.createElement('button');
            setAttr(el, 'aria-label', 'Close dialog');
            setAttr(el, 'aria-expanded', 'false');
            expect(el.getAttribute('aria-label')).toBe('Close dialog');
            expect(el.getAttribute('aria-expanded')).toBe('false');
        });

        it('should escape special characters in attribute values', () => {
            const el = document.createElement('div');
            setAttr(el, 'title', 'Say "Hello" & smile');
            expect(el.getAttribute('title')).toBe('Say "Hello" & smile');
        });
    });

    describe('Integration tests', () => {
        it('should safely create a list of items with escaped content', () => {
            const container = document.createElement('ul');
            const items = ['Item 1', 'Item 2 <script>', 'Item 3 & "special"'];

            items.forEach(text => {
                const li = createElementFromTemplate('li', { textContent: text });
                container.appendChild(li);
            });

            expect(container.children.length).toBe(3);
            expect(container.children[1].textContent).toBe('Item 2 <script>');
            expect(container.innerHTML).toContain('&lt;script&gt;');
        });

        it('should create a safe button with icon', () => {
            const button = createElementFromTemplate<HTMLButtonElement>('button', {
                className: 'btn',
                id: 'action-btn'
            });

            const icon = createElementFromTemplate<HTMLSpanElement>('span', {
                className: 'icon',
                textContent: '🔒'
            });

            button.appendChild(icon);
            setText(button, 'Secure Action');

            expect(button.id).toBe('action-btn');
            expect(button.classList.contains('btn')).toBe(true);
            expect(button.textContent).toContain('Secure Action');
        });
    });
});
