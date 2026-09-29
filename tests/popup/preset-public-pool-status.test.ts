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
