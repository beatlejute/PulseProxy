/**
 * @jest-environment jsdom
 */

import {
    validateIpPortFormat,
    normalizeProxySearchQuery,
    createPublicProxiesWarning,
    createPublicProxyItem,
    createLiveStatusElement,
    showPublicProxiesModal,
    clearPublicProxiesCache,
    excludeAddedProxies,
    PublicProxyItemCheckOptions,
} from '../../src/popup/public-proxies-modal';
import { checkProxyBeforeAdd } from '../../src/popup/proxy-form-modal';
import { Storage } from '../../src/shared/storage';
import { fetchWithFallback } from '../../src/shared/fetch-with-fallback';
import { NormalizedPublicProxy, ProxyServer } from '../../src/types';

jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        getMessage: jest.fn((key: string) => key),
        applyTranslations: jest.fn(),
    },
}));

jest.mock('../../src/shared/analytics', () => ({
    trackEvent: jest.fn().mockResolvedValue(undefined),
    buildAffiliateUrl: jest.fn((url: string, placement: string) => `${url}?utm_source=${placement}`),
}));

jest.mock('../../src/shared/remote-config', () => ({
    RemoteConfig: { referralLink: 'https://example.com/ref' },
}));

jest.mock('../../src/popup/proxy-form-modal', () => ({
    checkProxyBeforeAdd: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/shared/storage', () => ({
    Storage: {
        getProxies: jest.fn().mockResolvedValue([]),
        getProxyCheckEnabled: jest.fn().mockResolvedValue(false),
        getPublicProxiesWarningDismissed: jest.fn().mockResolvedValue(false),
        setPublicProxiesWarningDismissed: jest.fn().mockResolvedValue(undefined),
        getPublicProxiesFiltersCollapsed: jest.fn().mockResolvedValue(false),
        setPublicProxiesFiltersCollapsed: jest.fn().mockResolvedValue(undefined),
        getPublicProxyCheckResults: jest.fn().mockResolvedValue({}),
        mergePublicProxyCheckResults: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('../../src/shared/fetch-with-fallback', () => ({
    fetchWithFallback: jest.fn().mockResolvedValue({ http: [], https: [], socks4: [], socks5: [] }),
}));

describe('validateIpPortFormat()', () => {
    it('Тест 1: валидный IP:Port (1.2.3.4:8080) → возвращает true, подсказка не показывается', () => {
        const input = '1.2.3.4:8080';
        const isValid = validateIpPortFormat(input);
        const showHint = input.length >= 4 && !isValid;

        expect(isValid).toBe(true);
        expect(showHint).toBe(false);
    });

    it('Тест 2: невалидный IP:Port длиной 4+ символа (not-an-ip) → возвращает false, подсказка показывается', () => {
        const input = 'not-an-ip';
        const isValid = validateIpPortFormat(input);
        const showHint = input.length >= 4 && !isValid;

        expect(isValid).toBe(false);
        expect(showHint).toBe(true);
    });

    it('Тест 3: короткая строка менее 4 символов (abc) → подсказка не показывается', () => {
        const input = 'abc';
        const showHint = input.length >= 4 && !validateIpPortFormat(input);

        expect(showHint).toBe(false);
    });
});

describe('normalizeProxySearchQuery()', () => {
    it('Тест 1: URL с протоколом и кредами (http://user:pass@1.2.3.4:8080) → 1.2.3.4:8080', () => {
        expect(normalizeProxySearchQuery('http://user:pass@1.2.3.4:8080')).toBe('1.2.3.4:8080');
    });

    it('Тест 2: URL только с протоколом (socks5://1.2.3.4:1080) → 1.2.3.4:1080', () => {
        expect(normalizeProxySearchQuery('socks5://1.2.3.4:1080')).toBe('1.2.3.4:1080');
    });

    it('Тест 3: креды без протокола (user:pass@1.2.3.4:8080) → 1.2.3.4:8080', () => {
        expect(normalizeProxySearchQuery('user:pass@1.2.3.4:8080')).toBe('1.2.3.4:8080');
    });

    it('Тест 4: формат ip:port:user:pass (1.2.3.4:8080:user:pass) → 1.2.3.4:8080', () => {
        expect(normalizeProxySearchQuery('1.2.3.4:8080:user:pass')).toBe('1.2.3.4:8080');
    });

    it('Тест 5: URL с trailing slash (http://1.2.3.4:8080/) → 1.2.3.4:8080', () => {
        expect(normalizeProxySearchQuery('http://1.2.3.4:8080/')).toBe('1.2.3.4:8080');
    });

    it('Тест 6: пароль с @ внутри (user:p@ss@1.2.3.4:8080) → 1.2.3.4:8080', () => {
        expect(normalizeProxySearchQuery('user:p@ss@1.2.3.4:8080')).toBe('1.2.3.4:8080');
    });

    it('Тест 7: чистый ip:port и частичный ввод не изменяются, пробелы обрезаются', () => {
        expect(normalizeProxySearchQuery('1.2.3.4:8080')).toBe('1.2.3.4:8080');
        expect(normalizeProxySearchQuery('1.2.3')).toBe('1.2.3');
        expect(normalizeProxySearchQuery('  1.2.3.4:8080  ')).toBe('1.2.3.4:8080');
    });
});

describe('showPublicProxiesModal() — нормализация поискового запроса', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
        clearPublicProxiesCache();
        (fetchWithFallback as jest.Mock).mockResolvedValue({
            http: [
                { ip: '1.2.3.4:8080', score: 4.5, type: 'Residential', country: 'US' },
                { ip: '5.6.7.8:3128', score: 4.0, type: 'Corporate', country: 'DE' },
            ],
            https: [], socks4: [], socks5: [],
        });
    });

    it('вставка URL с протоколом и кредами приводит инпут к ip:port и фильтрует список', async () => {
        await showPublicProxiesModal(jest.fn());

        const input = document.querySelector('.public-proxy-search-input') as HTMLInputElement;
        input.value = 'http://user:pass@1.2.3.4:8080';
        input.dispatchEvent(new Event('input'));

        expect(input.value).toBe('1.2.3.4:8080');
        const items = document.querySelectorAll('.public-proxy-item');
        expect(items).toHaveLength(1);
        expect(items[0].textContent).toContain('1.2.3.4:8080');
    });

    it('подсказка о формате не показывается для нормализованного URL', async () => {
        await showPublicProxiesModal(jest.fn());

        const input = document.querySelector('.public-proxy-search-input') as HTMLInputElement;
        input.value = 'socks5://user:pass@5.6.7.8:3128';
        input.dispatchEvent(new Event('input'));

        const hint = document.querySelector('.validation-hint') as HTMLElement;
        expect(hint.style.display).toBe('none');
    });
});

describe('createPublicProxiesWarning()', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
    });

    it('содержит кнопку-крестик закрытия', () => {
        const warning = createPublicProxiesWarning();

        const closeBtn = warning.querySelector('.warning-close');
        expect(closeBtn).not.toBeNull();
        expect(closeBtn!.textContent).toBe('×');
    });

    it('клик по крестику удаляет блок и сохраняет флаг «не показывать снова»', () => {
        const warning = createPublicProxiesWarning();
        document.body.appendChild(warning);

        (warning.querySelector('.warning-close') as HTMLButtonElement).click();

        expect(document.querySelector('.public-proxies-warning')).toBeNull();
        expect(Storage.setPublicProxiesWarningDismissed).toHaveBeenCalledWith(true);
    });
});

