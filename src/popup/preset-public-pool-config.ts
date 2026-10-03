import { I18n } from '../shared/i18n';
import { I18nKey, Preset, ProxyType, PublicPoolConfig, NormalizedPublicProxy } from '../types';
import { createElementFromTemplate } from './safe-dom';
import { PublicProxyCatalog } from '../shared/public-proxy-catalog';
import { Storage } from '../shared/storage';
import { poolMemberKey, resolvePoolMembers } from '../shared/public-pool';
import { GeoBlockConfig } from '../shared/constants';
import { countryCodeToFlag, getConnectionTypeLabel } from './public-proxies-modal';

// Константы для типов прокси
const PROXY_TYPES: ProxyType[] = ['http', 'https', 'socks4', 'socks5'];

export async function createPublicPoolConfigBlock(
    preset: Preset,
    onChange: (config: PublicPoolConfig) => void
): Promise<HTMLElement> {
    // Создаём основной контейнер
    const container = createElementFromTemplate<HTMLDivElement>('div', {
        className: 'preset-pool-config'
    });

    // Создаём контейнер для протокол-чекбоксов
    const protocolsContainer = createElementFromTemplate<HTMLDivElement>('div', {
        className: 'pool-protocols'
    });

    // Создаём чекбоксы для каждого протокола
    let currentConfig: PublicPoolConfig = {
        ...(preset.publicPool || { protocols: [] }),
        protocols: [...(preset.publicPool?.protocols || [])],
    };
    const currentProtocols = [...currentConfig.protocols];

    // Создаём заголовок (если нужно)
    const title = createElementFromTemplate<HTMLHeadingElement>('h4', {
        className: 'pool-title',
        textContent: I18n.getMessage('publicPoolProtocols')
    });

    protocolsContainer.appendChild(title);

    // Создаём чекбоксы
    const checkboxes: HTMLInputElement[] = [];

    PROXY_TYPES.forEach((protocol) => {
        const isChecked = currentProtocols.includes(protocol);
        const label = createElementFromTemplate<HTMLLabelElement>('label', {
            className: 'protocol-checkbox'
        });

        const checkbox = createElementFromTemplate<HTMLInputElement>('input', {
            type: 'checkbox',
            value: protocol,
            className: 'protocol-checkbox-input',
            checked: isChecked,
            dataset: { protocol }
        });

        // Предотвращаем снятие последнего отмеченного чекбокса
        checkbox.addEventListener('change', () => {
            let wasLastProtocol = false;
            if (!checkbox.checked) {
                // Событие change приходит после снятия: если отмеченных не осталось,
                // это был последний отмеченный — возвращаем его обратно
                const checkedCount = checkboxes.filter(cb => cb.checked).length;
                if (checkedCount === 0) {
                    checkbox.checked = true;
                    wasLastProtocol = true;
                }
            }
            if (!wasLastProtocol) updateProtocols();
        });

        const labelTextMap: Record<ProxyType, I18nKey> = {
            http: 'proxyTypeHttp',
            https: 'proxyTypeHttps',
            socks4: 'proxyTypeSocks4',
            socks5: 'proxyTypeSocks5',
        };

        const labelText = labelTextMap[protocol];

        const checkboxLabel = createElementFromTemplate<HTMLSpanElement>('span', {
            className: 'protocol-checkbox-label',
            textContent: I18n.getMessage(labelText)
        });

        label.appendChild(checkbox);
        label.appendChild(checkboxLabel);
        protocolsContainer.appendChild(label);
        checkboxes.push(checkbox);

        if (protocol === 'http') {
            const httpHint = createElementFromTemplate<HTMLParagraphElement>('p', {
                className: 'pool-hint http-hint',
                textContent: I18n.getMessage('publicPoolHttpHint')
            });
            protocolsContainer.appendChild(httpHint);
        }
    });

    function updateProtocols(): void {
        const checkedProtocols = checkboxes
            .filter(cb => cb.checked)
            .map(cb => cb.value as ProxyType);

        currentConfig = { ...currentConfig, protocols: checkedProtocols };
        onChange(currentConfig);
    }

    // Создаём общую подсказку
    const hintContainer = createElementFromTemplate<HTMLDivElement>('div', {
        className: 'pool-hint-container'
    });

    const hint = createElementFromTemplate<HTMLParagraphElement>('p', {
        className: 'pool-hint',
        textContent: I18n.getMessage('publicPoolHint')
    });

    hintContainer.appendChild(hint);
    container.appendChild(hintContainer);

    // Создаём фильтры (страна, тип, мин. рейтинг)
    await createFilterSelects(container, currentConfig, (patch) => {
        currentConfig = { ...currentConfig, ...patch };
        Object.entries(patch).forEach(([key, value]) => {
            if (value === undefined) delete (currentConfig as unknown as Record<string, unknown>)[key];
        });
        onChange(currentConfig);
    });

    // Добавляем контейнер с протоколами
    container.appendChild(protocolsContainer);

    // Строка статуса пула: кандидаты и живые по текущему конфигу блока
    const status = createElementFromTemplate<HTMLDivElement>('div', {
        className: 'pool-status'
    });
    container.appendChild(status);

    // Строка с числом убранных по гео-блоку прокси и кнопкой возврата
    const geoRemoved = createElementFromTemplate<HTMLDivElement>('div', {
        className: 'pool-geo-removed'
    });
    const geoRemovedText = createElementFromTemplate<HTMLSpanElement>('span', {
        className: 'pool-geo-removed-text'
    });
    const geoRestoreBtn = createElementFromTemplate<HTMLButtonElement>('button', {
        type: 'button',
        className: 'pool-geo-restore-btn',
        textContent: I18n.getMessage('publicPoolGeoRestore')
    });
    geoRemoved.appendChild(geoRemovedText);
    geoRemoved.appendChild(geoRestoreBtn);
    container.appendChild(geoRemoved);

    async function loadCatalog(): Promise<NormalizedPublicProxy[]> {
        try {
            return await PublicProxyCatalog.get();
        } catch {
            // Каталог недоступен — блок остаётся рабочим, пул считается пустым
            return [];
        }
    }

    async function updatePoolStatus(): Promise<void> {
        const [catalog, results] = await Promise.all([
            loadCatalog(),
            Storage.getPublicProxyCheckResults(),
        ]);
        const { members } = resolvePoolMembers(currentConfig, catalog, results, Date.now());
        if (members.length === 0) {
            status.textContent = I18n.getMessage('publicPoolEmpty');
            status.classList.add('pool-status--empty');
            return;
        }
        const aliveCount = members.filter(
            member => results[poolMemberKey(member)]?.status === 'alive'
        ).length;
        status.textContent = I18n.getMessage('publicPoolStatus', [
            String(members.length),
            String(aliveCount),
        ]);
        status.classList.remove('pool-status--empty');
    }

    // Число исключений пресета из каталога (задача 29 плана PLAN-020) и наличие
    // остановленных по стрику сайтов — видимость строки и кнопки зависит от обоих.
    async function updateGeoRemoved(): Promise<void> {
        const [catalog, presetExclusions, geoSites] = await Promise.all([
            loadCatalog(),
            Storage.getPresetGeoExclusions(preset.id),
            Storage.getPublicPoolGeoSites(),
        ]);
        const catalogKeys = new Set(catalog.map(poolMemberKey));
        const removedCount = Object.keys(presetExclusions).filter(key => catalogKeys.has(key)).length;

        const now = Date.now();
        const presetSites = geoSites[preset.id] ?? {};
        const hasStoppedSite = Object.values(presetSites).some(
            site => site.stoppedAt !== null && now - site.stoppedAt < GeoBlockConfig.SITE_STOP_MS
        );

        const visible = removedCount > 0 || hasStoppedSite;
        geoRemoved.classList.toggle('pool-geo-removed--visible', visible);
        if (visible) {
            geoRemovedText.textContent = I18n.getMessage('publicPoolGeoRemoved', [String(removedCount)]);
        }
    }

    geoRestoreBtn.addEventListener('click', () => {
        void (async () => {
            await Promise.all([
                Storage.deletePresetGeoExclusions(preset.id),
                Storage.deletePresetGeoSites(preset.id),
            ]);
            await updateGeoRemoved();
        })();
    });

    await Promise.all([updatePoolStatus(), updateGeoRemoved()]);

    // Пересчёт по изменениям результатов проверки, каталога и гео-исключений;
    // отписка, когда блок вынут из DOM (как isAlive в модалке публичных прокси)
    const unsubscribe = Storage.onChange((changes) => {
        const poolTouched =
            'publicProxyCheckResults' in changes || 'publicProxyCatalog' in changes;
        const geoTouched =
            'publicPoolGeoExclusions' in changes || 'publicPoolGeoSites' in changes;
        if (!poolTouched && !geoTouched) return;
        if (!status.isConnected) {
            unsubscribe();
            return;
        }
        if (poolTouched) void updatePoolStatus();
        if (geoTouched) void updateGeoRemoved();
    });

    return container;
}

