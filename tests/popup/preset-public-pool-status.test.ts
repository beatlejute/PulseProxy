/** @jest-environment jsdom */

import { mockHelpers } from '../__mocks__/chrome';
import { createPublicPoolConfigBlock } from '../../src/popup/preset-public-pool-config';
import { PublicProxyCatalog } from '../../src/shared/public-proxy-catalog';
import { Storage } from '../../src/shared/storage';
import { I18n } from '../../src/shared/i18n';
import { poolMemberKey } from '../../src/shared/public-pool';
import { NormalizedPublicProxy, Preset, PublicPoolConfig, PublicProxyCheckResults } from '../../src/types';

const CATALOG: NormalizedPublicProxy[] = [
    { protocol: 'socks5', ip: '1.1.1.1', port: 1080, score: 5, connectionType: 'residential', country: 'US' },
    { protocol: 'socks5', ip: '2.2.2.2', port: 1080, score: 4.5, connectionType: 'residential', country: 'US' },
    { protocol: 'socks5', ip: '3.3.3.3', port: 1080, score: 4, connectionType: 'residential', country: 'US' },
];

const CONFIG: PublicPoolConfig = { protocols: ['socks5'] };

const preset = (publicPool: PublicPoolConfig | null): Preset => ({
    id: 'preset', name: 'Preset', domains: [], enabled: true, isDefault: false, order: 0,
    proxyId: null, publicPool, createdAt: 0, updatedAt: 0,
});

let results: PublicProxyCheckResults = {};

function mockCatalog(proxies: NormalizedPublicProxy[] | Error): void {
    if (proxies instanceof Error) {
        jest.spyOn(PublicProxyCatalog, 'get').mockRejectedValue(proxies);
    } else {
        jest.spyOn(PublicProxyCatalog, 'get').mockResolvedValue(proxies);
    }
}

async function render(publicPool: PublicPoolConfig | null): Promise<HTMLElement> {
    const block = await createPublicPoolConfigBlock(preset(publicPool), jest.fn());
    document.body.appendChild(block);
    return block;
}

function statusEl(block: HTMLElement): HTMLDivElement {
    return block.querySelector('div.pool-status') as HTMLDivElement;
}

function statusCall(): unknown[] | undefined {
    const calls = (I18n.getMessage as jest.Mock).mock.calls;
    for (let i = calls.length - 1; i >= 0; i -= 1) {
        if (calls[i][0] === 'publicPoolStatus' || calls[i][0] === 'publicPoolEmpty') {
            return calls[i];
        }
    }
    return undefined;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    results = {};
    jest.spyOn(Storage, 'getPublicProxyCheckResults').mockImplementation(async () => results);
    jest.spyOn(I18n, 'getMessage');
    (I18n.getMessage as jest.Mock).mockImplementation((key: string) => key);
});

afterEach(() => {
    document.body.replaceChildren();
    mockHelpers.resetAllMocks();
    jest.restoreAllMocks();
});

describe('pool status live update', () => {
    it('recomputes status when publicProxyCheckResults change', async () => {
        mockCatalog(CATALOG);
        const block = await render(CONFIG);
        expect(statusCall()?.[1]).toEqual(['3', '0']);

        const [alive, dead] = CATALOG;
        results = {
            [poolMemberKey(alive)]: { status: 'alive', checkedAt: Date.now(), latency: 100 },
            [poolMemberKey(dead)]: { status: 'dead', checkedAt: Date.now() },
        } as unknown as PublicProxyCheckResults;
        mockHelpers.triggerStorageChange({ publicProxyCheckResults: { oldValue: {}, newValue: results } }, 'local');
        await flush();

        expect(statusCall()?.[1]).toEqual(['2', '1']);
        expect(statusEl(block).textContent).toBe('publicPoolStatus');
        expect(statusEl(block).classList.contains('pool-status--empty')).toBe(false);
    });

    it('recomputes status when publicProxyCatalog changes', async () => {
        mockCatalog(CATALOG);
        const block = await render(CONFIG);
        expect(statusEl(block).textContent).toBe('publicPoolStatus');

        mockCatalog([]);
        mockHelpers.triggerStorageChange({ publicProxyCatalog: { oldValue: {}, newValue: { proxies: [] } } }, 'local');
        await flush();

        expect(statusEl(block).textContent).toBe('publicPoolEmpty');
        expect(statusEl(block).classList.contains('pool-status--empty')).toBe(true);
    });
});

