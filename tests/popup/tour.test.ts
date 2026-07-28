import { mockHelpers } from '../setup';

jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        getMessage: jest.fn((key: string, subs?: string[]) =>
            subs ? `${key}:${subs.join(',')}` : key
        ),
    },
}));

jest.mock('../../src/shared/storage', () => ({
    Storage: {
        onChange: jest.fn(() => jest.fn()),
        getPresets: jest.fn(() => Promise.resolve([])),
        getProxyByDefault: jest.fn(() => Promise.resolve(true)),
    },
}));

import { Tour, isTourRequested } from '../../src/popup/tour';
import { Storage } from '../../src/shared/storage';
import { DOMIds, StorageKeys, ProxyState } from '../../src/shared/constants';

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function renderPageDom(): void {
    document.body.innerHTML = `
        <div class="container">
            <div id="${DOMIds.TAB_PROXY}" class="tab-content">
                <button id="add-proxy-btn"></button>
            </div>
            <div id="${DOMIds.TAB_PRESETS}" class="tab-content">
                <button id="add-preset-button"></button>
            </div>
            <div id="${DOMIds.TAB_SETTINGS}" class="tab-content">
                <button id="${DOMIds.MAIN_BUTTON}"></button>
                <button id="proxy-by-default-toggle"></button>
            </div>
        </div>
    `;
}

function enterTourUrl(): void {
    window.history.replaceState({}, '', '/popup.html?view=page&tour=1');
}

function tooltip(): HTMLElement {
    return document.querySelector('.tour-tooltip') as HTMLElement;
}

function clickPrimary(): void {
    (tooltip().querySelector('.tour-btn-primary') as HTMLButtonElement).click();
}

function storageCallback(): (changes: Record<string, unknown>) => void {
    return (Storage.onChange as jest.Mock).mock.calls[0][0];
}