describe('showPublicProxiesModal() — видимость предупреждения', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
        clearPublicProxiesCache();
        (fetchWithFallback as jest.Mock).mockResolvedValue({ http: [], https: [], socks4: [], socks5: [] });
    });

    it('показывает предупреждение, если флаг не выставлен', async () => {
        (Storage.getPublicProxiesWarningDismissed as jest.Mock).mockResolvedValue(false);

        await showPublicProxiesModal(jest.fn());

        expect(document.querySelector('.public-proxies-warning')).not.toBeNull();
    });

    it('не показывает предупреждение, если оно было закрыто ранее', async () => {
        (Storage.getPublicProxiesWarningDismissed as jest.Mock).mockResolvedValue(true);

        await showPublicProxiesModal(jest.fn());

        expect(document.querySelector('.public-proxies-warning')).toBeNull();
    });
});

describe('showPublicProxiesModal() — сворачивание фильтров', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
        clearPublicProxiesCache();
        (fetchWithFallback as jest.Mock).mockResolvedValue({
            http: [
                { ip: '1.2.3.4:8080', score: 4.5, type: 'Residential', country: 'US' },
            ],
            https: [], socks4: [],
            socks5: [
                { ip: '5.6.7.8:1080', score: 4.0, type: 'Corporate', country: 'DE' },
            ],
        });
    });

    it('по умолчанию фильтры развёрнуты, кнопка с подписью «скрыть» и aria-expanded="true"', async () => {
        (Storage.getPublicProxiesFiltersCollapsed as jest.Mock).mockResolvedValue(false);

        await showPublicProxiesModal(jest.fn());

        const toggle = document.querySelector('.filters-toggle') as HTMLButtonElement;
        const filters = document.querySelector('.public-proxies-filters') as HTMLElement;
        const search = document.querySelector('.public-proxy-search') as HTMLElement;
        expect(toggle).not.toBeNull();
        expect(filters.classList.contains('collapsed')).toBe(false);
        expect(search.classList.contains('collapsed')).toBe(false);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(toggle.getAttribute('data-i18n')).toBe('publicProxiesHideFilters');
    });

    it('клик сворачивает фильтры и поиск, меняет подпись и сохраняет состояние в storage', async () => {
        (Storage.getPublicProxiesFiltersCollapsed as jest.Mock).mockResolvedValue(false);

        await showPublicProxiesModal(jest.fn());
        (document.querySelector('.filters-toggle') as HTMLButtonElement).click();

        const toggle = document.querySelector('.filters-toggle') as HTMLButtonElement;
        const filters = document.querySelector('.public-proxies-filters') as HTMLElement;
        const search = document.querySelector('.public-proxy-search') as HTMLElement;
        expect(filters.classList.contains('collapsed')).toBe(true);
        expect(search.classList.contains('collapsed')).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(toggle.getAttribute('data-i18n')).toBe('publicProxiesShowFilters');
        expect(Storage.setPublicProxiesFiltersCollapsed).toHaveBeenCalledWith(true);
    });

    it('при сохранённом свёрнутом состоянии модалка открывается со свёрнутыми фильтрами и поиском', async () => {
        (Storage.getPublicProxiesFiltersCollapsed as jest.Mock).mockResolvedValue(true);

        await showPublicProxiesModal(jest.fn());

        const toggle = document.querySelector('.filters-toggle') as HTMLButtonElement;
        const filters = document.querySelector('.public-proxies-filters') as HTMLElement;
        const search = document.querySelector('.public-proxy-search') as HTMLElement;
        expect(filters.classList.contains('collapsed')).toBe(true);
        expect(search.classList.contains('collapsed')).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(toggle.getAttribute('data-i18n')).toBe('publicProxiesShowFilters');
    });

    it('сворачивание не сбрасывает значения фильтров — список остаётся отфильтрованным', async () => {
        (Storage.getPublicProxiesFiltersCollapsed as jest.Mock).mockResolvedValue(false);

        await showPublicProxiesModal(jest.fn());

        const protocolSelect = document.querySelector('#filter-protocol') as HTMLSelectElement;
        protocolSelect.value = 'http';
        protocolSelect.dispatchEvent(new Event('change'));

        (document.querySelector('.filters-toggle') as HTMLButtonElement).click();

        expect((document.querySelector('#filter-protocol') as HTMLSelectElement).value).toBe('http');
        const items = document.querySelectorAll('.public-proxy-item');
        expect(items).toHaveLength(1);
        expect(items[0].textContent).toContain('1.2.3.4:8080');
    });
});

