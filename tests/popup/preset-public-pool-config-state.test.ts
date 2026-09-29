/** @jest-environment jsdom */

import { createPublicPoolConfigBlock } from '../../src/popup/preset-public-pool-config';
import { PublicProxyCatalog } from '../../src/shared/public-proxy-catalog';
import { Preset, PublicPoolConfig } from '../../src/types';

jest.mock('../../src/shared/i18n', () => ({ I18n: { getMessage: jest.fn((key: string) => key) } }));

const preset = (publicPool: PublicPoolConfig): Preset => ({
    id: 'preset', name: 'Preset', domains: [], enabled: true, isDefault: false, order: 0,
    proxyId: null, publicPool, createdAt: 0, updatedAt: 0,
});

async function render(publicPool: PublicPoolConfig) {
    jest.spyOn(PublicProxyCatalog, 'get').mockResolvedValue([
        { protocol: 'http', ip: '1.1.1.1', port: 80, score: 4, connectionType: 'residential', country: 'US' },
        { protocol: 'socks5', ip: '2.2.2.2', port: 1080, score: 4.5, connectionType: 'mobile', country: 'ID' },
    ]);
    const onChange = jest.fn();
    const block = await createPublicPoolConfigBlock(preset(publicPool), onChange);
    document.body.appendChild(block);
    return { block, onChange };
}

afterEach(() => {
    document.body.replaceChildren();
    jest.restoreAllMocks();
});

describe('pool config block single config', () => {
    it('keeps protocols while filters change', async () => {
        const { block, onChange } = await render({ protocols: ['socks5'] });
        const http = block.querySelector('[data-protocol="http"]') as HTMLInputElement;
        http.checked = true; http.dispatchEvent(new Event('change'));
        const country = block.querySelector('.pool-country') as HTMLSelectElement;
        country.value = 'ID'; country.dispatchEvent(new Event('change'));
        const type = block.querySelector('.pool-connection-type') as HTMLSelectElement;
        type.value = 'mobile'; type.dispatchEvent(new Event('change'));
        const score = block.querySelector('.pool-min-score') as HTMLSelectElement;
        score.value = '4.5'; score.dispatchEvent(new Event('change'));
        expect(onChange.mock.lastCall?.[0]).toEqual({ protocols: ['http', 'socks5'], country: 'ID', connectionType: 'mobile', minScore: 4.5 });
    });

    it('keeps filters while protocols change', async () => {
        const { block, onChange } = await render({ protocols: ['socks5'], country: 'US', connectionType: 'residential', minScore: 3.5 });
        const country = block.querySelector('.pool-country') as HTMLSelectElement;
        country.value = 'ID'; country.dispatchEvent(new Event('change'));
        const socks4 = block.querySelector('[data-protocol="socks4"]') as HTMLInputElement;
        socks4.checked = true; socks4.dispatchEvent(new Event('change'));
        expect(onChange.mock.lastCall?.[0]).toEqual({ protocols: ['socks4', 'socks5'], country: 'ID', connectionType: 'residential', minScore: 3.5 });
    });

    it('resetting country preserves protocols and removes country', async () => {
        const { block, onChange } = await render({ protocols: ['http'], country: 'US' });
        const socks5 = block.querySelector('[data-protocol="socks5"]') as HTMLInputElement;
        socks5.checked = true; socks5.dispatchEvent(new Event('change'));
        const country = block.querySelector('.pool-country') as HTMLSelectElement;
        country.value = ''; country.dispatchEvent(new Event('change'));
        expect(onChange.mock.lastCall?.[0]).toEqual({ protocols: ['http', 'socks5'] });
    });

    it('does not call onChange when unchecking the last protocol', async () => {
        const { block, onChange } = await render({ protocols: ['socks5'] });
        const socks5 = block.querySelector('[data-protocol="socks5"]') as HTMLInputElement;
        socks5.checked = false; socks5.dispatchEvent(new Event('change'));
        expect(socks5.checked).toBe(true);
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('pool config block restores saved config', () => {
    it.each(['0', '3.5', '4.0', '4.5'])('restores score %s after rebuild', async (value) => {
        const first = await render({ protocols: ['socks5'] });
        const score = first.block.querySelector('.pool-min-score') as HTMLSelectElement;
        score.value = value; score.dispatchEvent(new Event('change'));
        const rebuilt = await render(first.onChange.mock.lastCall?.[0]);
        expect((rebuilt.block.querySelector('.pool-min-score') as HTMLSelectElement).value).toBe(value);
    });

    it('shows every saved value in controls', async () => {
        const { block } = await render({ protocols: ['http', 'socks4'], country: 'ID', connectionType: 'mobile', minScore: 4.5 });
        expect(Array.from(block.querySelectorAll<HTMLInputElement>('[data-protocol]:checked')).map(input => input.value)).toEqual(['http', 'socks4']);
        expect((block.querySelector('.pool-country') as HTMLSelectElement).value).toBe('ID');
        expect((block.querySelector('.pool-connection-type') as HTMLSelectElement).value).toBe('mobile');
        expect((block.querySelector('.pool-min-score') as HTMLSelectElement).value).toBe('4.5');
    });
});

describe('pool config block labels', () => {
    it('uses publicPoolProtocols title', async () => {
        const { block } = await render({ protocols: ['socks5'] });
        expect(block.querySelector('.pool-protocols h4')?.textContent).toBe('publicPoolProtocols');
    });

    it('keeps publicPoolHttpHint visible', async () => {
        const { block } = await render({ protocols: ['socks5'] });
        const hint = block.querySelector('.http-hint') as HTMLElement;
        expect(hint.textContent).toBe('publicPoolHttpHint');
        expect(hint.hidden).toBe(false);
        expect(hint.classList.contains('hidden')).toBe(false);
        expect(getComputedStyle(hint).display).not.toBe('none');
        expect(getComputedStyle(hint).visibility).not.toBe('hidden');
    });
});
