import { I18n } from '../../src/shared/i18n';
import {
    createProxyDropdown,
    PUBLIC_POOL_OPTION_VALUE,
    PresetProxySelection,
} from '../../src/popup/preset-proxy-dropdown';
import { Preset, ProxyServer } from '../../src/types';

jest.mock('../../src/shared/i18n');

const mockI18n = I18n as jest.Mocked<typeof I18n>;

describe('createProxyDropdown public pool option', () => {
    let mockProxies: ProxyServer[];
    let mockPreset: Preset;

    beforeEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();

        mockI18n.getMessage.mockImplementation((key: string) => {
            const messages: Record<string, string> = {
                labelSelectProxy: 'Select proxy',
                proxyDefault: 'Default',
                proxyNone: 'None',
                presetProxyPublicPool: 'Public pool',
            };
            return messages[key] || key;
        });

        mockProxies = [
            {
                id: 'default',
                name: 'System default',
                type: 'http',
                host: '127.0.0.1',
                port: 8080,
                isDefault: true,
            },
            {
                id: 'proxy1',
                name: 'Proxy 1',
                type: 'socks5',
                host: '10.0.0.1',
                port: 1080,
                isDefault: false,
            },
        ];

        mockPreset = {
            id: 'preset1',
            name: 'My Preset',
            domains: ['example.com'],
            proxyId: null,
            publicPool: null,
        };
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('PUBLIC_POOL_OPTION_VALUE equals __public_pool__', () => {
        expect(PUBLIC_POOL_OPTION_VALUE).toBe('__public_pool__');
    });

    it('pool option is the last option with globe label (__public_pool__)', async () => {
        const onSelectionChange = jest.fn();
        const element = await createProxyDropdown(mockPreset, mockProxies, onSelectionChange);
        document.body.appendChild(element);

        const select = element.querySelector('select.proxy-select') as HTMLSelectElement;
        const options = Array.from(select.options);
        const lastOption = options[options.length - 1];

        expect(lastOption.value).toBe(PUBLIC_POOL_OPTION_VALUE);
        expect(lastOption.textContent).toContain('🌐');
        expect(lastOption.textContent).toContain('Public pool');
    });

    it('pool option is selected and default option is not when preset.publicPool is set', async () => {
        mockPreset.publicPool = { protocols: ['socks5'] };

        const onSelectionChange = jest.fn();
        const element = await createProxyDropdown(mockPreset, mockProxies, onSelectionChange);
        document.body.appendChild(element);

        const select = element.querySelector('select.proxy-select') as HTMLSelectElement;
        const options = Array.from(select.options);

        const defaultOption = options[0];
        const publicPoolOption = options.find(opt => opt.value === PUBLIC_POOL_OPTION_VALUE);

        expect(publicPoolOption?.selected).toBe(true);
        expect(defaultOption.selected).toBe(false);
    });

    it('selecting pool option emits proxyId null and default publicPool socks5', async () => {
        const onSelectionChange = jest.fn();
        const element = await createProxyDropdown(mockPreset, mockProxies, onSelectionChange);
        document.body.appendChild(element);

        const select = element.querySelector('select.proxy-select') as HTMLSelectElement;
        select.value = PUBLIC_POOL_OPTION_VALUE;

        const event = new Event('change', { bubbles: true });
        select.dispatchEvent(event);

        expect(onSelectionChange).toHaveBeenCalledWith({
            proxyId: null,
            publicPool: { protocols: ['socks5'] },
        });
    });

    it('selecting proxy option emits proxyId and publicPool null', async () => {
        const onSelectionChange = jest.fn();
        const element = await createProxyDropdown(mockPreset, mockProxies, onSelectionChange);
        document.body.appendChild(element);

        const select = element.querySelector('select.proxy-select') as HTMLSelectElement;
        select.value = 'proxy1';

        const event = new Event('change', { bubbles: true });
        select.dispatchEvent(event);

        expect(onSelectionChange).toHaveBeenCalledWith({
            proxyId: 'proxy1',
            publicPool: null,
        });
    });

    it('selecting default option emits proxyId null and publicPool null', async () => {
        const onSelectionChange = jest.fn();
        const element = await createProxyDropdown(mockPreset, mockProxies, onSelectionChange);
        document.body.appendChild(element);

        const select = element.querySelector('select.proxy-select') as HTMLSelectElement;
        select.value = '';

        const event = new Event('change', { bubbles: true });
        select.dispatchEvent(event);

        expect(onSelectionChange).toHaveBeenCalledWith({
            proxyId: null,
            publicPool: null,
        });
    });
});
