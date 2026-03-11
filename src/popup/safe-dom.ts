/**
 * Safe DOM Utilities
 * 
 * Provides secure methods for DOM manipulation that prevent XSS attacks
 * by avoiding innerHTML and using safe text-based APIs.
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Converts &, <, >, ", ' to their HTML entity equivalents.
 * 
 * @param str - The string to escape
 * @returns The escaped string safe for HTML context
 * 
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // Returns: "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
 */
export function escapeHtml(str: string): string {
    if (!str) return '';
    
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Creates a DOM element from a template specification.
 * Uses document.createElement and safe property setters (no innerHTML).
 * 
 * @param tag - The HTML tag name for the element
 * @param props - Properties to set on the element
 * @returns The created element of type T
 * 
 * @example
 * const div = createElementFromTemplate('div', {
 *   id: 'my-id',
 *   className: 'container',
 *   textContent: 'Hello World'
 * });
 * 
 * @example
 * const input = createElementFromTemplate<HTMLInputElement>('input', {
 *   type: 'text',
 *   placeholder: 'Enter name',
 *   value: 'default'
 * });
 */
export function createElementFromTemplate<T extends HTMLElement>(
    tag: string,
    props: Partial<T>
): T {
    const element = document.createElement(tag) as T;
    
    if (!props) return element;
    
    // Handle dataset separately (data-* attributes)
    if ('dataset' in props && props.dataset) {
        Object.entries(props.dataset).forEach(([key, value]) => {
            element.dataset[key] = value as string;
        });
        delete (props as Record<string, unknown>).dataset;
    }
    
    // Handle style separately
    if ('style' in props && props.style) {
        Object.assign(element.style, props.style);
        delete (props as Record<string, unknown>).style;
    }
    
    // Set remaining properties
    Object.entries(props).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        
        if (key === 'className') {
            element.className = value as string;
        } else if (key === 'id') {
            element.id = value as string;
        } else if (key === 'textContent') {
            element.textContent = value as string;
        } else if (key === 'innerHTML') {
            // Explicitly block innerHTML for security
            console.warn('innerHTML is not allowed. Use textContent or appendChild instead.');
        } else if (key in element) {
            (element as Record<string, unknown>)[key] = value;
        } else {
            // Set as attribute for unknown properties
            element.setAttribute(key, String(value));
        }
    });
    
    return element;
}

/**
 * Safely sets text content on an element.
 * Uses textContent which automatically escapes HTML.
 * 
 * @param el - The element to set text on
 * @param text - The text to set (will be escaped)
 * 
 * @example
 * const div = document.createElement('div');
 * setText(div, '<script>alert("XSS")</script>');
 * // div.textContent will be: "<script>alert(\"XSS\")</script>"
 * // div.innerHTML will be: "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
 */
export function setText(el: HTMLElement, text: string): void {
    el.textContent = text || '';
}

/**
 * Safely sets an attribute on an element.
 * Uses setAttribute which properly handles special characters.
 *
 * @param el - The element to set attribute on
 * @param attr - The attribute name
 * @param value - The attribute value
 *
 * @example
 * const link = document.createElement('a');
 * setAttr(link, 'href', 'https://example.com');
 * setAttr(link, 'title', 'Say "Hello"');
 */
export function setAttr(el: HTMLElement, attr: string, value: string): void {
    el.setAttribute(attr, value || '');
}

/**
 * Safely sets HTML content on an element using DOMParser.
 * Parses HTML string into DOM nodes and appends them (no innerHTML).
 * Note: Only use with trusted HTML sources or after proper sanitization.
 *
 * @param el - The element to set HTML on
 * @param html - The HTML string to parse and append
 *
 * @example
 * const div = document.createElement('div');
 * setSafeHTML(div, '<span class="warning">⚠️ Warning message</span>');
 */
export function setSafeHTML(el: HTMLElement, html: string): void {
    if (!html) {
        el.textContent = '';
        return;
    }

    // Clear existing content
    el.textContent = '';

    // Parse HTML string into DOM nodes using DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Move all child nodes from the parsed document body to the target element
    Array.from(doc.body.childNodes).forEach((node) => {
        el.appendChild(node);
    });
}
