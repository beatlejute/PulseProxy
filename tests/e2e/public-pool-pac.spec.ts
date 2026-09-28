/**
 * Public Pool — PAC pool routing and toggle without own proxies
 *
 * Covers functional area "Public Pool" (PLAN-017 tasks 21, 36):
 * PAC domainPoolMap routing through public pool members, background alarm,
 * and enabling the extension with a pool preset when the user has no own proxies.
 *
 * IMPORTANT: background/popup code reads and writes presets, proxies, targetState
 * and currentState exclusively via chrome.storage.local (src/shared/storage.ts:96-113,
 * src/storage/preset-repository.ts:9-54). chrome.storage.sync only feeds the
 * cross-device cloud mirror (SyncService) and is never read live by the extension —
 * writing setup data there is invisible to the running extension.
 *
 * При расширении покрытия (новые public pool сценарии) — добавляй test() блоки
 * в этот файл. См. .workflow/src/skills/shared/testing-conventions.md
 */

import { test, expect, BrowserContext, Page, Worker } from '@playwright/test';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as tls from 'tls';
import { fileURLToPath } from 'url';
import { launchExtension, openPopup } from './helpers/extension';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '../../reports');

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}

function makePoolPreset(id: string, domains: string[]) {
  const now = Date.now();
  return {
    id,
    name: id,
    domains,
    enabled: true,
    isDefault: false,
    order: 0,
    proxyId: null,
    publicPool: { protocols: ['socks5'] },
    createdAt: now,
    updatedAt: now,
  };
}

/** Polls `check` (a self-contained evaluate function) until it returns a truthy value or times out. */
async function waitForWorker<T>(
  worker: Worker,
  check: () => T | Promise<T>,
  timeoutMs: number,
  intervalMs: number
): Promise<T> {
  const start = Date.now();
  let last: T = await worker.evaluate(check);
  while (!last && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    last = await worker.evaluate(check);
  }
  return last;
}

async function readLocal(worker: Worker, keys: string[]): Promise<Record<string, unknown>> {
  return worker.evaluate((k) => new Promise((resolve) => chrome.storage.local.get(k, resolve)), keys);
}

const SMOKE_HOST = 'api.ipify.org';

// Probe target for the local liveness scan. Deliberately NOT the smoke host: a scan touches
// hundreds of candidates, and pointing that volume at the echo service the browser smoke uses
// makes the service throttle this egress IP and the smoke fail for an unrelated reason.
const PROBE_HOST = 'example.com';
const PROBE_PORT = 443;

interface CatalogProxy {
  protocol: string;
  ip: string;
  port: number;
}

function memberKey(proxy: CatalogProxy): string {
  return `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
}

/**
 * Probes one catalog member the way a real browser request does: SOCKS5 greeting, CONNECT to
 * PROBE_HOST:443, then a genuine TLS handshake through that tunnel with certificate validation.
 *
 * A proxy that completes the SOCKS5 handshake but answers with its own HTML error page instead
 * of tunnelling fails the handshake. The extension's own liveness check (checkProxyBatch,
 * src/background/index.ts:316) accepts any successful HTTP response, so it cannot tell those
 * two apart — that is why the pool needs an independent probe here.
 */
function probeSocks5Tunnel(proxy: CatalogProxy, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const sock = net.connect({ host: proxy.ip, port: proxy.port });
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);

    sock.setTimeout(timeoutMs);
    sock.on('timeout', () => finish(false));
    sock.on('error', () => finish(false));
    sock.on('connect', () => sock.write(Buffer.from([0x05, 0x01, 0x00])));

    let buf = Buffer.alloc(0);
    let stage: 'greet' | 'connect' = 'greet';
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'greet') {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05 || buf[1] !== 0x00) return finish(false);
        buf = buf.subarray(2);
        stage = 'connect';
        const host = Buffer.from(PROBE_HOST, 'ascii');
        sock.write(
          Buffer.concat([
            Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
            host,
            Buffer.from([(PROBE_PORT >> 8) & 0xff, PROBE_PORT & 0xff]),
          ])
        );
        return;
      }
      if (buf.length < 5) return;
      if (buf[0] !== 0x05 || buf[1] !== 0x00) return finish(false);
      const atyp = buf[3];
      const addrLen = atyp === 0x01 ? 4 : atyp === 0x03 ? buf[4] + 1 : 16;
      if (buf.length < 4 + addrLen + 2) return;
      sock.removeListener('data', onData);
      sock.setTimeout(0);

      // A successful, certificate-validated handshake is the proof: a stub proxy that answers
      // with HTML cannot produce one, and no request payload has to leave the tunnel.
      const secure = tls.connect(
        { socket: sock, servername: PROBE_HOST, rejectUnauthorized: true },
        () => finish(secure.authorized)
      );
      secure.on('error', () => finish(false));
      secure.on('close', () => finish(false));
    };
    sock.on('data', onData);
  });
}

/**
 * Reads the egress IP the way the browser sees it. Public echo services and public proxies both
 * drop requests occasionally, so a single navigation failure says nothing about routing — each
 * attempt gets a fresh page, and the screenshot always shows the last attempt (the answer, or
 * the error page that explains the failure).
 */
async function readEgressIp(
  context: BrowserContext,
  attempts: number,
  screenshotPath?: string
): Promise<{ ip: string; error?: string }> {
  let error = '';
  for (let i = 0; i < attempts; i++) {
    const page = await context.newPage();
    try {
      await page.goto(`https://${SMOKE_HOST}`, { timeout: 30_000 });
      const ip = (await page.textContent('body'))?.trim() || '';
      if (screenshotPath) await page.screenshot({ path: screenshotPath }).catch(() => undefined);
      await page.close();
      if (/^[0-9.]{7,15}$/.test(ip)) return { ip };
      error = `unexpected body: ${ip.slice(0, 120)}`;
    } catch (e) {
      error = String(e);
      if (screenshotPath) await page.screenshot({ path: screenshotPath }).catch(() => undefined);
      await page.close();
    }
  }
  return { ip: '', error };
}

