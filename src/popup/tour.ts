import { I18n } from '../shared/i18n';
import { Storage } from '../shared/storage';
import { DOMIds, StorageKeys, ProxyState } from '../shared/constants';
import { I18nKey, StorageChanges, Preset, ProxyServer } from '../types';
import { isPageView } from './view-mode';

/**
 * Мастер настройки (обучение): затемнение страницы с «прожектором» на целевой
 * зоне, тултип с подсказкой и стрелкой. Запускается на полностраничном виде
 * по ?tour=1 (приветственная страница → «Мастер настройки»).
 *
 * Шаги: добавление прокси → выбор режима (все сайты / отдельные)
 * → [пресеты, если «отдельные»] → включение прокси → иконка на панели браузера.
 * Шаги с действиями продвигаются автоматически по изменению storage,
 * кнопка «Далее» — ручной обход.
 */

export function isTourRequested(search: string = window.location.search): boolean {
    return new URLSearchParams(search).get('tour') === '1';
}

export type TourStepId = 'add-proxy' | 'mode-choice' | 'add-preset' | 'connect' | 'pin-icon';

type TourPlacement = 'right' | 'top' | 'viewport-top-right';

interface TourStepConfig {
    /** id элемента-цели прожектора; null — затемнение всего окна (шаг про иконку браузера) */
    targetId: string | null;
    /** id элемента, на который смотрит стрелка-указатель; по умолчанию = targetId.
        Позволяет подсветить колонку прожектором, но навести стрелку на кнопку внутри */
    pointerTargetId?: string;
    titleKey: I18nKey;
    textKey: I18nKey;
    placement: TourPlacement;
    buttons: 'next' | 'choice' | 'done';
}

const STEPS: Record<TourStepId, TourStepConfig> = {
    'add-proxy': {
        targetId: DOMIds.TAB_PROXY,
        pointerTargetId: 'add-proxy-btn',
        titleKey: 'tourStepAddProxyTitle',
        textKey: 'tourStepAddProxyText',
        placement: 'right',
        buttons: 'next',
    },
    'mode-choice': {
        targetId: 'proxy-by-default-toggle',
        titleKey: 'tourStepModeTitle',
        textKey: 'tourStepModeText',
        placement: 'top',
        buttons: 'choice',
    },
    'add-preset': {
        targetId: DOMIds.TAB_PRESETS,
        pointerTargetId: 'add-preset-button',
        titleKey: 'tourStepPresetsTitle',
        textKey: 'tourStepPresetsText',
        placement: 'right',
        buttons: 'next',
    },
    'connect': {
        targetId: DOMIds.MAIN_BUTTON,
        titleKey: 'tourStepConnectTitle',
        textKey: 'tourStepConnectText',
        placement: 'top',
        buttons: 'next',
    },
    'pin-icon': {
        targetId: null,
        titleKey: 'tourStepPinTitle',
        textKey: 'tourStepPinText',
        placement: 'viewport-top-right',
        buttons: 'done',
    },
};

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_MARGIN = 16;
const VIEWPORT_CLAMP = 8;
const POINTER_SIZE = 28;

class TourService {
    private path: TourStepId[] = [];
    private stepIndex = -1;
    private spotlight: HTMLDivElement | null = null;
    private tooltip: HTMLDivElement | null = null;
    private pointer: HTMLDivElement | null = null;
    private unsubscribeStorage: (() => void) | null = null;
    private presetsBaseline = 0;
    private readonly reposition = (): void => this.renderPosition();

    /** Запускает мастер, если открыт полностраничный вид с ?tour=1 */
    maybeStart(): void {
        if (!isPageView() || !isTourRequested()) return;
        this.start();
    }

    start(): void {
        if (this.spotlight) return; // уже запущен

        this.path = ['add-proxy', 'mode-choice', 'connect', 'pin-icon'];

        this.spotlight = document.createElement('div');
        this.spotlight.className = 'tour-spotlight';
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tour-tooltip';
        // Прыгающая стрелка-указатель на целевую зону («нажми здесь»)
        this.pointer = document.createElement('div');
        this.pointer.className = 'tour-pointer';
        document.body.appendChild(this.spotlight);
        document.body.appendChild(this.pointer);
        document.body.appendChild(this.tooltip);

        window.addEventListener('resize', this.reposition);
        this.unsubscribeStorage = Storage.onChange((changes) => this.onStorageChange(changes));

        this.goTo(0);
    }

