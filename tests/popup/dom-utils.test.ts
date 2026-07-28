/**
 * @jest-environment jsdom
 */
import { adjustContainerHeight } from '../../src/popup/dom-utils';

describe('dom-utils.ts - adjustContainerHeight()', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('should set minHeight to overlay height when both modal overlay and container are present', () => {
        document.body.innerHTML = `
            <div class="container"></div>
            <div class="modal-overlay" style="height: 400px;"></div>
        `;

        adjustContainerHeight();

        const container = document.querySelector('.container') as HTMLElement;
        // getBoundingClientRect returns 0 in jsdom, so overlayHeight will be 0
        expect(container.style.minHeight).toBe('0px');
    });

    it('should stretch container to 600px for fullheight overlay (popup grows to Chrome limit)', () => {
        document.body.innerHTML = `
            <div class="container"></div>
            <div class="modal-overlay modal-overlay--fullheight"></div>
        `;

        adjustContainerHeight();

        const container = document.querySelector('.container') as HTMLElement;
        // jsdom: overlay height = 0, но fullHeight-модалке гарантируется 600px
        expect(container.style.minHeight).toBe('600px');
    });

    it('should keep overlay height for fullheight overlay when it exceeds 600px', () => {
        document.body.innerHTML = `
            <div class="container"></div>
            <div class="modal-overlay modal-overlay--fullheight"></div>
        `;
        const overlay = document.querySelector('.modal-overlay') as HTMLElement;
        overlay.getBoundingClientRect = jest.fn().mockReturnValue({ height: 700 } as DOMRect);

        adjustContainerHeight();

        const container = document.querySelector('.container') as HTMLElement;
        expect(container.style.minHeight).toBe('700px');
    });

    it('should set minHeight to 220px when only container is present (no overlay)', () => {
        document.body.innerHTML = `
            <div class="container"></div>
        `;

        adjustContainerHeight();

        const container = document.querySelector('.container') as HTMLElement;
        expect(container.style.minHeight).toBe('220px');
    });

    it('should not throw when no container is present', () => {
        document.body.innerHTML = '';
        expect(() => adjustContainerHeight()).not.toThrow();
    });
});