describe('tour.ts — мастер настройки', () => {
    beforeEach(() => {
        mockHelpers.resetAllMocks();
        jest.clearAllMocks();
        (Storage.onChange as jest.Mock).mockReturnValue(jest.fn());
        (Storage.getPresets as jest.Mock).mockResolvedValue([]);
        (Storage.getProxyByDefault as jest.Mock).mockResolvedValue(true);
        window.history.replaceState({}, '', '/popup.html');
        document.body.innerHTML = '';
    });

    afterEach(() => {
        Tour.finish();
    });

    describe('isTourRequested()', () => {
        it('true для ?tour=1', () => {
            expect(isTourRequested('?tour=1')).toBe(true);
        });

        it('false для пустой строки и других значений', () => {
            expect(isTourRequested('')).toBe(false);
            expect(isTourRequested('?tour=0')).toBe(false);
        });
    });

    describe('maybeStart()', () => {
        it('не запускается вне page-режима', () => {
            window.history.replaceState({}, '', '/popup.html?tour=1');
            renderPageDom();

            Tour.maybeStart();

            expect(document.querySelector('.tour-spotlight')).toBeNull();
        });

        it('не запускается без ?tour=1', () => {
            window.history.replaceState({}, '', '/popup.html?view=page');
            renderPageDom();

            Tour.maybeStart();

            expect(document.querySelector('.tour-spotlight')).toBeNull();
        });

        it('запускается в page-режиме с ?tour=1 на шаге добавления прокси', () => {
            enterTourUrl();
            renderPageDom();

            Tour.maybeStart();

            expect(document.querySelector('.tour-spotlight')).not.toBeNull();
            expect(Tour.getCurrentStepId()).toBe('add-proxy');
            expect(tooltip().textContent).toContain('tourStepAddProxyTitle');
            expect(tooltip().textContent).toContain('tourStepCounter:1,4');
        });
    });

    describe('стрелка-указатель «нажми здесь»', () => {
        beforeEach(() => {
            enterTourUrl();
            renderPageDom();
            Tour.maybeStart();
        });

        it('присутствует на первом шаге и смотрит влево (тултип справа от колонки)', () => {
            const pointer = document.querySelector('.tour-pointer');
            expect(pointer).not.toBeNull();
            expect(pointer!.classList.contains('tour-pointer--left')).toBe(true);
        });

        it('на шаге прокси наведён на кнопку «добавить прокси»', () => {
            const pointer = document.querySelector('.tour-pointer') as HTMLElement;
            expect(pointer.dataset.pointsAt).toBe('add-proxy-btn');
        });

        it('на шаге пресетов наведён на кнопку «добавить пресет»', async () => {
            clickPrimary(); // → mode-choice
            clickPrimary(); // отдельные сайты → add-preset
            await flush();

            const pointer = document.querySelector('.tour-pointer') as HTMLElement;
            expect(Tour.getCurrentStepId()).toBe('add-preset');
            expect(pointer.dataset.pointsAt).toBe('add-preset-button');
        });

        it('падает обратно на колонку, если кнопки нет в DOM', () => {
            Tour.finish(); // вычищает ?tour=1 из URL
            document.getElementById('add-proxy-btn')!.remove();
            enterTourUrl();
            Tour.maybeStart();

            const pointer = document.querySelector('.tour-pointer') as HTMLElement;
            expect(pointer.dataset.pointsAt).toBe(DOMIds.TAB_PROXY);
        });

        it('на шаге включения прокси смотрит вниз (тултип над щитом)', async () => {
            clickPrimary(); // → mode-choice
            (tooltip().querySelector('.tour-btn-secondary') as HTMLButtonElement).click(); // все сайты
            await flush(); // → connect

            const pointer = document.querySelector('.tour-pointer')!;
            expect(pointer.classList.contains('tour-pointer--down')).toBe(true);
        });

        it('на шаге про иконку браузера смотрит вверх (к панели расширений)', async () => {
            clickPrimary();
            (tooltip().querySelector('.tour-btn-secondary') as HTMLButtonElement).click();
            await flush();
            clickPrimary(); // connect → pin-icon

            const pointer = document.querySelector('.tour-pointer')!;
            expect(pointer.classList.contains('tour-pointer--up')).toBe(true);
        });

        it('удаляется вместе с мастером при завершении', () => {
            (tooltip().querySelector('.tour-skip') as HTMLButtonElement).click();
            expect(document.querySelector('.tour-pointer')).toBeNull();
        });
    });

    describe('переходы по шагам', () => {
        beforeEach(() => {
            enterTourUrl();
            renderPageDom();
            Tour.maybeStart();
        });

        it('«Далее» ведёт с шага прокси на выбор режима с двумя кнопками', () => {
            clickPrimary();

            expect(Tour.getCurrentStepId()).toBe('mode-choice');
            expect(tooltip().textContent).toContain('tourChoiceAllSites');
            expect(tooltip().textContent).toContain('tourChoiceSelectedSites');
        });

        it('выбор «все сайты» пропускает пресеты и ведёт к включению прокси', async () => {
            clickPrimary(); // → mode-choice
            (tooltip().querySelector('.tour-btn-secondary') as HTMLButtonElement).click(); // все сайты
            await flush();

            expect(Tour.getCurrentStepId()).toBe('connect');
            expect(tooltip().textContent).toContain('tourStepCounter:3,4');
        });

        it('выбор «отдельные сайты» добавляет шаг пресетов', async () => {
            clickPrimary(); // → mode-choice
            clickPrimary(); // отдельные сайты (primary)
            await flush();

            expect(Tour.getCurrentStepId()).toBe('add-preset');
            expect(tooltip().textContent).toContain('tourStepCounter:3,5');
        });

        it('выбор «отдельные сайты» при активном «проксировать всё» кликает тумблер', async () => {
            (Storage.getProxyByDefault as jest.Mock).mockResolvedValue(true);
            const toggleClick = jest.fn();
            document.getElementById('proxy-by-default-toggle')!.addEventListener('click', toggleClick);

            clickPrimary(); // → mode-choice
            clickPrimary(); // отдельные сайты
            await flush();

            expect(toggleClick).toHaveBeenCalled();
        });

        it('выбор «все сайты» при уже включённом режиме не кликает тумблер', async () => {
            (Storage.getProxyByDefault as jest.Mock).mockResolvedValue(true);
            const toggleClick = jest.fn();
            document.getElementById('proxy-by-default-toggle')!.addEventListener('click', toggleClick);

            clickPrimary(); // → mode-choice
            (tooltip().querySelector('.tour-btn-secondary') as HTMLButtonElement).click();
            await flush();

            expect(toggleClick).not.toHaveBeenCalled();
        });

        it('последний шаг — иконка браузера: затемнение всего окна и кнопка «Готово»', async () => {
            clickPrimary(); // → mode-choice
            (tooltip().querySelector('.tour-btn-secondary') as HTMLButtonElement).click(); // все сайты
            await flush();
            clickPrimary(); // connect → pin-icon

            expect(Tour.getCurrentStepId()).toBe('pin-icon');
            expect(document.querySelector('.tour-spotlight--corner')).not.toBeNull();
            expect(tooltip().textContent).toContain('tourDone');
        });

        it('«Готово» завершает мастер и чистит DOM и URL', async () => {
            clickPrimary();
            (tooltip().querySelector('.tour-btn-secondary') as HTMLButtonElement).click();
            await flush();
            clickPrimary(); // → pin-icon
            clickPrimary(); // Готово

            expect(document.querySelector('.tour-spotlight')).toBeNull();
            expect(document.querySelector('.tour-tooltip')).toBeNull();
            expect(window.location.search).not.toContain('tour=1');
        });

        it('«Пропустить обучение» завершает мастер с любого шага', () => {
            (tooltip().querySelector('.tour-skip') as HTMLButtonElement).click();

            expect(document.querySelector('.tour-spotlight')).toBeNull();
            expect(Tour.getCurrentStepId()).toBeNull();
        });
    });

    describe('автопереходы по изменениям storage', () => {
        beforeEach(() => {
            enterTourUrl();
            renderPageDom();
            Tour.maybeStart();
        });

        it('добавление прокси продвигает шаг 1', () => {
            storageCallback()({
                [StorageKeys.PROXIES]: { newValue: [{ id: 'p1' }] },
            });

            expect(Tour.getCurrentStepId()).toBe('mode-choice');
        });

        it('пустой список прокси не продвигает шаг 1', () => {
            storageCallback()({
                [StorageKeys.PROXIES]: { newValue: [] },
            });

            expect(Tour.getCurrentStepId()).toBe('add-proxy');
        });

        it('новый пресет продвигает шаг пресетов', async () => {
            (Storage.getPresets as jest.Mock).mockResolvedValue([{ id: 'default' }]);
            clickPrimary(); // → mode-choice
            clickPrimary(); // отдельные сайты
            await flush(); // → add-preset, baseline = 1

            storageCallback()({
                [StorageKeys.PRESETS]: { newValue: [{ id: 'default' }, { id: 'new' }] },
            });

            expect(Tour.getCurrentStepId()).toBe('connect');
        });

        it('подключение продвигает шаг включения прокси', async () => {
            clickPrimary(); // → mode-choice
            (tooltip().querySelector('.tour-btn-secondary') as HTMLButtonElement).click();
            await flush(); // → connect

            storageCallback()({
                [StorageKeys.CURRENT_STATE]: { newValue: ProxyState.CONNECTED },
            });

            expect(Tour.getCurrentStepId()).toBe('pin-icon');
        });

        it('чужие изменения storage не продвигают шаги', () => {
            storageCallback()({
                [StorageKeys.THEME]: { newValue: 'dark' },
            });

            expect(Tour.getCurrentStepId()).toBe('add-proxy');
        });
    });
});
