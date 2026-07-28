import { DOMIds } from '../shared/constants';
import { TabId } from '../types';

/** Query-строка, включающая полностраничный режим (открытие во вкладке) */
export const PAGE_VIEW_QUERY = 'view=page';

/** CSS-класс, переключающий раскладку на 3 колонки */
export const PAGE_VIEW_CLASS = 'page-view';

/** Полностраничный режим: popup.html открыт во вкладке с ?view=page */
export function isPageView(search: string = window.location.search): boolean {
    return new URLSearchParams(search).get('view') === 'page';
}

/**
 * Добавляет класс page-view на <html> и <body> — CSS переключает раскладку
 * попапа на 3 колонки. Вызывается из theme-init до первой отрисовки,
 * чтобы не было флеша узкой (280px) раскладки попапа.
 */
export function applyPageViewClass(doc: Document = document): void {
    if (!isPageView(doc.location.search)) return;
    doc.documentElement.classList.add(PAGE_VIEW_CLASS);
    doc.body.classList.add(PAGE_VIEW_CLASS);
}

/**
 * Хост для монтирования модалки. В попапе — document.body (модалка на весь
 * попап). В page-режиме — колонка, к которой модалка относится: overlay
 * (absolute, inset: 0) накрывает только её. Без column или без колонки
 * в DOM — fallback на body.
 */
export function getModalHost(column?: TabId): HTMLElement {
    if (!isPageView() || !column) return document.body;
    return document.getElementById(`tab-${column}`) ?? document.body;
}

class ViewModeService {
    init(): void {
        if (isPageView()) {
            // На полной странице кнопка скрыта CSS-ом и обработчик не нужен
            this.moveControlsToSettingsColumn();
            return;
        }
        const button = document.getElementById(DOMIds.OPEN_IN_TAB_BUTTON);
        button?.addEventListener('click', () => this.openPageView());
    }

    /**
     * В page-режиме кнопка-щит и «проксировать все сайты» переезжают в конец
     * колонки настроек (вниз-вправо их прижимает CSS). Переносятся сами
     * DOM-узлы, поэтому обработчики и getElementById-привязки сохраняются.
     */
    private moveControlsToSettingsColumn(): void {
        const settingsColumn = document.getElementById(DOMIds.TAB_SETTINGS);
        if (!settingsColumn) return;
        const mainButton = document.getElementById(DOMIds.MAIN_BUTTON);
        const proxyByDefaultToggle = document.getElementById('proxy-by-default-toggle');
        if (mainButton) settingsColumn.appendChild(mainButton);
        if (proxyByDefaultToggle) settingsColumn.appendChild(proxyByDefaultToggle);
    }

    private openPageView(): void {
        chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?${PAGE_VIEW_QUERY}`) });
        window.close();
    }
}

export const ViewMode = new ViewModeService();
