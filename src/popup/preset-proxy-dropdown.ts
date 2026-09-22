import { I18n } from '../shared/i18n';
import { PublicPoolCheckConfig } from '../shared/constants';
import { Preset, ProxyServer, PublicPoolConfig } from '../types';

export const PUBLIC_POOL_OPTION_VALUE = '__public_pool__';

export interface PresetProxySelection {
    proxyId: string | null;
    publicPool: PublicPoolConfig | null;
}

const DEFAULT_PUBLIC_POOL_CONFIG: PublicPoolConfig = {
    protocols: [...PublicPoolCheckConfig.DEFAULT_PROTOCOLS],
};

export async function createProxyDropdown(
    preset: Preset,
    proxies: ProxyServer[],
    onSelectionChange: (selection: PresetProxySelection) => void
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
    if (!preset.proxyId && !preset.publicPool) {
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

    const publicPoolOption = document.createElement('option');
    publicPoolOption.value = PUBLIC_POOL_OPTION_VALUE;
    publicPoolOption.textContent = `🌐 ${I18n.getMessage('presetProxyPublicPool')}`;
    if (preset.publicPool) {
        publicPoolOption.selected = true;
    }
    select.appendChild(publicPoolOption);

    select.addEventListener('change', () => {
        if (select.value === PUBLIC_POOL_OPTION_VALUE) {
            onSelectionChange({
                proxyId: null,
                publicPool: preset.publicPool ?? DEFAULT_PUBLIC_POOL_CONFIG,
            });
        } else {
            onSelectionChange({
                proxyId: select.value || null,
                publicPool: null,
            });
        }
    });

    container.appendChild(label);
    container.appendChild(select);
    return container;
}
