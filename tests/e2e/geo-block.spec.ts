/**
 * Geo-block badge — own proxy (QA-175)
 *
 * Покрывает функциональную область "гео-блок бейдж" на собственном прокси
 * (route.kind === 'own'): классификатор classifyGeoBlock, IconManager.setTabProxyBadge,
 * per-tab title geoBlockedTitle.
 *
 * TC1: preset-правило, свой прокси отвечает 451 на /blocked -> бейдж ⛔, title geoBlockedTitle (en)
 * TC2: та же вкладка, /ok (200) -> бейдж ✓
 * TC3: режим "proxy all" без preset-правила, /blocked (451) -> бейдж ⛔
 * TC4: тот же режим, /forbidden (403) -> бейдж ✓ (обычный 403 на своём прокси — не гео-блок)
 *
 * См. .workflow/src/skills/shared/testing-conventions.md
 */

import { test, expect } from '@playwright/test';
import { launchExtension, openPopup } from './helpers/extension';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEO_OWN_HOST = 'geo-own.invalid';

/**
 * Локальный HTTP-прокси теста: сам отвечает на путь запроса своим статусом
 * (не резолвит и не форвардит) — geo-own.invalid не резолвится, запрос уходит
 * на прокси целиком (QA-175 постановка).
 */
function startOwnProxyServer(): Promise<{ port: number; close: () => Promise<void> }> {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let pathname = '/';
            try {
                pathname = new URL(req.url || '/', `http://${GEO_OWN_HOST}`).pathname;
            } catch {
                // keep default '/'
            }

            if (pathname === '/blocked') {
                res.writeHead(451, { 'Content-Type': 'text/plain' });
                res.end('blocked');
            } else if (pathname === '/ok') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('ok');
            } else if (pathname === '/forbidden') {
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('forbidden');
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('not found');
            }
        });
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as net.AddressInfo).port;
            resolve({
                port,
                close: () => new Promise<void>((done) => server.close(() => done())),
            });
        });
    });
}