function makeNormalizedProxy(overrides: Partial<NormalizedPublicProxy> = {}): NormalizedPublicProxy {
    return {
        protocol: 'http',
        ip: '1.2.3.4',
        port: 8080,
        score: 4.5,
        connectionType: 'residential',
        country: 'US',
        ...overrides,
    };
}

function makeCheckOptions(overrides: Partial<PublicProxyItemCheckOptions> = {}): PublicProxyItemCheckOptions {
    return {
        getStatus: jest.fn().mockReturnValue('unchecked'),
        onCheckRequested: jest.fn(),
        suspendChecks: jest.fn().mockResolvedValue(undefined),
        resumeChecks: jest.fn(),
        ...overrides,
    };
}

describe('createLiveStatusElement()', () => {
    it('unchecked → кнопка «Проверить» вместо значка; клик вызывает onCheckRequested', () => {
        const proxy = makeNormalizedProxy();
        const options = makeCheckOptions({ getStatus: jest.fn().mockReturnValue('unchecked') });

        const el = createLiveStatusElement(proxy, options);

        expect(el.tagName).toBe('BUTTON');
        expect(el.className).toBe('proxy-check-now-btn');
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(options.onCheckRequested).toHaveBeenCalledWith(proxy);
    });

    it.each([
        ['alive'],
        ['dead'],
        ['checking'],
    ])('статус %s → точка-индикатор с соответствующим классом и тултипом', (status) => {
        const options = makeCheckOptions({ getStatus: jest.fn().mockReturnValue(status) });

        const el = createLiveStatusElement(makeNormalizedProxy(), options);

        expect(el.tagName).toBe('SPAN');
        expect(el.classList.contains('proxy-live-status')).toBe(true);
        expect(el.classList.contains(status as string)).toBe(true);
        expect(el.getAttribute('title')).toBeTruthy();
    });
});