    finish(): void {
        if (!this.spotlight) return;
        this.spotlight.remove();
        this.tooltip?.remove();
        this.pointer?.remove();
        this.spotlight = null;
        this.tooltip = null;
        this.pointer = null;
        window.removeEventListener('resize', this.reposition);
        this.unsubscribeStorage?.();
        this.unsubscribeStorage = null;
        this.stepIndex = -1;

        // Убираем tour из URL: обновление страницы не должно перезапускать мастер
        const url = new URL(window.location.href);
        url.searchParams.delete('tour');
        window.history.replaceState({}, '', url.toString());
    }

    getCurrentStepId(): TourStepId | null {
        return this.stepIndex >= 0 ? this.path[this.stepIndex] : null;
    }

    private next(): void {
        if (this.stepIndex + 1 >= this.path.length) {
            this.finish();
            return;
        }
        this.goTo(this.stepIndex + 1);
    }

    private goTo(index: number): void {
        this.stepIndex = index;
        if (this.path[index] === 'add-preset') {
            // База для автоперехода: шаг завершён, когда пресетов стало больше.
            // До загрузки реального числа блокируем автопереход (иначе событие
            // storage, пришедшее раньше ответа, сравнится с нулевой базой)
            this.presetsBaseline = Number.MAX_SAFE_INTEGER;
            void Storage.getPresets().then((presets: Preset[]) => {
                this.presetsBaseline = presets.length;
            });
        }
        this.renderStep();
    }

    /** Выбор на шаге «что проксировать»: все сайты (true) или отдельные (false) */
    private async chooseMode(allSites: boolean): Promise<void> {
        const current = await Storage.getProxyByDefault();
        // Пока ждали storage, шаг мог смениться (даблклик) или мастер закрыться
        if (this.getCurrentStepId() !== 'mode-choice') return;
        if (current !== allSites) {
            // Кликаем настоящий тумблер — его обработчик обновит storage и UI
            document.getElementById('proxy-by-default-toggle')?.click();
        }
        if (!allSites && !this.path.includes('add-preset')) {
            this.path.splice(this.stepIndex + 1, 0, 'add-preset');
        }
        this.next();
    }

    /** Автопереход: шаг выполнен реальным действием пользователя */
    private onStorageChange(changes: StorageChanges): void {
        switch (this.getCurrentStepId()) {
            case 'add-proxy': {
                const proxies = changes[StorageKeys.PROXIES]?.newValue as ProxyServer[] | undefined;
                if (proxies && proxies.length > 0) this.next();
                break;
            }
            case 'add-preset': {
                const presets = changes[StorageKeys.PRESETS]?.newValue as Preset[] | undefined;
                if (presets && presets.length > this.presetsBaseline) this.next();
                break;
            }
            case 'connect': {
                if (changes[StorageKeys.CURRENT_STATE]?.newValue === ProxyState.CONNECTED) this.next();
                break;
            }
        }
    }

    private renderStep(): void {
        if (!this.tooltip) return;
        const config = STEPS[this.path[this.stepIndex]];

        const arrow = document.createElement('div');
        arrow.className = `tour-arrow tour-arrow--${config.placement}`;

        const counter = document.createElement('div');
        counter.className = 'tour-step-counter';
        counter.textContent = I18n.getMessage('tourStepCounter', [
            String(this.stepIndex + 1),
            String(this.path.length),
        ]);

        const title = document.createElement('h3');
        title.className = 'tour-title';
        title.textContent = I18n.getMessage(config.titleKey);

        const text = document.createElement('p');
        text.className = 'tour-text';
        text.textContent = I18n.getMessage(config.textKey);

        const buttons = document.createElement('div');
        buttons.className = 'tour-buttons';
        if (config.buttons === 'choice') {
            buttons.appendChild(this.makeButton('tourChoiceAllSites', 'tour-btn tour-btn-secondary', () => void this.chooseMode(true)));
            buttons.appendChild(this.makeButton('tourChoiceSelectedSites', 'tour-btn tour-btn-primary', () => void this.chooseMode(false)));
        } else if (config.buttons === 'done') {
            buttons.appendChild(this.makeButton('tourDone', 'tour-btn tour-btn-primary', () => this.finish()));
        } else {
            buttons.appendChild(this.makeButton('tourNext', 'tour-btn tour-btn-primary', () => this.next()));
        }

        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'tour-skip';
        skip.textContent = I18n.getMessage('tourSkip');
        skip.addEventListener('click', () => this.finish());

        this.tooltip.replaceChildren(arrow, counter, title, text, buttons, skip);
        this.renderPosition();
    }

