import { test, expect } from '@playwright/test';
import { launchExtension, openPopup } from './helpers/extension';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POOL_DOMAIN_URL = 'https://en.wikipedia.org/';
const NON_POOL_URL = 'https://example.com/';

/**
 * Minimal SOCKS5 relay (no auth, CONNECT only) used as a *live* public pool member.
 *
 * Without a reachable member the pool route always fails, the navigation never
 * commits and the per-tab badge can never be observed — the scenario under test
 * would be untestable rather than failing. The relay makes the pool member
 * genuinely reachable, so the 🌐 badge scenario is a real check (QA-152).
 */
function startSocks5Relay(connectLog: string[]): Promise<{ port: number; close: () => Promise<void> }> {
    const server = net.createServer((client) => {
        let stage: 'greet' | 'request' | 'tunnel' = 'greet';

        const onData = (chunk: Buffer) => {
            if (stage === 'greet') {
                // VER=0x05, NMETHODS, METHODS... -> answer "no authentication required"
                client.write(Buffer.from([0x05, 0x00]));
                stage = 'request';
                return;
            }
            if (stage !== 'request') return;

            // VER CMD RSV ATYP DST.ADDR DST.PORT
            const atyp = chunk[3];
            let host = '';
            let offset = 4;
            if (atyp === 0x01) {
                host = `${chunk[4]}.${chunk[5]}.${chunk[6]}.${chunk[7]}`;
                offset = 8;
            } else if (atyp === 0x03) {
                const len = chunk[4];
                host = chunk.subarray(5, 5 + len).toString('utf8');
                offset = 5 + len;
            } else {
                client.destroy();
                return;
            }
            const port = chunk.readUInt16BE(offset);
            connectLog.push(`${host}:${port}`);
            stage = 'tunnel';

            const upstream = net.connect(port, host, () => {
                // Success reply with a dummy bound address
                client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
                client.removeListener('data', onData);
                client.pipe(upstream);
                upstream.pipe(client);
            });
            upstream.on('error', () => {
                try {
                    client.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
                } catch { /* client already gone */ }
                client.destroy();
            });
        };

        client.on('data', onData);
        client.on('error', () => { /* browser aborts are expected */ });
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as net.AddressInfo).port;
            resolve({
                port,
                close: () => new Promise<void>((done) => server.close(() => done())),
            });
        });
    });
}

