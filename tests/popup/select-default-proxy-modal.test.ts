/**
 * @jest-environment jsdom
 */

import { mockHelpers } from '../setup';

jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        getMessage: jest.fn((key: string) => key),
        applyTranslations: jest.fn(),
    },
}));

jest.mock('../../src/popup/dom-utils', () => ({
    adjustContainerHeight: jest.fn(),
}));

jest.mock('../../src/popup/safe-dom', () => {
    const originalModule = jest.requireActual('../../src/popup/safe-dom');
    return {
        ...originalModule,
        // Сохраняем реальные функции для работы с DOM
    };
});

// Import after mocks
import { showSelectDefaultProxyModal } from '../../src/popup/select-default-proxy-modal';
import { ProxyServer } from '../../src/types';
import { adjustContainerHeight } from '../../src/popup/dom-utils';

describe('select-default-proxy-modal.ts', () => {
    beforeEach(() => {
        mockHelpers.resetAllMocks();
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    /**
     * TC-Modal-1: Rendering a list of proxies with name and host:port
     *
     * When: showSelectDefaultProxyModal is called with two proxies
     * Then: the DOM renders a list with two items, each containing name and host:port
     */
    describe('TC-Modal-1: Rendering proxy list', () => {
        it('should render list with two proxy items when given two proxies', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'p1',
                    name: 'Proxy 1',
                    type: 'http',
                    host: '192.168.1.1',
                    port: 8080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                {
                    id: 'p2',
                    name: 'Proxy 2',
                    type: 'socks5',
                    host: '192.168.1.2',
                    port: 1080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            // Check that modal is rendered
            const modal = document.querySelector('.select-default-proxy-modal');
            expect(modal).not.toBeNull();

            // Check that list is rendered
            const list = document.querySelector('.select-default-proxy-list');
            expect(list).not.toBeNull();

            // Check that two items are rendered
            const items = document.querySelectorAll('.select-default-proxy-item');
            expect(items.length).toBe(2);

            // Check first item contains name and address
            const firstItem = items[0];
            const firstName = firstItem.querySelector('.proxy-item-name');
            const firstAddress = firstItem.querySelector('.proxy-item-address');

            expect(firstName?.textContent).toBe('Proxy 1');
            expect(firstAddress?.textContent).toBe('192.168.1.1:8080');

            // Check second item contains name and address
            const secondItem = items[1];
            const secondName = secondItem.querySelector('.proxy-item-name');
            const secondAddress = secondItem.querySelector('.proxy-item-address');

            expect(secondName?.textContent).toBe('Proxy 2');
            expect(secondAddress?.textContent).toBe('192.168.1.2:1080');

            // Clean up the promise
            const modalEl = document.querySelector('.select-default-proxy-modal');
            if (modalEl) {
                (modalEl as HTMLElement).dispatchEvent(new Event('modal-close'));
            }
            await promise;
        });

        it('should use host:port as name when proxy name is not provided', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'p1',
                    // name is undefined
                    type: 'http',
                    host: '10.0.0.1',
                    port: 3128,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            const nameSpan = document.querySelector('.proxy-item-name');
            expect(nameSpan?.textContent).toBe('10.0.0.1:3128');

            // Clean up
            const modalEl = document.querySelector('.select-default-proxy-modal');
            if (modalEl) {
                (modalEl as HTMLElement).dispatchEvent(new Event('modal-close'));
            }
            await promise;
        });
    });

    /**
     * TC-Modal-2: Clicking on a proxy row resolves with proxy id and closes modal
     *
     * When: user clicks on a proxy item in the list
     * Then: Promise resolves with the proxy id and modal is removed from DOM
     */
    describe('TC-Modal-2: Click on proxy item', () => {
        it('should resolve with proxy id when user clicks on proxy item', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'p1',
                    name: 'Proxy 1',
                    type: 'http',
                    host: '192.168.1.1',
                    port: 8080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                {
                    id: 'p2',
                    name: 'Proxy 2',
                    type: 'socks5',
                    host: '192.168.1.2',
                    port: 1080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            // Get the second proxy item
            const items = document.querySelectorAll('.select-default-proxy-item');
            const secondItem = items[1] as HTMLElement;

            // Click on the second item
            secondItem.click();

            // The promise should resolve with 'p2'
            const result = await promise;
            expect(result).toBe('p2');
        });

        it('should close modal when proxy item is clicked', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'p1',
                    name: 'Proxy 1',
                    type: 'http',
                    host: '192.168.1.1',
                    port: 8080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            // Check modal is in DOM
            let modal = document.querySelector('.select-default-proxy-modal');
            expect(modal).not.toBeNull();

            // Click on the proxy item
            const item = document.querySelector('.select-default-proxy-item') as HTMLElement;
            item.click();

            // Wait for promise to resolve
            const result = await promise;
            expect(result).toBe('p1');

            // Modal overlay should be removed from DOM
            const overlay = document.querySelector('.modal-overlay');
            expect(overlay).toBeNull();
        });

        it('should resolve with first proxy id when first item is clicked', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'proxy-a',
                    name: 'Proxy A',
                    type: 'http',
                    host: '10.0.0.1',
                    port: 8080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
                {
                    id: 'proxy-b',
                    name: 'Proxy B',
                    type: 'socks5',
                    host: '10.0.0.2',
                    port: 1080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            const items = document.querySelectorAll('.select-default-proxy-item');
            const firstItem = items[0] as HTMLElement;
            firstItem.click();

            const result = await promise;
            expect(result).toBe('proxy-a');
        });
    });

    /**
     * TC-Modal-3: Closing modal without selection resolves with null
     *
     * When: user closes modal by clicking X button or pressing Escape
     * Then: Promise resolves with null and Storage.setDefaultProxy is NOT called
     */
    describe('TC-Modal-3: Close modal without selection', () => {
        it('should resolve with null when close button is clicked', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'p1',
                    name: 'Proxy 1',
                    type: 'http',
                    host: '192.168.1.1',
                    port: 8080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            // Find and click the close button
            const closeBtn = document.querySelector('.modal-close') as HTMLElement;
            expect(closeBtn).not.toBeNull();

            closeBtn.click();

            const result = await promise;
            expect(result).toBeNull();
        });

        it('should resolve with null when Escape key is pressed', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'p1',
                    name: 'Proxy 1',
                    type: 'http',
                    host: '192.168.1.1',
                    port: 8080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            // Simulate Escape key press
            const escapeEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
            });

            document.dispatchEvent(escapeEvent);

            const result = await promise;
            expect(result).toBeNull();
        });

        it('should remove modal from DOM when closed', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'p1',
                    name: 'Proxy 1',
                    type: 'http',
                    host: '192.168.1.1',
                    port: 8080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            // Check modal is in DOM
            let overlay = document.querySelector('.modal-overlay');
            expect(overlay).not.toBeNull();

            // Close modal
            const closeBtn = document.querySelector('.modal-close') as HTMLElement;
            closeBtn.click();

            await promise;

            // Modal overlay should be removed
            overlay = document.querySelector('.modal-overlay');
            expect(overlay).toBeNull();
        });
    });

    /**
     * TC-Modal-4: Edge case - empty proxy list
     *
     * When: showSelectDefaultProxyModal is called with empty list
     * Then: Promise resolves with null immediately without rendering DOM
     */
    describe('TC-Modal-4: Edge case - empty proxy list', () => {
        it('should resolve with null immediately for empty list', async () => {
            const proxies: ProxyServer[] = [];

            const result = await showSelectDefaultProxyModal(proxies);

            expect(result).toBeNull();
        });

        it('should not render modal when proxy list is empty', async () => {
            const proxies: ProxyServer[] = [];

            await showSelectDefaultProxyModal(proxies);

            const modal = document.querySelector('.select-default-proxy-modal');
            expect(modal).toBeNull();

            const overlay = document.querySelector('.modal-overlay');
            expect(overlay).toBeNull();
        });

        it('should not render list when proxy list is empty', async () => {
            const proxies: ProxyServer[] = [];

            await showSelectDefaultProxyModal(proxies);

            const list = document.querySelector('.select-default-proxy-list');
            expect(list).toBeNull();

            const items = document.querySelectorAll('.select-default-proxy-item');
            expect(items.length).toBe(0);
        });
    });

    /**
     * Additional regression tests
     */
    describe('Regression tests', () => {
        it('should handle single proxy correctly (like multi-proxy scenario)', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'single-proxy',
                    name: 'Only Proxy',
                    type: 'http',
                    host: '127.0.0.1',
                    port: 8080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            // Should still render modal even for single proxy
            const modal = document.querySelector('.select-default-proxy-modal');
            expect(modal).not.toBeNull();

            const items = document.querySelectorAll('.select-default-proxy-item');
            expect(items.length).toBe(1);

            // Click should resolve with proxy id
            const item = items[0] as HTMLElement;
            item.click();

            const result = await promise;
            expect(result).toBe('single-proxy');
        });

        it('should handle proxies with special characters in name', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'p1',
                    name: 'Proxy "Special" & <Test>',
                    type: 'http',
                    host: '192.168.1.1',
                    port: 8080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            const nameSpan = document.querySelector('.proxy-item-name');
            // Should contain the text (browser will escape it)
            expect(nameSpan?.textContent).toBe('Proxy "Special" & <Test>');

            // Clean up
            const closeBtn = document.querySelector('.modal-close') as HTMLElement;
            closeBtn.click();

            await promise;
        });

        it('should handle proxies with username and password (not displayed)', async () => {
            const proxies: ProxyServer[] = [
                {
                    id: 'p1',
                    name: 'Auth Proxy',
                    type: 'socks5',
                    host: '192.168.1.1',
                    port: 1080,
                    username: 'user123',
                    password: 'secret',
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise = showSelectDefaultProxyModal(proxies);

            // Modal should render without exposing credentials
            const modal = document.querySelector('.select-default-proxy-modal');
            expect(modal).not.toBeNull();

            const modalText = modal?.textContent || '';
            expect(modalText).not.toContain('secret');

            // Clean up
            const closeBtn = document.querySelector('.modal-close') as HTMLElement;
            closeBtn.click();

            await promise;
        });

        it('should resolve multiple calls independently', async () => {
            const proxies1: ProxyServer[] = [
                {
                    id: 'p1',
                    name: 'Proxy 1',
                    type: 'http',
                    host: '192.168.1.1',
                    port: 8080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise1 = showSelectDefaultProxyModal(proxies1);

            // Click to resolve first
            const item1 = document.querySelector('.select-default-proxy-item') as HTMLElement;
            item1.click();

            const result1 = await promise1;
            expect(result1).toBe('p1');

            // Now call again with different proxies
            const proxies2: ProxyServer[] = [
                {
                    id: 'p2',
                    name: 'Proxy 2',
                    type: 'socks5',
                    host: '192.168.1.2',
                    port: 1080,
                    isDefault: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ];

            const promise2 = showSelectDefaultProxyModal(proxies2);

            const item2 = document.querySelector('.select-default-proxy-item') as HTMLElement;
            item2.click();

            const result2 = await promise2;
            expect(result2).toBe('p2');
        });
    });
});