    private makeButton(labelKey: I18nKey, className: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = I18n.getMessage(labelKey);
        button.addEventListener('click', onClick);
        return button;
    }

    private renderPosition(): void {
        if (!this.tooltip || !this.spotlight || this.stepIndex < 0) return;
        const config = STEPS[this.path[this.stepIndex]];
        const target = config.targetId ? document.getElementById(config.targetId) : null;

        if (!target) {
            // Шаг про иконку браузера: затемняем всё окно, тултип в правом верхнем углу
            this.spotlight.classList.add('tour-spotlight--corner');
            this.spotlight.style.cssText = '';
            Object.assign(this.tooltip.style, { left: 'auto', right: '24px', top: '16px' });
            this.positionPointer(null, config.placement);
            return;
        }

        const rect = target.getBoundingClientRect();
        this.spotlight.classList.remove('tour-spotlight--corner');
        Object.assign(this.spotlight.style, {
            left: `${rect.left - SPOTLIGHT_PADDING}px`,
            top: `${rect.top - SPOTLIGHT_PADDING}px`,
            width: `${rect.width + SPOTLIGHT_PADDING * 2}px`,
            height: `${rect.height + SPOTLIGHT_PADDING * 2}px`,
        });
        this.positionTooltip(rect, config.placement);
        // Стрелка смотрит на кнопку (pointerTargetId), если задана и есть в DOM,
        // иначе на цель прожектора
        const pointerTarget = (config.pointerTargetId && document.getElementById(config.pointerTargetId)) || target;
        this.positionPointer(pointerTarget, config.placement);
    }

    /**
     * Прыгающая стрелка у целевой зоны. Направление указывает на цель со стороны
     * тултипа: placement 'right' → стрелка справа от цели смотрит влево;
     * 'top' → сверху смотрит вниз; шаг про иконку браузера → в правом верхнем
     * углу смотрит вверх (на панель расширений).
     */
    private positionPointer(target: HTMLElement | null, placement: TourPlacement): void {
        const pointer = this.pointer;
        if (!pointer) return;
        pointer.style.right = 'auto';
        pointer.dataset.pointsAt = target?.id ?? '';

        if (!target) {
            pointer.className = 'tour-pointer tour-pointer--up';
            pointer.style.left = 'auto';
            pointer.style.right = '56px';
            pointer.style.top = '44px';
            return;
        }

        const rect = target.getBoundingClientRect();
        if (placement === 'right') {
            pointer.className = 'tour-pointer tour-pointer--left';
            pointer.style.left = `${rect.right + SPOTLIGHT_PADDING + 6}px`;
            pointer.style.top = `${rect.top + rect.height / 2 - POINTER_SIZE / 2}px`;
        } else {
            pointer.className = 'tour-pointer tour-pointer--down';
            pointer.style.left = `${rect.left + rect.width / 2 - POINTER_SIZE / 2}px`;
            pointer.style.top = `${rect.top - SPOTLIGHT_PADDING - POINTER_SIZE - 4}px`;
        }
    }

    private positionTooltip(rect: DOMRect, placement: TourPlacement): void {
        const tooltip = this.tooltip!;
        tooltip.style.right = 'auto';
        const width = tooltip.offsetWidth;
        const height = tooltip.offsetHeight;

        let left: number;
        let top: number;
        if (placement === 'right') {
            left = rect.right + SPOTLIGHT_PADDING + TOOLTIP_MARGIN;
            top = rect.top + rect.height / 2 - height / 2;
        } else {
            left = rect.left + rect.width / 2 - width / 2;
            top = rect.top - SPOTLIGHT_PADDING - TOOLTIP_MARGIN - height;
        }

        left = Math.max(VIEWPORT_CLAMP, Math.min(left, window.innerWidth - width - VIEWPORT_CLAMP));
        top = Math.max(VIEWPORT_CLAMP, Math.min(top, window.innerHeight - height - VIEWPORT_CLAMP));
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }
}

export const Tour = new TourService();