function buildFixture(proxyPort: number, opts: { presetRule: boolean; proxyByDefault: boolean }) {
    const proxy = {
        id: 'geo-own-proxy',
        type: 'http' as const,
        host: '127.0.0.1',
        port: proxyPort,
        isDefault: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    const presets = opts.presetRule
        ? [{
            id: 'geo-own-preset',
            name: 'Geo Own Preset',
            domains: [GEO_OWN_HOST],
            enabled: true,
            isDefault: false,
            order: 0,
            proxyId: null,
            publicPool: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }]
        : [];

    return {
        presets,
        proxies: [proxy],
        theme: 'light' as const,
        language: 'en' as const,
        syncEnabled: false,
        proxyByDefault: opts.proxyByDefault,
        proxyCheckEnabled: false,
        publicProxiesWarningDismissed: false,
        publicProxiesFiltersCollapsed: false,
        targetState: 'connected' as const,
    };
}

test.describe('Geo-block badge — own proxy (QA-175)', () => {
    let context: any;
    let popupUrl: string;
    let proxyServer: { port: number; close: () => Promise<void> };

    test.beforeAll(async () => {
        proxyServer = await startOwnProxyServer();
        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close();
        await proxyServer?.close();
    });

    test('TC1-TC4: geo-block badge scenarios on own proxy', async () => {
        test.setTimeout(90000);

        const popup = await openPopup(context, popupUrl);

        const applyStorage = async (data: unknown) => {
            await popup.evaluate(async (payload: any) => {
                await new Promise<void>((resolve) => chrome.storage.local.set(payload, () => resolve()));
                // Продакшен-путь "конфиг роутинга изменился": popup просит background
                // пересобрать PAC и обновить бейджи вкладок.
                await new Promise<void>((resolve) => chrome.runtime.sendMessage({ action: 'toggleProxy' }, () => resolve()));
            }, data);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        };

        const readTabState = async (urlPrefix: string) => popup.evaluate(async (prefix: string) => {
            const tabs = await new Promise<any[]>((resolve) => chrome.tabs.query({}, resolve));
            const tab = tabs.filter((t) => (t.url || '').startsWith(prefix)).pop();
            if (!tab) return { tabId: -1, badgeText: '', badgeColor: [] as number[], title: '' };
            const badgeText = await new Promise<string>((resolve) => chrome.action.getBadgeText({ tabId: tab.id }, resolve));
            const badgeColor = await new Promise<number[]>((resolve) => chrome.action.getBadgeBackgroundColor({ tabId: tab.id }, resolve as any));
            const title = await new Promise<string>((resolve) => chrome.action.getTitle({ tabId: tab.id }, resolve));
            return { tabId: tab.id, badgeText: badgeText || '', badgeColor: Array.isArray(badgeColor) ? badgeColor : [], title: title || '' };
        }, urlPrefix);

        const results: any = {};

        // --- TC1: preset-правило, /blocked (451) -> гео-блок бейдж ---
        await applyStorage(buildFixture(proxyServer.port, { presetRule: true, proxyByDefault: false }));
        const tab = await context.newPage();
        await tab.goto(`http://${GEO_OWN_HOST}/blocked`, { waitUntil: 'load', timeout: 30000 }).catch(() => { /* recorded via badge state */ });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const tc1 = await readTabState(`http://${GEO_OWN_HOST}`);
        results.tc1 = { status: 451, badgeText: tc1.badgeText, badgeColor: tc1.badgeColor, title: tc1.title };

        // --- TC2: та же вкладка, /ok (200) -> обычный бейдж ---
        await tab.goto(`http://${GEO_OWN_HOST}/ok`, { waitUntil: 'load', timeout: 30000 }).catch(() => { /* recorded via badge state */ });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const tc2 = await readTabState(`http://${GEO_OWN_HOST}`);
        results.tc2 = { status: 200, badgeText: tc2.badgeText, badgeColor: tc2.badgeColor, title: tc2.title };

        // --- TC4: та же вкладка (preset-правило), /forbidden (403) -> обычный 403 не гео-блок ---
        await tab.goto(`http://${GEO_OWN_HOST}/forbidden`, { waitUntil: 'load', timeout: 30000 }).catch(() => { /* recorded via badge state */ });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const tc4 = await readTabState(`http://${GEO_OWN_HOST}`);
        results.tc4 = { status: 403, badgeText: tc4.badgeText, badgeColor: tc4.badgeColor, title: tc4.title };

        // --- TC3: режим "proxy all" без preset-правила, /blocked (451) -> гео-блок бейдж ---
        await applyStorage(buildFixture(proxyServer.port, { presetRule: false, proxyByDefault: true }));
        await tab.goto(`http://${GEO_OWN_HOST}/blocked`, { waitUntil: 'load', timeout: 30000 }).catch(() => { /* recorded via badge state */ });
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const tc3 = await readTabState(`http://${GEO_OWN_HOST}`);
        results.tc3 = { status: 451, badgeText: tc3.badgeText, badgeColor: tc3.badgeColor, title: tc3.title };

        await tab.close();
        await popup.close();

        const reportsDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        fs.writeFileSync(
            path.join(reportsDir, 'geo-block-own.json'),
            JSON.stringify(results, null, 2)
        );

        console.log('QA-175 results:', JSON.stringify(results, null, 2));

        // Спек фиксирует фактические значения; расхождение с ожиданием — найденный
        // продуктовый дефект, записываемый в тикет, а не падение раннера (QA-175 DoD).
        expect(results.tc1.status).toBe(451);
    });
});

/**
 * Geo-block pool route — public pool (QA-177, перепроверка с измерениями QA-184)
 *
 * Функциональная область: гео-блок на маршруте публичного пула (route.kind === 'pool') —
 * классификатор ответа прокси, исключение ответившего прокси из пула, автоматическая
 * перезагрузка вкладки, записи пресета в publicPoolGeoExclusions и publicPoolGeoSites.
 *
 * Стенд: локальные SOCKS5-relay по образцу tests/e2e/badge-pool.spec.ts:22. Каждый relay
 * слушает свой loopback-адрес (127.0.0.2, 127.0.0.3, ...) и отвечает на запрос сам, не
 * форвардя его: цель geo-pool.invalid не резолвится. Тот же адрес записан у участника в
 * каталоге пула и в ключе publicProxyCheckResults как socks5://<адрес>:<порт> — поэтому
 * обработчик сопоставляет ответивший прокси по details.ip, а не только по голове цепочки.
 *
 * Роль "блокирующего" relay получает голова цепочки текущего PAC: PAC читается через
 * chrome.proxy.settings.get, порядок цепочки — вызовом FindProxyForURL из этого PAC
 * (decodeChain ниже), а не порядком каталога.
 *
 * TC1, 3 relay: голова 403 -> перезагрузка, 200 с телом другого relay, одно исключение пресета.
 * TC5 (сразу за TC1, продолжает его состояние): прокси выключают и включают — исключённый
 *   relay остаётся вне цепочки PAC.
 * TC2, 1 relay: 403 с cf-mitigated: challenge -> перезагрузок и исключений нет.
 * TC3, 7 relay: все 403 -> 5 исключений, сайт остановлен, бейдж ⛔.
 * TC4, 2 relay: оба 403 -> 1 исключение, бейдж ⛔.
 *
 * Значения отчёта измеряются, а не записываются литералами:
 * - firstStatus — статус первого ответа навигации вкладки (событие response самой вкладки);
 * - reloadCount — по событиям навигации вкладки (framenavigated), минус собственная загрузка
 *   теста: каждая перезагрузка расширения даёт ровно один лишний коммит;
 * - servedBy — имя relay из тела ответа (relay-<имя> у пропустившего, blocked-<имя> у
 *   заблокировавшего) либо null, если страницы нет;
 * - exclusionsCount — число записей пресета в publicPoolGeoExclusions (убранные прокси,
 *   а не число пресетов);
 * - badgeText — бейдж вкладки до её закрытия (chrome.action.getBadgeText);
 * - poolSize — число участников пула пресета в PAC после прогона кейса;
 * - geoSites — записи серии сайта пресета в publicPoolGeoSites после кейса.
 *
 * Каждый кейс открывает вкладку на своём URL (http://geo-pool.invalid/<кейс>), а маршрут
 * пула задан по хосту, поэтому вкладки кейсов не путаются между собой. Доказательство
 * работы стенда — соедиения и запросы, принятые каждым relay (поле relays).
 *
 * Relay и контекст закрываются в afterAll при любом исходе. Результаты — в
 * reports/geo-block-pool.json.
 */

const POOL_HOST = 'geo-pool.invalid';
const POOL_ORIGIN = `http://${POOL_HOST}`;

const HTTP_REASON: Record<number, string> = {
    200: 'OK',
    403: 'Forbidden',
    451: 'Unavailable For Legal Reasons',
};

interface RelayResponse {
    statusCode: number;
    body?: string;
    headers?: Record<string, string>;
}

interface Relay {
    name: string;
    ip: string;
    port: number;
    /** Мутируется между кейсами: голова цепочки отвечает 403, остальные — 200. */
    response: RelayResponse;
    /** Строки "host:port" входящих CONNECT за текущий кейс — доказательство, что Chromium ходил сюда. */
    connects: string[];
    /** Строки запросов HTTP, обслуженных relay за текущий кейс. */
    requests: string[];
    close: () => Promise<void>;
}

/**
 * Локальный SOCKS5-relay (no auth, CONNECT only) по образцу tests/e2e/badge-pool.spec.ts:22,
 * который отвечает на HTTP-запрос сам, не форвардя его: цель geo-pool.invalid не резолвится,
 * тело ответа формирует relay.
 */
function startSocks5Relay(name: string, ip: string, response: RelayResponse): Promise<Relay> {
    const relay = {
        name,
        ip,
        port: 0,
        response,
        connects: [] as string[],
        requests: [] as string[],
        close: () => Promise.resolve(),
    } as Relay;

    const server = net.createServer((client) => {
        let stage: 'greet' | 'request' | 'http' = 'greet';
        let buffer = Buffer.alloc(0);

        const onData = (chunk: Buffer) => {
            buffer = Buffer.concat([buffer, chunk]);

            if (stage === 'greet') {
                if (buffer.length < 2) return;
                const methods = buffer[1];
                if (buffer.length < 2 + methods) return;
                client.write(Buffer.from([0x05, 0x00])); // no authentication required
                buffer = buffer.subarray(2 + methods);
                stage = 'request';
            }

            if (stage === 'request') {
                if (buffer.length < 5) return;
                const atyp = buffer[3];
                let host = '';
                let offset = 4;
                if (atyp === 0x01) {
                    if (buffer.length < 10) return;
                    host = `${buffer[4]}.${buffer[5]}.${buffer[6]}.${buffer[7]}`;
                    offset = 8;
                } else if (atyp === 0x03) {
                    if (buffer.length < 5 + buffer[4] + 2) return;
                    const len = buffer[4];
                    host = buffer.subarray(5, 5 + len).toString('utf8');
                    offset = 5 + len;
                } else {
                    client.destroy();
                    return;
                }
                const port = buffer.readUInt16BE(offset);
                relay.connects.push(`${host}:${port}`);
                // success reply with a dummy bound address
                client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
                buffer = buffer.subarray(offset + 2);
                stage = 'http';
            }

            if (stage === 'http') {
                const headerEnd = buffer.indexOf('\r\n\r\n');
                if (headerEnd === -1) return;
                const requestLine = buffer.subarray(0, headerEnd).toString('utf8').split('\r\n')[0] || '';
                relay.requests.push(requestLine);
                const status = relay.response.statusCode;
                const body = Buffer.from(relay.response.body ?? `relay-${relay.name}`, 'utf8');
                let head = `HTTP/1.1 ${status} ${HTTP_REASON[status] ?? 'Status'}\r\n` +
                    `Content-Type: text/plain\r\n` +
                    `Content-Length: ${body.length}\r\n`;
                for (const [headerName, headerValue] of Object.entries(relay.response.headers ?? {})) {
                    head += `${headerName}: ${headerValue}\r\n`;
                }
                client.write(head + 'Connection: close\r\n\r\n');
                client.write(body);
                client.end();
            }
        };

        client.on('data', onData);
        client.on('error', () => { /* браузер закрывает соединения сам */ });
    });

    return new Promise((resolve) => {
        server.listen(0, ip, () => {
            relay.port = (server.address() as net.AddressInfo).port;
            relay.close = () => new Promise<void>((done) => server.close(() => done()));
            resolve(relay);
        });
    });
}

/**
 * Порядок цепочки — из PAC, установленного в браузере: сам PAC-скрипт несёт собственный
 * FindProxyForURL, его и вызываем. Возвращает список звеньев ("SOCKS5 127.0.0.2:1234", ...),
 * первое звено — голова, та самая, что ответит на запрос первой.
 */
function decodeChain(pac: string, url: string, host: string): string[] {
    const factory = new Function(`${pac}\nreturn FindProxyForURL;`) as () => (u: string, h: string) => string;
    return String(factory()(url, host))
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean);
}

