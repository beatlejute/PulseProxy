import { I18n } from '../shared/i18n';
import { Preset, ProxyServer } from '../types';

export async function createProxyDropdown(
    preset: Preset,
    proxies: ProxyServer[],
    onProxyChange: (proxyId: string | null) => void
): Promise<HTMLElement> {
    const defaultProxy = proxies.find(p => p.isDefault);

    const container = document.createElement('div');
    container.className = 'preset-proxy-selector';

    const label = document.createElement('label');
    label.textContent = I18n.getMessage('labelSelectProxy');

    const select = document.createElement('select');
    select.className = 'proxy-select';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    const defaultProxyLabel = defaultProxy
        ? (defaultProxy.name || `${defaultProxy.host}:${defaultProxy.port}`)
        : null;
    defaultOption.textContent = defaultProxyLabel
        ? `${I18n.getMessage('proxyDefault')} (${defaultProxyLabel})`
        : I18n.getMessage('proxyNone');
    if (!preset.proxyId) {
        defaultOption.selected = true;
    }
    select.appendChild(defaultOption);

    proxies
        .filter(proxy => !proxy.isDefault)
        .forEach(proxy => {
            const option = document.createElement('option');
            option.value = proxy.id;
            option.textContent = proxy.name || `${proxy.type.toUpperCase()}://${proxy.host}:${proxy.port}`;
            if (preset.proxyId === proxy.id) {
                option.selected = true;
            }
            select.appendChild(option);
        });

    select.addEventListener('change', () => onProxyChange(select.value || null));

    container.appendChild(label);
    container.appendChild(select);
    return container;
}