async function createFilterSelects(
    container: HTMLElement,
    config: PublicPoolConfig,
    onChange: (patch: Partial<PublicPoolConfig>) => void
): Promise<void> {
    const filtersContainer = createElementFromTemplate<HTMLDivElement>('div', {
        className: 'pool-filters'
    });

    // Filter: Country
    const countryGroup = createElementFromTemplate<HTMLDivElement>('div', {
        className: 'filter-group'
    });

    const countryLabel = createElementFromTemplate<HTMLLabelElement>('label', {
        textContent: I18n.getMessage('filterCountry')
    });
    countryLabel.setAttribute('data-i18n', 'filterCountry');
    countryGroup.appendChild(countryLabel);

    const countrySelect = createElementFromTemplate<HTMLSelectElement>('select', {
        className: 'pool-country'
    });
    const countryAllOpt = createElementFromTemplate<HTMLOptionElement>('option', {
        value: '',
        textContent: I18n.getMessage('filterAll')
    });
    countryAllOpt.setAttribute('data-i18n', 'filterAll');
    countrySelect.appendChild(countryAllOpt);

    // Load countries from catalog
    try {
        const catalogProxies = await PublicProxyCatalog.get();
        if (catalogProxies && catalogProxies.length > 0) {
            const countries = [...new Set(catalogProxies.map(p => p.country))].sort();
            countries.forEach(country => {
                const option = createElementFromTemplate<HTMLOptionElement>('option', {
                    value: country,
                    textContent: `${countryCodeToFlag(country)} ${country}`
                });
                countrySelect.appendChild(option);
            });
        }
    } catch {
        // On error, only filterAll option remains (already added above)
    }

    if (config.country) {
        countrySelect.value = config.country;
    }
    countrySelect.addEventListener('change', () => {
        onChange({ country: countrySelect.value || undefined });
    });
    countryGroup.appendChild(countrySelect);
    filtersContainer.appendChild(countryGroup);

    // Filter: Connection Type
    const connTypeGroup = createElementFromTemplate<HTMLDivElement>('div', {
        className: 'filter-group'
    });

    const connTypeLabel = createElementFromTemplate<HTMLLabelElement>('label', {
        textContent: I18n.getMessage('filterConnectionType')
    });
    connTypeLabel.setAttribute('data-i18n', 'filterConnectionType');
    connTypeGroup.appendChild(connTypeLabel);

    const connTypeSelect = createElementFromTemplate<HTMLSelectElement>('select', {
        className: 'pool-connection-type'
    });
    const connTypeOptions = [
        { value: '', label: I18n.getMessage('filterAll') },
        { value: 'residential', label: getConnectionTypeLabel('residential') },
        { value: 'corporate', label: getConnectionTypeLabel('corporate') },
        { value: 'mobile', label: getConnectionTypeLabel('mobile') }
    ];
    connTypeOptions.forEach(opt => {
        const option = createElementFromTemplate<HTMLOptionElement>('option', {
            value: opt.value,
            textContent: opt.label
        });
        if (opt.value === '') {
            option.setAttribute('data-i18n', 'filterAll');
        }
        connTypeSelect.appendChild(option);
    });

    if (config.connectionType) {
        connTypeSelect.value = config.connectionType;
    }
    connTypeSelect.addEventListener('change', () => {
        onChange({ connectionType: connTypeSelect.value || undefined });
    });
    connTypeGroup.appendChild(connTypeSelect);
    filtersContainer.appendChild(connTypeGroup);

    // Filter: Min Score
    const scoreGroup = createElementFromTemplate<HTMLDivElement>('div', {
        className: 'filter-group'
    });

    const scoreLabel = createElementFromTemplate<HTMLLabelElement>('label', {
        textContent: I18n.getMessage('filterMinScore')
    });
    scoreLabel.setAttribute('data-i18n', 'filterMinScore');
    scoreGroup.appendChild(scoreLabel);

    const scoreSelect = createElementFromTemplate<HTMLSelectElement>('select', {
        className: 'pool-min-score'
    });
    const scoreOptions = [
        { value: '0', label: 'filterAll' },
        { value: '3.5', label: '3.5+' },
        { value: '4.0', label: '4.0+' },
        { value: '4.5', label: '4.5+' }
    ];
    scoreOptions.forEach((opt, index) => {
        const option = createElementFromTemplate<HTMLOptionElement>('option', {
            value: opt.value,
            textContent: index === 0 ? I18n.getMessage(opt.label as I18nKey) : opt.label
        });
        if (index === 0) {
            option.setAttribute('data-i18n', 'filterAll');
        }
        scoreSelect.appendChild(option);
    });

    if (config.minScore !== undefined) {
        const option = Array.from(scoreSelect.options).find(item => parseFloat(item.value) === config.minScore);
        if (option) scoreSelect.value = option.value;
    }
    scoreSelect.addEventListener('change', () => {
        onChange({ minScore: parseFloat(scoreSelect.value) });
    });
    scoreGroup.appendChild(scoreSelect);
    filtersContainer.appendChild(scoreGroup);

    // Insert filters before the protocols container
    container.insertBefore(filtersContainer, container.querySelector('.pool-protocols') || null);
}
