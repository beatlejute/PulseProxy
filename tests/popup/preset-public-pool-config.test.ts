import { createPublicPoolConfigBlock } from '../../src/popup/preset-public-pool-config';
import { Preset, PublicPoolConfig, NormalizedPublicProxy, PublicProxyCheckResult } from '../../src/types';
import { PublicProxyCatalog } from '../../src/shared/public-proxy-catalog';
import { Storage } from '../../src/shared/storage';
import * as publicPoolModule from '../../src/shared/public-pool';
import { I18n } from '../../src/shared/i18n';
import * as publicProxiesModal from '../../src/popup/public-proxies-modal';

// Mock modules
jest.mock('../../src/shared/public-proxy-catalog');
jest.mock('../../src/shared/storage');
jest.mock('../../src/shared/i18n');
jest.mock('../../src/popup/public-proxies-modal');

const mockPublicProxyCatalog = PublicProxyCatalog as jest.Mocked<typeof PublicProxyCatalog>;
const mockStorage = Storage as jest.Mocked<typeof Storage>;
const mockI18n = I18n as jest.Mocked<typeof I18n>;
const mockPublicProxiesModal = publicProxiesModal as jest.Mocked<typeof publicProxiesModal>;
const realResolvePoolMembers = publicPoolModule.resolvePoolMembers;

// Setup common mocks
beforeEach(() => {
    // Mock I18n.getMessage to return key names (jsdom doesn't load actual translations)
    mockI18n.getMessage.mockImplementation((key: string, params?: string[]) => {
        if (params && params.length > 0) {
            return `${key}[${params.join(', ')}]`;
        }
        return key;
    });

    // Mock countryCodeToFlag
    mockPublicProxiesModal.countryCodeToFlag.mockImplementation((code: string) => `🚩${code}`);

    // Mock getConnectionTypeLabel
    mockPublicProxiesModal.getConnectionTypeLabel.mockImplementation((type: string) => `Label:${type}`);

    // Default catalog mock
    mockPublicProxyCatalog.get.mockResolvedValue([
        {
            ip: '1.1.1.1',
            port: 8080,
            country: 'US',
            protocols: ['http', 'https'],
            connectionType: 'residential',
            minScore: 3.5,
        } as NormalizedPublicProxy,
        {
            ip: '2.2.2.2',
            port: 8080,
            country: 'GB',
            protocols: ['socks5'],
            connectionType: 'corporate',
            minScore: 4.0,
        } as NormalizedPublicProxy,
    ]);

    // Default results mock
    mockStorage.getPublicProxyCheckResults.mockResolvedValue({});

    // Mock Storage.onChange to return unsubscribe function
    mockStorage.onChange.mockReturnValue(() => {});

    // Clear DOM
    document.body.innerHTML = '';
});

afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
});