describe('createPublicProxyItem() — индикатор живости', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('без checkOptions индикатор и кнопка не отображаются', () => {
        const item = createPublicProxyItem(makeNormalizedProxy(), jest.fn(), jest.fn());

        expect(item.querySelector('.proxy-live-status')).toBeNull();
        expect(item.querySelector('.proxy-check-now-btn')).toBeNull();
    });

    it('клик по кнопке «Проверить» не открывает добавление прокси (stopPropagation)', () => {
        const onProxyAdded = jest.fn();
        const options = makeCheckOptions();
        const item = createPublicProxyItem(makeNormalizedProxy(), jest.fn(), onProxyAdded, options);
        document.body.appendChild(item);

        const btn = item.querySelector('.proxy-check-now-btn') as HTMLButtonElement;
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(options.onCheckRequested).toHaveBeenCalled();
        expect(onProxyAdded).not.toHaveBeenCalled();
    });

    it('при проверке перед добавлением сессия приостанавливается, при отказе — возобновляется', async () => {
        (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(true);
        (checkProxyBeforeAdd as jest.Mock).mockResolvedValueOnce(false);
        const onProxyAdded = jest.fn();
        const options = makeCheckOptions({ getStatus: jest.fn().mockReturnValue('alive') });
        const item = createPublicProxyItem(makeNormalizedProxy(), jest.fn(), onProxyAdded, options);
        document.body.appendChild(item);

        item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(options.suspendChecks).toHaveBeenCalled();
        expect(checkProxyBeforeAdd).toHaveBeenCalled();
        expect(onProxyAdded).not.toHaveBeenCalled();
        expect(options.resumeChecks).toHaveBeenCalled();

        (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(false);
    });

    it('reject проверки убирает блокирующий оверлей и возобновляет сессию (нет вечного оверлея)', async () => {
        // Регрессия: reject checkProxyBeforeAdd (выгруженный SW) раньше оставлял
        // проверочный оверлей навсегда, а сессию — приостановленной.
        (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(true);
        (checkProxyBeforeAdd as jest.Mock).mockRejectedValueOnce(new Error('Could not establish connection'));
        const onProxyAdded = jest.fn();
        const options = makeCheckOptions({ getStatus: jest.fn().mockReturnValue('alive') });

        // Контейнер модалки, к которому реально прикрепляется блокирующий оверлей
        const modalEl = document.createElement('div');
        modalEl.className = 'public-proxies-modal';
        document.body.appendChild(modalEl);

        const item = createPublicProxyItem(makeNormalizedProxy(), jest.fn(), onProxyAdded, options);
        modalEl.appendChild(item);

        item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(document.querySelector('.proxy-checking-overlay')).toBeNull();
        expect(options.resumeChecks).toHaveBeenCalled();
        expect(onProxyAdded).not.toHaveBeenCalled();

        (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(false);
    });
});

describe('showPublicProxiesModal() — фоновая проверка и сортировка по живости', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
        clearPublicProxiesCache();
        (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(false);
        (Storage.getPublicProxiesWarningDismissed as jest.Mock).mockResolvedValue(false);
        (Storage.getPublicProxiesFiltersCollapsed as jest.Mock).mockResolvedValue(false);
        (fetchWithFallback as jest.Mock).mockResolvedValue({
            http: [
                { ip: '1.2.3.4:8080', score: 4.5, type: 'Residential', country: 'US' },
                { ip: '5.6.7.8:3128', score: 4.0, type: 'Corporate', country: 'DE' },
            ],
            https: [], socks4: [], socks5: [],
        });
    });

    it('рабочие из кеша поднимаются вверх, нерабочие — вниз, с точками-индикаторами', async () => {
        (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(true);
        (Storage.getPublicProxyCheckResults as jest.Mock).mockResolvedValue({
            'http://1.2.3.4:8080': { status: 'dead', checkedAt: Date.now() },
            'http://5.6.7.8:3128': { status: 'alive', checkedAt: Date.now() },
        });

        await showPublicProxiesModal(jest.fn());

        const items = document.querySelectorAll('.public-proxy-item');
        expect(items).toHaveLength(2);
        // alive выше, несмотря на меньший score
        expect(items[0].textContent).toContain('5.6.7.8:3128');
        expect(items[1].textContent).toContain('1.2.3.4:8080');
        expect(items[0].querySelector('.proxy-live-status.alive')).not.toBeNull();
        expect(items[1].querySelector('.proxy-live-status.dead')).not.toBeNull();
    });

    it('функционал выключен настройкой proxyCheckEnabled → без индикаторов и кнопок, сортировка по score', async () => {
        (Storage.getProxyCheckEnabled as jest.Mock).mockResolvedValue(false);

        await showPublicProxiesModal(jest.fn());

        const items = document.querySelectorAll('.public-proxy-item');
        expect(items[0].textContent).toContain('1.2.3.4:8080'); // выше по score
        expect(document.querySelector('.proxy-live-status')).toBeNull();
        expect(document.querySelector('.proxy-check-now-btn')).toBeNull();
    });
});

function makeSavedProxy(overrides: Partial<ProxyServer> = {}): ProxyServer {
    return {
        id: 'saved-1',
        type: 'http',
        host: '1.2.3.4',
        port: 8080,
        isDefault: false,
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
    };
}

describe('excludeAddedProxies()', () => {
    it('исключает прокси, совпадающие с сохранёнными по протоколу, хосту и порту', () => {
        const proxies = [
            makeNormalizedProxy({ ip: '1.2.3.4', port: 8080 }),
            makeNormalizedProxy({ ip: '5.6.7.8', port: 3128 }),
        ];
        const saved = [makeSavedProxy({ type: 'http', host: '1.2.3.4', port: 8080 })];

        const result = excludeAddedProxies(proxies, saved);

        expect(result).toHaveLength(1);
        expect(result[0].ip).toBe('5.6.7.8');
    });

    it('не исключает при совпадении хост:порт, но другом протоколе', () => {
        const proxies = [makeNormalizedProxy({ protocol: 'socks5', ip: '1.2.3.4', port: 8080 })];
        const saved = [makeSavedProxy({ type: 'http', host: '1.2.3.4', port: 8080 })];

        expect(excludeAddedProxies(proxies, saved)).toHaveLength(1);
    });

    it('пустой список сохранённых → возвращает все прокси', () => {
        const proxies = [makeNormalizedProxy()];

        expect(excludeAddedProxies(proxies, [])).toEqual(proxies);
    });
});

describe('showPublicProxiesModal() — скрытие уже добавленных прокси', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        document.body.innerHTML = '';
        clearPublicProxiesCache();
        (fetchWithFallback as jest.Mock).mockResolvedValue({
            http: [
                { ip: '1.2.3.4:8080', score: 4.5, type: 'Residential', country: 'US' },
                { ip: '5.6.7.8:3128', score: 4.0, type: 'Corporate', country: 'DE' },
            ],
            https: [], socks4: [], socks5: [],
        });
    });

    it('уже добавленный прокси не отображается в списке', async () => {
        (Storage.getProxies as jest.Mock).mockResolvedValue([
            makeSavedProxy({ type: 'http', host: '1.2.3.4', port: 8080 }),
        ]);

        await showPublicProxiesModal(jest.fn());

        const items = document.querySelectorAll('.public-proxy-item');
        expect(items).toHaveLength(1);
        expect(items[0].textContent).toContain('5.6.7.8:3128');
    });

    it('страна скрытого прокси не попадает в фильтр по странам', async () => {
        (Storage.getProxies as jest.Mock).mockResolvedValue([
            makeSavedProxy({ type: 'http', host: '1.2.3.4', port: 8080 }),
        ]);

        await showPublicProxiesModal(jest.fn());

        const countrySelect = document.querySelector('#filter-country') as HTMLSelectElement;
        const values = Array.from(countrySelect.options).map(o => o.value);
        expect(values).not.toContain('US');
        expect(values).toContain('DE');
    });

    it('без сохранённых прокси список показывается полностью', async () => {
        (Storage.getProxies as jest.Mock).mockResolvedValue([]);

        await showPublicProxiesModal(jest.fn());

        expect(document.querySelectorAll('.public-proxy-item')).toHaveLength(2);
    });
});