describe('geo exclusions', () => {
    let geoExclusions: Record<string, Record<string, number>> = {};
    let geoSites: Record<string, Record<string, { streak: number; stoppedAt: number | null }>> = {};

    function geoRemovedEl(block: HTMLElement): HTMLDivElement {
        return block.querySelector('div.pool-geo-removed') as HTMLDivElement;
    }

    function geoRemovedTextEl(block: HTMLElement): HTMLSpanElement {
        return block.querySelector('span.pool-geo-removed-text') as HTMLSpanElement;
    }

    function geoRestoreBtnEl(block: HTMLElement): HTMLButtonElement {
        return block.querySelector('button.pool-geo-restore-btn') as HTMLButtonElement;
    }

    beforeEach(() => {
        geoExclusions = {};
        geoSites = {};
        jest.spyOn(Storage, 'getPresetGeoExclusions').mockImplementation(async (presetId: string) => {
            return geoExclusions[presetId] ?? {};
        });
        jest.spyOn(Storage, 'getPublicPoolGeoSites').mockImplementation(async () => {
            return geoSites;
        });
        jest.spyOn(Storage, 'deletePresetGeoExclusions').mockImplementation(async (presetId: string) => {
            delete geoExclusions[presetId];
        });
        jest.spyOn(Storage, 'deletePresetGeoSites').mockImplementation(async (presetId: string) => {
            delete geoSites[presetId];
        });
    });

    it('geo exclusions: no exclusions and stops — no strings and buttons', async () => {
        mockCatalog(CATALOG);
        const block = await render(CONFIG);
        await flush();

        const geoRemoved = geoRemovedEl(block);
        expect(geoRemoved.classList.contains('pool-geo-removed--visible')).toBe(false);
    });

    it('geo exclusions: 2 exclusions — string with number and button', async () => {
        mockCatalog(CATALOG);
        const key1 = `socks5://1.1.1.1:1080`;
        const key2 = `socks5://2.2.2.2:1080`;
        geoExclusions['preset'] = {
            [key1]: Date.now(),
            [key2]: Date.now(),
        };

        const block = await render(CONFIG);
        await flush();

        const geoRemoved = geoRemovedEl(block);
        expect(geoRemoved.classList.contains('pool-geo-removed--visible')).toBe(true);
        expect(geoRemovedTextEl(block).textContent).toBe('publicPoolGeoRemoved');
        expect(geoRestoreBtnEl(block)).toBeTruthy();
    });

    it('geo exclusions: exclusion not in catalog — not counted', async () => {
        mockCatalog(CATALOG);
        const keyInCatalog = `socks5://1.1.1.1:1080`;
        const keyNotInCatalog = `socks5://9.9.9.9:9090`;
        geoExclusions['preset'] = {
            [keyInCatalog]: Date.now(),
            [keyNotInCatalog]: Date.now(),
        };

        const block = await render(CONFIG);
        await flush();

        const geoRemoved = geoRemovedEl(block);
        expect(geoRemoved.classList.contains('pool-geo-removed--visible')).toBe(true);
        // Called with removed count = 1 (only the one in catalog)
        const calls = (I18n.getMessage as jest.Mock).mock.calls;
        const geoCall = calls.find(c => c[0] === 'publicPoolGeoRemoved');
        expect(geoCall?.[1]?.[0]).toBe('1');
    });

    it('geo exclusions: only stopped site — button visible', async () => {
        mockCatalog(CATALOG);
        const now = Date.now();
        geoSites['preset'] = {
            'example.com': {
                streak: 5,
                stoppedAt: now - 1000, // 1 second ago, still within 24h
            },
        };

        const block = await render(CONFIG);
        await flush();

        const geoRemoved = geoRemovedEl(block);
        expect(geoRemoved.classList.contains('pool-geo-removed--visible')).toBe(true);
        expect(geoRestoreBtnEl(block)).toBeTruthy();
    });

    it('geo exclusions: click deletes records, other preset untouched', async () => {
        mockCatalog(CATALOG);
        const key1 = `socks5://1.1.1.1:1080`;
        geoExclusions['preset'] = { [key1]: Date.now() };
        geoExclusions['other-preset'] = { [key1]: Date.now() };
        geoSites['preset'] = {
            'example.com': { streak: 2, stoppedAt: null },
        };
        geoSites['other-preset'] = {
            'other.com': { streak: 3, stoppedAt: null },
        };

        const block = await render(CONFIG);
        await flush();

        const btn = geoRestoreBtnEl(block);
        btn.click();
        await flush();

        expect(geoExclusions['preset']).toBeUndefined();
        expect(geoSites['preset']).toBeUndefined();
        expect(geoExclusions['other-preset']).toBeDefined();
        expect(geoSites['other-preset']).toBeDefined();
    });

    it('geo exclusions: storage change updates string', async () => {
        mockCatalog(CATALOG);
        const block = await render(CONFIG);
        await flush();

        const geoRemoved = geoRemovedEl(block);
        expect(geoRemoved.classList.contains('pool-geo-removed--visible')).toBe(false);

        const key1 = `socks5://1.1.1.1:1080`;
        geoExclusions['preset'] = { [key1]: Date.now() };
        mockHelpers.triggerStorageChange({
            publicPoolGeoExclusions: { oldValue: {}, newValue: geoExclusions },
        }, 'local');
        await flush();

        expect(geoRemoved.classList.contains('pool-geo-removed--visible')).toBe(true);
    });
});

describe('pool status lifecycle', () => {
    it('unsubscribes when block is removed from DOM', async () => {
        mockCatalog(CATALOG);
        const block = await render(CONFIG);
        const callsBefore = (I18n.getMessage as jest.Mock).mock.calls.length;
        const readsBefore = (Storage.getPublicProxyCheckResults as jest.Mock).mock.calls.length;

        block.remove();
        mockHelpers.triggerStorageChange({ publicProxyCheckResults: { oldValue: {}, newValue: results } }, 'local');
        await flush();

        expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
        expect((Storage.getPublicProxyCheckResults as jest.Mock).mock.calls.length).toBe(readsBefore);
        expect((I18n.getMessage as jest.Mock).mock.calls.length).toBe(callsBefore);
    });

    it('shows publicPoolEmpty when catalog fails to load', async () => {
        mockCatalog(new Error('network down'));
        const block = await render(CONFIG);

        expect(statusEl(block).textContent).toBe('publicPoolEmpty');
        expect(statusEl(block).classList.contains('pool-status--empty')).toBe(true);
    });

    it('renders status for preset without publicPool without throwing', async () => {
        mockCatalog(CATALOG);
        const block = await render(null);

        expect(statusEl(block)).not.toBeNull();
    });
});