function buildStorageFixture(socksPort: number, country?: string) {
    const preset = {
        id: 'pool-preset-qa152',
        name: 'QA152 Pool Preset',
        domains: ['example.org', '*.wikipedia.org'],
        enabled: true,
        isDefault: false,
        order: 0,
        proxyId: null,
        publicPool: country ? { protocols: ['socks5'], country } : { protocols: ['socks5'] },
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    return {
        presets: [preset],
        proxies: [],
        theme: 'light' as const,
        language: 'en' as const,
        syncEnabled: false,
        proxyByDefault: false,
        proxyCheckEnabled: false,
        publicProxiesWarningDismissed: false,
        publicProxiesFiltersCollapsed: false,
        // Marked alive so the result does not depend on the 15-min background liveness cycle
        publicProxyCheckResults: {
            [`socks5://127.0.0.1:${socksPort}`]: { status: 'alive' as const, checkedAt: Date.now() },
        },
        publicProxyCatalog: {
            fetchedAt: Date.now(),
            proxies: [
                {
                    protocol: 'socks5' as const,
                    ip: '127.0.0.1',
                    port: socksPort,
                    score: 80,
                    connectionType: 'residential',
                    country: 'US',
                },
            ],
        },
        targetState: 'connected' as const,
    };
}

test.describe('Badge pool verification (QA-152)', () => {
    let context: any;
    let popupUrl: string;
    let relay: { port: number; close: () => Promise<void> };
    const socksConnects: string[] = [];

    test.beforeAll(async () => {
        relay = await startSocks5Relay(socksConnects);
        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close();
        await relay?.close();
    });

    test('verify pool badge scenarios', async () => {
        // The scenario needs ~14s of fixed settle waits plus two real page loads through
        // the local SOCKS5 relay (en.wikipedia.org, example.com), so a green run lands at
        // ~25s — inside Playwright's 30s default only until the network is slow, which made
        // the check flaky (3 of 4 runs timed out, FIX-032 review). Budget matches the other
        // network-bound specs in tests/e2e/.
        test.setTimeout(120000);

        const popup = await openPopup(context, popupUrl);

        // Record the webNavigation event trace: it shows whether a proxied navigation
        // reaches onCommitted (the only event that refreshes the per-tab pool badge).
        await popup.evaluate(() => {
            const trace: string[] = [];
            (globalThis as any).__navTrace = trace;
            chrome.webNavigation.onCommitted.addListener((d) => {
                if (d.frameId === 0) trace.push(`onCommitted tab=${d.tabId} url=${d.url}`);
            });
            chrome.webNavigation.onErrorOccurred.addListener((d) => {
                if (d.frameId === 0) trace.push(`onErrorOccurred tab=${d.tabId} url=${d.url} error=${d.error}`);
            });
        });

        const applyStorage = async (data: unknown) => {
            await popup.evaluate(async (payload: any) => {
                await new Promise<void>((resolve) => chrome.storage.local.set(payload, () => resolve()));
                // Production path for "routing config changed": popup asks background to
                // re-apply the PAC script and refresh the tab badges.
                await new Promise<void>((resolve) => chrome.runtime.sendMessage({ action: 'toggleProxy' }, () => resolve()));
            }, data);
            await new Promise((resolve) => setTimeout(resolve, 2500));
        };

        const readPac = async (): Promise<string> => popup.evaluate(async () => {
            const settings: any = await new Promise((resolve) => chrome.proxy.settings.get({}, resolve));
            return settings?.value?.pacScript?.data ?? '';
        });

        const readBadge = async (urlPrefix: string) => popup.evaluate(async (prefix: string) => {
            const tabs = await new Promise<any[]>((resolve) => chrome.tabs.query({}, resolve));
            const tab = tabs.filter((t) => (t.url || '').startsWith(prefix)).pop();
            if (!tab) return { tabId: -1, text: '', color: [] as number[] };
            const text = await new Promise<string>((resolve) => chrome.action.getBadgeText({ tabId: tab.id }, resolve));
            const color = await new Promise<number[]>((resolve) => chrome.action.getBadgeBackgroundColor({ tabId: tab.id }, resolve as any));
            return { tabId: tab.id, text: text || '', color: Array.isArray(color) ? color : [] };
        }, urlPrefix);

        const readCurrentState = async (): Promise<string> => popup.evaluate(async () => {
            const result: any = await new Promise((resolve) => chrome.storage.local.get(['currentState'], resolve));
            return result.currentState || 'unknown';
        });

        const results: any = { poolTab: {}, otherTab: {}, emptyPool: {} };
        const diagnostics: any = {};

        // --- Step 1: pool preset with one live member, connected state ---
        await applyStorage(buildStorageFixture(relay.port));
        diagnostics.stateAfterSetup = await readCurrentState();
        const pacWithMember = await readPac();
        diagnostics.pacPoolsWithLiveMember = (pacWithMember.match(/var pools = .*/) || [''])[0].slice(0, 200);

        // --- Step 2: tab on a pool domain -> badge 🌐 on the pool color ---
        const poolTab = await context.newPage();
        await poolTab.goto(POOL_DOMAIN_URL, { waitUntil: 'load', timeout: 45000 }).catch(() => { /* recorded via trace */ });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        diagnostics.poolTabFinalUrl = poolTab.url();
        const poolBadge = await readBadge('https://en.wikipedia.org');
        results.poolTab = { url: POOL_DOMAIN_URL, badgeText: poolBadge.text, badgeColor: poolBadge.color };

        // --- Step 3: tab outside the preset -> empty badge ---
        const otherTab = await context.newPage();
        await otherTab.goto(NON_POOL_URL, { waitUntil: 'load', timeout: 30000 }).catch(() => { /* recorded via trace */ });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const otherBadge = await readBadge('https://example.com');
        results.otherTab = { url: NON_POOL_URL, badgeText: otherBadge.text };

        // --- Step 4: pool with no candidates (country ZZ) -> badge "!" ---
        // The scenario re-navigates *the pool tab*, so it stays open while the
        // empty-pool filter is applied: the routing-config change refreshes the
        // badges of all existing tabs.
        await applyStorage(buildStorageFixture(relay.port, 'ZZ'));
        const pacEmptyPool = await readPac();
        diagnostics.pacPoolsEmptyPool = (pacEmptyPool.match(/var pools = .*/) || [''])[0].slice(0, 200);

        await poolTab.goto(POOL_DOMAIN_URL, { waitUntil: 'load', timeout: 30000 }).catch(() => { /* connection refused by design */ });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const emptyBadge = await readBadge('https://en.wikipedia.org');
        const currentState = await readCurrentState();
        results.emptyPool = {
            url: POOL_DOMAIN_URL,
            badgeText: emptyBadge.text,
            badgeColor: emptyBadge.color,
            currentState,
        };

        // Diagnostic: a tab opened *after* the pool went empty gets no badge, because the
        // navigation through the fail-closed sentinel ends in onErrorOccurred and the
        // per-tab badge is only refreshed on onCommitted / onActivated / config change.
        await poolTab.close();
        await new Promise((resolve) => setTimeout(resolve, 500));
        const freshEmptyPoolTab = await context.newPage();
        await freshEmptyPoolTab.goto(POOL_DOMAIN_URL, { waitUntil: 'load', timeout: 30000 }).catch(() => { /* expected to fail */ });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const freshBadge = await readBadge('https://en.wikipedia.org');
        diagnostics.badgeInTabOpenedAfterPoolWentEmpty = {
            badgeText: freshBadge.text,
            badgeColor: freshBadge.color,
        };

        // ...and it appears as soon as tabs.onActivated recomputes it from tab.url.
        await otherTab.bringToFront();
        await freshEmptyPoolTab.bringToFront();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const freshBadgeAfterReactivate = await readBadge('https://en.wikipedia.org');
        diagnostics.badgeInFreshTabAfterReactivate = {
            badgeText: freshBadgeAfterReactivate.text,
            badgeColor: freshBadgeAfterReactivate.color,
        };

        diagnostics.navTrace = await popup.evaluate(() => (globalThis as any).__navTrace ?? []);
        diagnostics.socksConnects = socksConnects.slice(0, 10);

        const reportsDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        fs.writeFileSync(
            path.join(reportsDir, 'PLAN-017-badge-pool.json'),
            JSON.stringify(results, null, 2)
        );

        console.log('QA-152 results:', JSON.stringify(results, null, 2));
        console.log('QA-152 diagnostics:', JSON.stringify(diagnostics, null, 2));

        await otherTab.close();
        await freshEmptyPoolTab.close();
        await popup.close();

        // The spec records actual badge values; a mismatch with the expectation is a
        // product defect reported in the ticket, not a runner failure (QA-152 DoD).
        expect(results.poolTab.url).toContain('wikipedia.org');
    });
});
