import { mockHelpers } from '../setup';
import {
    isPageView,
    applyPageViewClass,
    getModalHost,
    ViewMode,
    PAGE_VIEW_CLASS,
    PAGE_VIEW_QUERY,
} from '../../src/popup/view-mode';
import { DOMIds } from '../../src/shared/constants';

describe('view-mode.ts', () => {
    beforeEach(() => {
        mockHelpers.resetAllMocks();
        (global as any).chrome.tabs = { create: jest.fn() };
        window.history.replaceState({}, '', '/popup.html');
        document.documentElement.className = '';
        document.body.className = '';
        document.body.innerHTML = '';
    });

    describe('isPageView()', () => {
        it('должен вернуть true для ?view=page', () => {
            expect(isPageView('?view=page')).toBe(true);
        });

        it('должен вернуть true при наличии других параметров', () => {
            expect(isPageView('?foo=1&view=page')).toBe(true);
        });

        it('должен вернуть false для пустой query-строки', () => {
            expect(isPageView('')).toBe(false);
        });

        it('должен вернуть false для другого значения view', () => {
            expect(isPageView('?view=popup')).toBe(false);
        });

        it('должен читать window.location.search по умолчанию', () => {
            window.history.replaceState({}, '', `/popup.html?${PAGE_VIEW_QUERY}`);
            expect(isPageView()).toBe(true);
        });
    });

    describe('applyPageViewClass()', () => {
        it('должен добавить класс page-view на <html> и <body> в page-режиме', () => {
            window.history.replaceState({}, '', `/popup.html?${PAGE_VIEW_QUERY}`);

            applyPageViewClass();

            expect(document.documentElement.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
            expect(document.body.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
        });

        it('не должен добавлять класс в обычном popup-режиме', () => {
            applyPageViewClass();

            expect(document.documentElement.classList.contains(PAGE_VIEW_CLASS)).toBe(false);
            expect(document.body.classList.contains(PAGE_VIEW_CLASS)).toBe(false);
        });
    });

    describe('ViewMode.init()', () => {
        function renderButton(): HTMLButtonElement {
            document.body.innerHTML = `<button id="${DOMIds.OPEN_IN_TAB_BUTTON}"></button>`;
            return document.getElementById(DOMIds.OPEN_IN_TAB_BUTTON) as HTMLButtonElement;
        }

        it('клик по кнопке должен открыть popup.html?view=page в новой вкладке и закрыть попап', () => {
            const closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});
            const button = renderButton();

            ViewMode.init();
            button.click();

            expect(chrome.tabs.create).toHaveBeenCalledWith({
                url: `chrome-extension://mock-extension-id/popup.html?${PAGE_VIEW_QUERY}`,
            });
            expect(closeSpy).toHaveBeenCalled();
            closeSpy.mockRestore();
        });

        it('в page-режиме обработчик не привязывается (повторное открытие вкладки исключено)', () => {
            window.history.replaceState({}, '', `/popup.html?${PAGE_VIEW_QUERY}`);
            const button = renderButton();

            ViewMode.init();
            button.click();

            expect(chrome.tabs.create).not.toHaveBeenCalled();
        });

        it('не должен падать при отсутствии кнопки в DOM', () => {
            expect(() => ViewMode.init()).not.toThrow();
        });
    });

    describe('ViewMode.init() — перенос управления в колонку настроек', () => {
        function renderPageLayout(): void {
            document.body.innerHTML = `
                <div class="container">
                    <button id="${DOMIds.MAIN_BUTTON}"></button>
                    <button id="proxy-by-default-toggle"></button>
                    <div id="${DOMIds.TAB_SETTINGS}"><div class="setting-group"></div></div>
                </div>
            `;
        }

        it('в page-режиме кнопка-щит и «проксировать все» переезжают в конец #tab-settings', () => {
            window.history.replaceState({}, '', `/popup.html?${PAGE_VIEW_QUERY}`);
            renderPageLayout();

            ViewMode.init();

            const settings = document.getElementById(DOMIds.TAB_SETTINGS)!;
            const childIds = Array.from(settings.children).map(c => c.id);
            expect(childIds[childIds.length - 2]).toBe(DOMIds.MAIN_BUTTON);
            expect(childIds[childIds.length - 1]).toBe('proxy-by-default-toggle');
        });

        it('в popup-режиме элементы остаются на своих местах', () => {
            renderPageLayout();

            ViewMode.init();

            const settings = document.getElementById(DOMIds.TAB_SETTINGS)!;
            expect(settings.contains(document.getElementById(DOMIds.MAIN_BUTTON)!)).toBe(false);
            expect(settings.contains(document.getElementById('proxy-by-default-toggle')!)).toBe(false);
        });

        it('обработчики кнопки-щита сохраняются после переноса', () => {
            window.history.replaceState({}, '', `/popup.html?${PAGE_VIEW_QUERY}`);
            renderPageLayout();
            const handler = jest.fn();
            document.getElementById(DOMIds.MAIN_BUTTON)!.addEventListener('click', handler);

            ViewMode.init();
            (document.getElementById(DOMIds.MAIN_BUTTON) as HTMLButtonElement).click();

            expect(handler).toHaveBeenCalled();
        });

        it('не должен падать, если колонка настроек отсутствует', () => {
            window.history.replaceState({}, '', `/popup.html?${PAGE_VIEW_QUERY}`);
            document.body.innerHTML = `<button id="${DOMIds.MAIN_BUTTON}"></button>`;

            expect(() => ViewMode.init()).not.toThrow();
        });
    });

    describe('getModalHost()', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div id="${DOMIds.TAB_PROXY}" class="tab-content"></div>
                <div id="${DOMIds.TAB_PRESETS}" class="tab-content"></div>
                <div id="${DOMIds.TAB_SETTINGS}" class="tab-content"></div>
            `;
        });

        it('в попапе возвращает document.body независимо от колонки', () => {
            expect(getModalHost('proxy')).toBe(document.body);
            expect(getModalHost()).toBe(document.body);
        });

        it('в page-режиме возвращает элемент колонки по её TabId', () => {
            window.history.replaceState({}, '', `/popup.html?${PAGE_VIEW_QUERY}`);

            expect(getModalHost('proxy')).toBe(document.getElementById(DOMIds.TAB_PROXY));
            expect(getModalHost('presets')).toBe(document.getElementById(DOMIds.TAB_PRESETS));
            expect(getModalHost('settings')).toBe(document.getElementById(DOMIds.TAB_SETTINGS));
        });

        it('в page-режиме без указания колонки возвращает body', () => {
            window.history.replaceState({}, '', `/popup.html?${PAGE_VIEW_QUERY}`);

            expect(getModalHost()).toBe(document.body);
        });

        it('в page-режиме с отсутствующей в DOM колонкой возвращает body', () => {
            window.history.replaceState({}, '', `/popup.html?${PAGE_VIEW_QUERY}`);
            document.body.innerHTML = '';

            expect(getModalHost('proxy')).toBe(document.body);
        });
    });
});