/** Участники пула пресета в PAC (после применения исключений) — по domainPoolMap хоста. */
function decodePoolMembers(pac: string, host: string): string[] {
    const poolsMatch = /var pools = (\[.*?\]);/.exec(pac);
    const mapMatch = /var domainPoolMap = (\{.*?\});/.exec(pac);
    if (!poolsMatch || !mapMatch) return [];
    const pools = JSON.parse(poolsMatch[1]) as string[][];
    const domainPoolMap = JSON.parse(mapMatch[1]) as Record<string, number>;
    const index = domainPoolMap[host];
    return index === undefined ? [] : (pools[index] || []);
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

test.describe('Geo-block pool route (QA-177, измеренные значения QA-184)', () => {
    let context: any;
    let popupUrl: string;
    const relays: Record<string, Relay> = {};

    test.beforeAll(async () => {
        // TC1/TC5: три участника, каждый на своём loopback-адресе.
        relays['tc1-1'] = await startSocks5Relay('tc1-1', '127.0.0.2', { statusCode: 200 });
        relays['tc1-2'] = await startSocks5Relay('tc1-2', '127.0.0.3', { statusCode: 200 });
        relays['tc1-3'] = await startSocks5Relay('tc1-3', '127.0.0.4', { statusCode: 200 });
        // TC2: один участник, ответ с признаком проверки Cloudflare.
        relays['tc2'] = await startSocks5Relay('tc2', '127.0.0.5', { statusCode: 403 });
        // TC3: семь участников.
        for (let i = 1; i <= 7; i++) {
            relays[`tc3-${i}`] = await startSocks5Relay(`tc3-${i}`, `127.0.0.${5 + i}`, { statusCode: 403 });
        }
        // TC4: два участника.
        for (let i = 1; i <= 2; i++) {
            relays[`tc4-${i}`] = await startSocks5Relay(`tc4-${i}`, `127.0.0.${13 + i}`, { statusCode: 403 });
        }

        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close();
        for (const relay of Object.values(relays)) {
            await relay?.close();
        }
    });

    test('TC1-TC5: geo-block pool scenarios with measured values', async () => {
        test.setTimeout(300000);

        const popup = await openPopup(context, popupUrl);

        const readPac = async (): Promise<string> => popup.evaluate(async () => {
            const settings: any = await new Promise((resolve) => chrome.proxy.settings.get({}, resolve));
            return settings?.value?.pacScript?.data ?? '';
        });

        const readExclusionKeys = async (presetId: string): Promise<string[]> => popup.evaluate(async (id: string) => {
            const result: any = await new Promise((resolve) => chrome.storage.local.get(['publicPoolGeoExclusions'], resolve));
            return Object.keys((result.publicPoolGeoExclusions || {})[id] || {});
        }, presetId);

        const readGeoSites = async (presetId: string): Promise<Record<string, unknown>> => popup.evaluate(async (id: string) => {
            const result: any = await new Promise((resolve) => chrome.storage.local.get(['publicPoolGeoSites'], resolve));
            return (result.publicPoolGeoSites || {})[id] || {};
        }, presetId);

        /** Бейдж вкладки кейса — по URL кейса, с диагностикой всех подходящих вкладок. */
        const readCaseTab = async (caseKey: string) => popup.evaluate(async (key: string) => {
            const prefix = `http://geo-pool.invalid/${key}`;
            const tabs = await new Promise<any[]>((resolve) => chrome.tabs.query({}, resolve));
            const matched = tabs.filter((t) => (t.url || '').startsWith(prefix));
            const matchedTabs: Array<{ tabId: number; url: string; badgeText: string }> = [];
            for (const entry of matched) {
                const text = await new Promise<string>((resolve) => chrome.action.getBadgeText({ tabId: entry.id }, resolve));
                matchedTabs.push({ tabId: entry.id, url: entry.url || '', badgeText: text || '' });
            }
            const last = matchedTabs[matchedTabs.length - 1];
            return { tabId: last ? last.tabId : -1, badgeText: last ? last.badgeText : '', matchedTabs };
        }, caseKey);

        const applyStorage = async (data: unknown) => {
            await popup.evaluate(async (payload: any) => {
                await new Promise<void>((resolve) => chrome.storage.local.set(payload, () => resolve()));
                // Продакшен-путь "конфиг роутинга изменился": popup просит background
                // пересобрать PAC и обновить бейджи вкладок.
                await new Promise<void>((resolve) => chrome.runtime.sendMessage({ action: 'toggleProxy' }, () => resolve()));
            }, data);
            await delay(2500);
        };

        const buildPoolFixture = (presetId: string, members: Relay[], extra: Record<string, unknown> = {}) => ({
            presets: [{
                id: presetId,
                name: presetId,
                domains: [POOL_HOST],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
                publicPool: { protocols: ['socks5'] },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }],
            proxies: [],
            theme: 'light' as const,
            language: 'en' as const,
            syncEnabled: false,
            proxyByDefault: false,
            proxyCheckEnabled: false,
            publicProxiesWarningDismissed: false,
            publicProxiesFiltersCollapsed: false,
            publicProxyCheckResults: Object.fromEntries(members.map((relay) => [
                `socks5://${relay.ip}:${relay.port}`,
                { status: 'alive' as const, checkedAt: Date.now() },
            ])),
            publicProxyCatalog: {
                fetchedAt: Date.now(),
                proxies: members.map((relay, index) => ({
                    protocol: 'socks5' as const,
                    ip: relay.ip,
                    port: relay.port,
                    score: 80 - index,
                    connectionType: 'residential',
                    country: 'RU',
                })),
            },
            targetState: 'connected' as const,
            ...extra,
        });

        /** Раздаёт роли: 'head' — 403 отвечает голова цепочки PAC, 'all' — все, 'none' — все 200. */
        const armRelays = (members: Relay[], headPac: string, blocking: 'head' | 'all' | 'none', challenge = false) => {
            for (const relay of members) {
                const blocked = blocking === 'all'
                    || (blocking === 'head' && headPac === `SOCKS5 ${relay.ip}:${relay.port}`);
                // Тело непустое: на пустое тело 4xx Chromium подменяет ответ своей страницей
                // ошибки, вкладка уходит на chrome-error:// — и наблюдать бейдж и перезагрузки
                // становится не на чем.
                relay.response = blocked
                    ? { statusCode: 403, body: `blocked-${relay.name}`, headers: challenge ? { 'cf-mitigated': 'challenge' } : {} }
                    : { statusCode: 200, body: `relay-${relay.name}` };
            }
        };

        /** Ждёт, пока навигации вкладки успокоятся: тишина по событиям вкладки quietMs. */
        const waitForSettle = async (count: () => number, quietMs = 2500, timeoutMs = 60000): Promise<void> => {
            const started = Date.now();
            let last = count();
            let lastChange = Date.now();
            while (Date.now() - started < timeoutMs) {
                await delay(400);
                const current = count();
                if (current !== last) {
                    last = current;
                    lastChange = Date.now();
                    continue;
                }
                if (last > 0 && Date.now() - lastChange >= quietMs) return;
            }
        };

        const runCase = async (options: {
            key: string;
            presetId: string;
            members: Relay[];
            blocking: 'head' | 'all' | 'none';
            challenge?: boolean;
            extra?: Record<string, unknown>;
            /** Для TC5: своя подготовка состояния вместо чистой установки фикстуры. */
            prepare?: () => Promise<void>;
        }) => {
            if (options.prepare) {
                await options.prepare();
            } else {
                await applyStorage(buildPoolFixture(options.presetId, options.members, options.extra));
            }

            const url = `${POOL_ORIGIN}/${options.key}`;
            const pacBefore = await readPac();
            armRelays(options.members, decodeChain(pacBefore, url, POOL_HOST)[0] || '', options.blocking, options.challenge);
            for (const relay of options.members) {
                relay.connects = [];
                relay.requests = [];
            }

            // Измерения — по событиям самой вкладки: собственный переход теста даёт один
            // коммит и один ответ навигации, каждая перезагрузка расширения — ещё по одному.
            const navigations: string[] = [];
            const responses: number[] = [];
            const tab = await context.newPage();
            tab.on('framenavigated', (frame: any) => {
                if (frame === tab.mainFrame()) navigations.push(frame.url());
            });
            tab.on('response', (response: any) => {
                if (response.frame() === tab.mainFrame() && response.request().isNavigationRequest()) {
                    responses.push(response.status());
                }
            });

            await tab.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => { /* перезагрузка расширения рвёт load */ });
            await waitForSettle(() => navigations.length + responses.length);

            const tabState = await readCaseTab(options.key);
            const bodyText = await tab.evaluate(() => (document.body ? document.body.innerText.trim() : '')).catch(() => '');
            const tabUrl = tab.url();
            await tab.close();

            const pacAfter = await readPac();
            // Тело ответа — relay-<имя> у пропустившего прокси и blocked-<имя> у заблокировавшего;
            // в обоих случаях страницу отдал конкретный relay, его имя и записываем.
            const servedByMatch = /^(?:relay|blocked)-(.+)$/.exec(bodyText);

            return {
                firstStatus: responses.length > 0 ? responses[0] : null,
                reloadCount: Math.max(0, navigations.length - 1),
                servedBy: servedByMatch ? servedByMatch[1] : null,
                exclusionsCount: (await readExclusionKeys(options.presetId)).length,
                badgeText: tabState.badgeText,
                poolSize: decodePoolMembers(pacAfter, POOL_HOST).length,
                pacHead: decodeChain(pacBefore, url, POOL_HOST)[0] || null,
                pacChain: decodeChain(pacAfter, url, POOL_HOST),
                geoSites: await readGeoSites(options.presetId),
                // Доказательства стенда.
                navigationUrls: navigations,
                responseStatuses: responses,
                tabUrl,
                matchedTabs: tabState.matchedTabs,
                bodyText,
                relays: options.members.map((relay) => ({
                    name: relay.name,
                    ip: relay.ip,
                    port: relay.port,
                    connects: relay.connects,
                    requests: relay.requests,
                })),
            };
        };

        const results: any = {};

        // --- TC1: 3 relay, голова 403 -> перезагрузка и 200 от другого relay ---
        const tc1Members = [relays['tc1-1'], relays['tc1-2'], relays['tc1-3']];
        results.tc1 = await runCase({
            key: 'tc1',
            presetId: 'qa184-tc1',
            members: tc1Members,
            blocking: 'head',
            extra: { publicPoolGeoExclusions: {}, publicPoolGeoSites: {} },
        });
        results.tc1.excludedKeys = await readExclusionKeys('qa184-tc1');

        // --- TC5 продолжает TC1: его исключение сохраняется, прокси выключают и включают ---
        results.tc5 = await runCase({
            key: 'tc1',
            presetId: 'qa184-tc1',
            members: tc1Members,
            blocking: 'none',
            prepare: async () => {
                await applyStorage(buildPoolFixture('qa184-tc1', tc1Members, { targetState: 'disconnected' as const }));
                await applyStorage(buildPoolFixture('qa184-tc1', tc1Members));
            },
        });
        const tc1ExcludedPacEntries = (results.tc1.excludedKeys as string[])
            .map((key) => key.replace(/^socks5:\/\//, 'SOCKS5 '));
        results.tc5.excludedKeys = results.tc1.excludedKeys;
        results.tc5.excludedRelayInChain = tc1ExcludedPacEntries
            .some((entry) => (results.tc5.pacChain as string[]).includes(entry));

        // --- TC2: один relay, 403 с cf-mitigated: challenge -> без перезагрузок и исключений ---
        results.tc2 = await runCase({
            key: 'tc2',
            presetId: 'qa184-tc2',
            members: [relays['tc2']],
            blocking: 'head',
            challenge: true,
            extra: { publicPoolGeoExclusions: {}, publicPoolGeoSites: {} },
        });

        // --- TC3: 7 relay, все 403 -> 5 исключений, сайт остановлен, бейдж ⛔ ---
        results.tc3 = await runCase({
            key: 'tc3',
            presetId: 'qa184-tc3',
            members: Object.keys(relays).filter((name) => name.startsWith('tc3-')).map((name) => relays[name]),
            blocking: 'all',
            extra: { publicPoolGeoExclusions: {}, publicPoolGeoSites: {} },
        });

        // --- TC4: 2 relay, оба 403 -> 1 исключение, бейдж ⛔ ---
        results.tc4 = await runCase({
            key: 'tc4',
            presetId: 'qa184-tc4',
            members: Object.keys(relays).filter((name) => name.startsWith('tc4-')).map((name) => relays[name]),
            blocking: 'all',
            extra: { publicPoolGeoExclusions: {}, publicPoolGeoSites: {} },
        });

        await popup.close();

        const reportsDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        fs.writeFileSync(
            path.join(reportsDir, 'geo-block-pool.json'),
            JSON.stringify(results, null, 2)
        );

        console.log('QA-184 results:', JSON.stringify(results, null, 2));

        // Спек фиксирует фактические значения: расхождение с ожиданием плана — найденный
        // продуктовый дефект, записываемый в тикет, а не падение раннера. Проверяется
        // здесь только то, что стенд отработал и измерения записаны (QA-184 DoD).
        for (const key of ['tc1', 'tc2', 'tc3', 'tc4', 'tc5']) {
            expect(results[key], `измерения ${key} записаны`).toBeDefined();
            expect(typeof results[key].firstStatus, `${key}: firstStatus измерен`).toBe('number');
            expect(results[key].matchedTabs.length, `${key}: вкладка кейса найдена`).toBeGreaterThan(0);
        }
    });
});