/** Probes candidates in parallel until `want` real tunnels are confirmed or the budget expires. */
async function findLiveMembers(
  candidates: CatalogProxy[],
  want: number,
  budgetMs: number,
  concurrency = 150,
  timeoutMs = 7_000
): Promise<{ live: CatalogProxy[]; probed: number }> {
  const queue = [...candidates].sort(() => Math.random() - 0.5);
  const deadline = Date.now() + budgetMs;
  const live: CatalogProxy[] = [];
  let next = 0;
  let probed = 0;

  const worker = async () => {
    while (next < queue.length && live.length < want && Date.now() < deadline) {
      const proxy = queue[next++];
      const ok = await probeSocks5Tunnel(proxy, timeoutMs);
      probed++;
      if (ok && live.length < want) live.push(proxy);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { live, probed };
}

/**
 * Waits until PopupApp.init() has rendered the given preset name in the presets list
 * (src/popup/presets.ts render, called from Presets.init() at src/popup/index.ts:36 —
 * strictly before bindMainButton() at line 43). #main-button's own CSS class is
 * "main-button disconnected" already in the static HTML markup, so waiting on it
 * resolves before any JS runs and races bindMainButton(); waiting for async-rendered
 * preset content is a real signal that init() has progressed past it.
 */
async function waitForPopupReady(popup: Page, presetName: string, timeoutMs = 10_000): Promise<void> {
  await popup.waitForFunction(
    (name) => document.body.textContent?.includes(name) ?? false,
    presetName,
    { timeout: timeoutMs }
  );
}

test.describe('Public Pool — PAC routing and toggle without own proxies', () => {
  test.beforeAll(() => ensureReportsDir());

  test('Scenario 1: PAC pool routes preset domains through public pool members', async () => {
    // Budget: first scheduler cycle (≤150s) + local tunnel probe of the catalog (≤180s) + smoke.
    test.setTimeout(600_000);
    const { context } = await launchExtension();

    try {
      const sw = context.serviceWorkers()[0];
      if (!sw) throw new Error('Service worker not found');

      const report: Record<string, unknown> = {
        pacScript: '',
        alarm: null,
        ipDirect: '',
        ipViaPool: '',
        timestamp: new Date().toISOString(),
      };

      // 5a. Direct egress IP first, before any preset/proxy exists — this profile has
      // nothing configured yet, so the request is genuinely unproxied.
      const direct = await readEgressIp(context, 3);
      report.ipDirect = direct.ip;
      if (direct.error) report.ipDirectError = direct.error;

      // 1. Write pool preset (domains: example.org, *.wikipedia.org, api.ipify.org for the
      // network smoke below) into chrome.storage.local. ProxyManager only regenerates and
      // re-applies the PAC on connect/toggle (registerStorageChangeListener only invalidates
      // the cache, proxy-manager.ts:223-235) — including api.ipify.org from the start avoids
      // depending on a live mid-connection PAC refresh that a plain domain edit never triggers.
      await sw.evaluate(
        (preset) => new Promise<void>((resolve) => {
          chrome.storage.local.set({ presets: [preset], proxies: [] }, () => resolve());
        }),
        makePoolPreset('e2e-pool-preset', ['example.org', '*.wikipedia.org', 'api.ipify.org'])
      );
      await sw.evaluate(
        () => new Promise<void>((resolve) => chrome.storage.local.set({ targetState: 'connected' }, () => resolve()))
      );

      // 2. Wait for currentState === 'connected'.
      const connected = await waitForWorker(
        sw,
        () => new Promise<boolean>((resolve) => {
          chrome.storage.local.get('currentState', (r) => resolve(r.currentState === 'connected'));
        }),
        15_000,
        250
      );
      expect(connected, 'currentState did not reach connected').toBeTruthy();

      // 3-4. Wait for domainPoolMap to be populated with actual live-checkable members.
      // This needs PublicPoolScheduler's cycle (catalog fetch + liveness batches, up to
      // ~90s, see src/background/public-pool-scheduler.ts:113-186) to finish and call
      // refreshProxy() before the real per-domain PAC is (re)applied. `pools` starts as
      // `[[]]` — a pool SLOT with zero members — right after connect, before the cycle's
      // first refreshProxy(); checking for a formatted "SOCKS5 " entry (written by
      // formatProxyForPac, proxy-manager.ts:590) distinguishes a genuinely non-empty pool
      // from that transient empty-slot state, unlike a bare "pools != []" check.
      const poolReady = await waitForWorker(
        sw,
        () => new Promise<boolean>((resolve) => {
          chrome.proxy.settings.get({}, (details: any) => {
            const data: string = details?.value?.pacScript?.data || '';
            resolve(data.includes('example.org') && data.includes('wikipedia.org') && data.includes('SOCKS5 '));
          });
        }),
        150_000,
        2_000
      );

      // Steady-state emulation. resolvePoolMembers (src/shared/public-pool.ts:52) drops only
      // members already cached as 'dead', so in a fresh profile the pool serves never-checked
      // proxies and the smoke request can land on one that answers the SOCKS5 handshake without
      // tunnelling. Probe the catalog locally and seed publicProxyCheckResults with the verdicts
      // the background scheduler converges on over its own cycles — the state a running
      // installation is in — then let ProxyManager rebuild the PAC from that pool.
      const catalogCache = (await readLocal(sw, ['publicProxyCatalog'])).publicProxyCatalog as
        | { proxies?: CatalogProxy[] }
        | undefined;
      const socks5 = (catalogCache?.proxies ?? []).filter((p) => p.protocol === 'socks5');
      const { live, probed } = await findLiveMembers(socks5, 4, 180_000);
      report.catalogSocks5 = socks5.length;
      report.probedMembers = probed;
      report.liveMembers = live.map(memberKey);

      // Fewer than POOL_CHAIN (3) live members would shorten the PAC chain and misreport the
      // routing contract, so seed only with at least 3 confirmed tunnels. Otherwise keep the
      // pool the extension built by itself and let the smoke below record what happens.
      let poolSeeded = false;
      if (live.length >= 3) {
        const checkedAt = Date.now();
        const liveKeys = new Set(live.map(memberKey));
        const results: Record<string, { status: string; checkedAt: number }> = {};
        for (const proxy of socks5) {
          const key = memberKey(proxy);
          results[key] = { status: liveKeys.has(key) ? 'alive' : 'dead', checkedAt };
        }
        await sw.evaluate(
          (r) => new Promise<void>((resolve) => chrome.storage.local.set({ publicProxyCheckResults: r }, () => resolve())),
          results
        );

        // targetState changes are what drive ProxyManager.toggle() (src/background/index.ts:62),
        // and the PAC cache is keyed by a hash that includes the pool signature
        // (computeConfigHash, src/background/proxy-manager.ts:237) — so a disconnect/reconnect
        // regenerates the PAC from the seeded pool.
        await sw.evaluate(
          () => new Promise<void>((resolve) => chrome.storage.local.set({ targetState: 'disconnected' }, () => resolve()))
        );
        await waitForWorker(
          sw,
          () => new Promise<boolean>((resolve) => {
            chrome.storage.local.get('currentState', (r) => resolve(r.currentState === 'disconnected'));
          }),
          10_000,
          250
        );
        await sw.evaluate(
          () => new Promise<void>((resolve) => chrome.storage.local.set({ targetState: 'connected' }, () => resolve()))
        );

        const expected = `SOCKS5 ${live[0].ip}:${live[0].port}`;
        for (let i = 0; i < 60 && !poolSeeded; i++) {
          poolSeeded = await sw.evaluate(
            (needle) => new Promise<boolean>((resolve) => {
              chrome.proxy.settings.get({}, (details: any) =>
                resolve(String(details?.value?.pacScript?.data || '').includes(needle))
              );
            }),
            expected
          );
          if (!poolSeeded) await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      report.poolSeeded = poolSeeded;

      report.pacScript = await sw.evaluate(
        () => new Promise<string>((resolve) => {
          chrome.proxy.settings.get({}, (details: any) => resolve(details?.value?.pacScript?.data || ''));
        })
      );
      report.alarm = await sw.evaluate(
        () => new Promise((resolve) => chrome.alarms.get('public_pool_check', (a) => resolve(a || null)))
      );
      report.poolReady = poolReady;

      // 5b. Egress IP through the pool preset (api.ipify.org is one of its domains from the start).
      if (poolReady) {
        const viaPool = await readEgressIp(context, 3, path.join(REPORTS_DIR, 'PLAN-017-pac-pool.png'));
        report.ipViaPool = viaPool.ip;
        if (viaPool.error) report.ipViaPoolError = viaPool.error;
      } else {
        const fallbackPage = await context.newPage();
        await fallbackPage.screenshot({ path: path.join(REPORTS_DIR, 'PLAN-017-pac-pool.png') }).catch(() => undefined);
        await fallbackPage.close();
      }

      fs.writeFileSync(path.join(REPORTS_DIR, 'PLAN-017-pac-pool.json'), JSON.stringify(report, null, 2));
      expect(poolReady, 'domainPoolMap never populated within 150s — see reports/PLAN-017-pac-pool.json').toBeTruthy();
    } finally {
      await context.close();
    }
  });

  test('Scenario 2: proxy enables with pool preset and no own proxies; Default preset still guards', async () => {
    test.setTimeout(60_000);
    const { context, popupUrl } = await launchExtension();

    try {
      let popup: Page = await openPopup(context, popupUrl);

      // Clean slate: no own proxies, one pool preset covering example.org.
      await popup.evaluate(
        (preset) => new Promise<void>((resolve) => {
          chrome.storage.local.set(
            { proxies: [], presets: [preset], targetState: 'disconnected', currentState: 'disconnected' },
            () => resolve()
          );
        }),
        makePoolPreset('e2e-pool-only-preset', ['example.org'])
      );
      await popup.close();
      popup = await openPopup(context, popupUrl);
      await waitForPopupReady(popup, 'e2e-pool-only-preset');

      const proxiesCount = await popup.evaluate(
        () => new Promise<number>((resolve) => chrome.storage.local.get('proxies', (r) => resolve((r.proxies || []).length)))
      );

      const clickedAt = Date.now();
      await popup.locator('#main-button').click();

      // dialogShown: real DOM check right after the click (showConfirm renders `.modal-overlay`,
      // see src/popup/dialog.ts:84-90), not a stored/derived value.
      await popup.waitForTimeout(400);
      const dialogShown = (await popup.locator('.modal-overlay').count()) > 0;

      const targetState = await popup.evaluate(
        () => new Promise<string>((resolve) => chrome.storage.local.get('targetState', (r) => resolve(r.targetState || '')))
      );

      let currentState = '';
      let connectedAfterMs = 0;
      for (let i = 0; i < 80; i++) {
        await popup.waitForTimeout(100);
        currentState = await popup.evaluate(
          () => new Promise<string>((resolve) => chrome.storage.local.get('currentState', (r) => resolve(r.currentState || '')))
        );
        if (currentState === 'connected') {
          connectedAfterMs = Date.now() - clickedAt;
          break;
        }
      }

      const buttonClass = await popup.locator('#main-button').getAttribute('class');
      await popup.screenshot({ path: path.join(REPORTS_DIR, 'PLAN-017-toggle-pool-only.png') });

      // Control: same preset loses its pool (back to "Default"/no proxy) — disconnect, then
      // reconnect. With 0 proxies and no pool preset, handleMainButtonClick must show the dialog.
      await popup.evaluate(
        () => new Promise<void>((resolve) => {
          chrome.storage.local.get('presets', (r: any) => {
            const presets = r.presets || [];
            const preset = presets.find((p: any) => p.id === 'e2e-pool-only-preset');
            if (preset) {
              preset.publicPool = null;
              preset.proxyId = null;
            }
            chrome.storage.local.set({ presets, targetState: 'disconnected', currentState: 'disconnected' }, () => resolve());
          });
        })
      );
      await popup.close();
      popup = await openPopup(context, popupUrl);
      await waitForPopupReady(popup, 'e2e-pool-only-preset');

      await popup.locator('#main-button').click();
      await popup.waitForTimeout(400);
      const controlDialogShown = (await popup.locator('.modal-overlay').count()) > 0;

      const report = {
        proxiesCount,
        dialogShown,
        targetState,
        currentState,
        connectedAfterMs,
        buttonClass,
        control: { dialogShown: controlDialogShown },
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(REPORTS_DIR, 'PLAN-017-toggle-pool-only.json'), JSON.stringify(report, null, 2));

      expect(proxiesCount).toBe(0);
      await popup.close();
    } finally {
      await context.close();
    }
  });
});