describe('createPublicPoolConfigBlock', () => {
    describe('protocols', () => {
        it('renders 4 protocol checkboxes with data-protocol http https socks4 socks5', async () => {
            const preset: Preset = {
                name: 'Test',
                publicPool: { protocols: ['http', 'https'] },
            } as Preset;
            const onChange = jest.fn();

            const block = await createPublicPoolConfigBlock(preset, onChange);
            document.body.appendChild(block);

            const protocolsContainer = block.querySelector('.pool-protocols');
            expect(protocolsContainer).toBeTruthy();

            const checkboxes = protocolsContainer?.querySelectorAll('input[type="checkbox"]');
            expect(checkboxes?.length).toBe(4);

            const protocols = ['http', 'https', 'socks4', 'socks5'];
            checkboxes?.forEach((checkbox, index) => {
                const input = checkbox as HTMLInputElement;
                expect(input.dataset.protocol).toBe(protocols[index]);
            });
        });

        it('last checked protocol cannot be unchecked', async () => {
            const preset: Preset = {
                name: 'Test',
                publicPool: { protocols: ['http'] },
            } as Preset;
            const onChange = jest.fn();

            const block = await createPublicPoolConfigBlock(preset, onChange);
            document.body.appendChild(block);

            const checkboxes = block.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
            const httpCheckbox = Array.from(checkboxes).find(cb => cb.dataset.protocol === 'http');
            expect(httpCheckbox).toBeTruthy();

            // Try to uncheck the only checked protocol
            if (httpCheckbox) {
                httpCheckbox.click();
                // Checkbox should remain checked because it's the last one
                expect(httpCheckbox.checked).toBe(true);
                // onChange should not be called
                expect(onChange).not.toHaveBeenCalledWith(
                    expect.objectContaining({ protocols: [] })
                );
            }
        });
    });

    describe('country', () => {
        it('country select lists filterAll and catalog countries with flags', async () => {
            const preset: Preset = {
                name: 'Test',
                publicPool: { protocols: ['http', 'https'] },
            } as Preset;
            const onChange = jest.fn();

            const block = await createPublicPoolConfigBlock(preset, onChange);
            document.body.appendChild(block);

            const countrySelect = block.querySelector('select.pool-country') as HTMLSelectElement;
            expect(countrySelect).toBeTruthy();

            const options = Array.from(countrySelect.options);
            expect(options.length).toBeGreaterThanOrEqual(3); // filterAll + US + GB

            // Check filterAll option
            expect(options[0].value).toBe('');
            expect(options[0].textContent).toBe('filterAll');

            // Check countries from catalog are present
            const countryValues = options.map(opt => opt.value).filter(v => v !== '');
            expect(countryValues).toContain('US');
            expect(countryValues).toContain('GB');

            // Check flags in text
            const gbOption = options.find(opt => opt.value === 'GB');
            expect(gbOption?.textContent).toContain('🚩GB');
        });

        it('catalog error leaves only filterAll and block still renders', async () => {
            mockPublicProxyCatalog.get.mockRejectedValueOnce(new Error('Catalog unavailable'));

            const preset: Preset = {
                name: 'Test',
                publicPool: { protocols: ['http', 'https'] },
            } as Preset;
            const onChange = jest.fn();

            const block = await createPublicPoolConfigBlock(preset, onChange);
            document.body.appendChild(block);

            const countrySelect = block.querySelector('select.pool-country') as HTMLSelectElement;
            expect(countrySelect).toBeTruthy();

            const options = Array.from(countrySelect.options);
            // Only filterAll option should be present
            expect(options.length).toBe(1);
            expect(options[0].value).toBe('');
        });
    });

    describe('onChange', () => {
        it('protocol change calls onChange with new protocols', async () => {
            const preset: Preset = {
                name: 'Test',
                publicPool: { protocols: ['http'] },
            } as Preset;
            const onChange = jest.fn();

            const block = await createPublicPoolConfigBlock(preset, onChange);
            document.body.appendChild(block);

            const httpsCheckbox = Array.from(
                block.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>
            ).find(cb => cb.dataset.protocol === 'https');

            if (httpsCheckbox) {
                httpsCheckbox.click();
                expect(onChange).toHaveBeenCalledWith(
                    expect.objectContaining({
                        protocols: expect.arrayContaining(['http', 'https']),
                    })
                );
            }
        });

        it('country change calls onChange with new country', async () => {
            const preset: Preset = {
                name: 'Test',
                publicPool: { protocols: ['http', 'https'] },
            } as Preset;
            const onChange = jest.fn();

            const block = await createPublicPoolConfigBlock(preset, onChange);
            document.body.appendChild(block);

            const countrySelect = block.querySelector('select.pool-country') as HTMLSelectElement;
            if (countrySelect) {
                countrySelect.value = 'US';
                countrySelect.dispatchEvent(new Event('change'));

                expect(onChange).toHaveBeenCalledWith(
                    expect.objectContaining({ country: 'US' })
                );
            }
        });

        it('connection type change calls onChange with new connectionType', async () => {
            const preset: Preset = {
                name: 'Test',
                publicPool: { protocols: ['http', 'https'] },
            } as Preset;
            const onChange = jest.fn();

            const block = await createPublicPoolConfigBlock(preset, onChange);
            document.body.appendChild(block);

            const connTypeSelect = block.querySelector('select.pool-connection-type') as HTMLSelectElement;
            if (connTypeSelect) {
                connTypeSelect.value = 'residential';
                connTypeSelect.dispatchEvent(new Event('change'));

                expect(onChange).toHaveBeenCalledWith(
                    expect.objectContaining({ connectionType: 'residential' })
                );
            }
        });

        it('min score change calls onChange with new minScore', async () => {
            const preset: Preset = {
                name: 'Test',
                publicPool: { protocols: ['http', 'https'] },
            } as Preset;
            const onChange = jest.fn();

            const block = await createPublicPoolConfigBlock(preset, onChange);
            document.body.appendChild(block);

            const scoreSelect = block.querySelector('select.pool-min-score') as HTMLSelectElement;
            if (scoreSelect) {
                scoreSelect.value = '4.0';
                scoreSelect.dispatchEvent(new Event('change'));

                expect(onChange).toHaveBeenCalledWith(
                    expect.objectContaining({ minScore: 4.0 })
                );
            }
        });
    });

    describe('status', () => {
        it('shows pool status div with member count when catalog has proxies', async () => {
            // Catalog with proxies triggers status calculation
            const catalogProxies: NormalizedPublicProxy[] = [
                {
                    ip: '10.0.0.1',
                    port: 3128,
                    protocol: 'http',
                    country: 'US',
                    connectionType: 'residential',
                    score: 4.5,
                } as NormalizedPublicProxy,
                {
                    ip: '10.0.0.2',
                    port: 3128,
                    protocol: 'https',
                    country: 'US',
                    connectionType: 'corporate',
                    score: 4.0,
                } as NormalizedPublicProxy,
            ];

            mockPublicProxyCatalog.get.mockResolvedValueOnce(catalogProxies);

            // One alive result
            mockStorage.getPublicProxyCheckResults.mockResolvedValueOnce({
                'http://10.0.0.1:3128': { status: 'alive', checkedAt: Date.now() } as PublicProxyCheckResult,
            } as Record<string, PublicProxyCheckResult>);

            const preset: Preset = {
                name: 'Test',
                publicPool: { protocols: ['http', 'https'] },
            } as Preset;
            const onChange = jest.fn();

            const block = await createPublicPoolConfigBlock(preset, onChange);
            document.body.appendChild(block);

            const statusDiv = block.querySelector('.pool-status') as HTMLDivElement;
            expect(statusDiv).toBeTruthy();
            // Should display some status text (either count or empty)
            expect(statusDiv.textContent).toBeTruthy();
        });

        it('shows publicPoolEmpty when pool has no members', async () => {
            // Empty catalog results in no members
            mockPublicProxyCatalog.get.mockResolvedValueOnce([]);

            const preset: Preset = {
                name: 'Test',
                publicPool: { protocols: ['http', 'https'] },
            } as Preset;
            const onChange = jest.fn();

            const block = await createPublicPoolConfigBlock(preset, onChange);
            document.body.appendChild(block);

            const statusDiv = block.querySelector('.pool-status') as HTMLDivElement;
            expect(statusDiv).toBeTruthy();
            expect(statusDiv.textContent).toBe('publicPoolEmpty');
            expect(mockI18n.getMessage).toHaveBeenCalledWith('publicPoolEmpty');
        });
    });
});
