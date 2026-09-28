/**
 * Ручная проверка редактора пресета с публичным пулом (PLAN-017, задача 35).
 *
 * Функциональная область: раскрытый пресет на вкладке Presets — селект прокси
 * с опцией `🌐 Public pool` и блок настроек пула `.preset-pool-config`
 * (чекбоксы протоколов, подсказка под `http`, фильтры, строка статуса).
 *
 * Все наблюдения читаются из живого DOM и `chrome.storage` через
 * `page.evaluate` и складываются в `reports/PLAN-017-preset-pool.json` —
 * значения не вписываются руками. Скриншоты обеих тем — там же.
 *
 * Каталог публичных прокси подкладывается в кэш `publicProxyCatalog` из
 * локального `sources/proxys.json`: проверяется UI пула, а не доступность CDN,
 * и прогон не зависит от сети.
 *
 * При расширении покрытия по редактору пула — добавляй test() блоки в этот файл.
 * См. .workflow/src/skills/shared/testing-conventions.md
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { launchExtension, openPopup } from './helpers/extension';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'reports');
const REPORT_JSON = path.join(REPORTS_DIR, 'PLAN-017-preset-pool.json');
const SCREENSHOT_DARK = path.join(REPORTS_DIR, 'PLAN-017-preset-pool-dark.png');
const SCREENSHOT_LIGHT = path.join(REPORTS_DIR, 'PLAN-017-preset-pool-light.png');

/** Ширина попапа, на которой проверяется отсутствие переполнения */
const POPUP_WIDTH = 280;

interface OverflowMetrics {
    right: number;
    scrollWidth: number;
    clientWidth: number;
}

interface PoolReport {
    initialProtocols: string[];
    afterUncheckLast: string[];
    httpHint: string;
    countryOptions: number;
    status: string;
    afterReload: { proxyId: string | null; publicPool: Record<string, unknown> | null };
    afterDefault: { proxyId: string | null; publicPool: Record<string, unknown> | null; blockVisible: boolean };
    overflow: { dark: OverflowMetrics; light: OverflowMetrics };
}

const EMPTY_OVERFLOW: OverflowMetrics = { right: -1, scrollWidth: -1, clientWidth: -1 };

const report: PoolReport = {
    initialProtocols: [],
    afterUncheckLast: [],
    httpHint: '',
    countryOptions: 0,
    status: '',
    afterReload: { proxyId: null, publicPool: null },
    afterDefault: { proxyId: null, publicPool: null, blockVisible: true },
    overflow: { dark: { ...EMPTY_OVERFLOW }, light: { ...EMPTY_OVERFLOW } },
};

/** Нормализованный каталог публичных прокси из локального sources/proxys.json */
function loadLocalCatalog(): Array<Record<string, unknown>> {
    const raw = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'sources', 'proxys.json'), 'utf-8'));
    const result: Array<Record<string, unknown>> = [];
    for (const protocol of ['http', 'https', 'socks4', 'socks5'] as const) {
        for (const entry of raw[protocol] || []) {
            const [ip, portStr] = String(entry.ip).split(':');
            const port = parseInt(portStr, 10);
            if (!ip || Number.isNaN(port)) continue;
            result.push({
                protocol,
                ip,
                port,
                score: entry.score,
                connectionType: String(entry.type).toLowerCase(),
                country: entry.country,
            });
        }
    }
    return result.sort((a, b) => (b.score as number) - (a.score as number));
}

/** Открывает попап в узкой раскладке (280px), как в реальном окне расширения */
async function openNarrowPopup(context: BrowserContext, popupUrl: string): Promise<Page> {
    const page = await openPopup(context, popupUrl);
    await page.setViewportSize({ width: POPUP_WIDTH, height: 900 });
    await page.waitForTimeout(600);
    return page;
}

/** Раскрывает первый непустой пресет на вкладке Presets */
async function openPresetEditor(page: Page): Promise<void> {
    await page.locator('[data-tab="presets"]').click();
    await page.waitForTimeout(600);
    const expandBtn = page.locator('.preset-item .preset-expand-btn').first();
    await expandBtn.waitFor({ state: 'visible', timeout: 10000 });
    const expanded = await page.locator('.preset-item .preset-content').first()
        .evaluate(el => el.classList.contains('expanded'));
    if (!expanded) {
        await expandBtn.click();
        await page.waitForTimeout(400);
    }
    await page.locator('select.proxy-select').first().waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Прокручивает список пресетов так, чтобы конец блока пула (протоколы,
 * подсказка под `http`, строка статуса) был в кадре целиком.
 *
 * Блок пула (329px) выше окна списка пресетов в попапе (233px), поэтому селект
 * прокси и строка статуса физически не помещаются в один кадр — кадр строится
 * по концу блока, где лежат элементы из критерия.
 */
async function scrollPoolBlockIntoView(page: Page): Promise<void> {
    await page.evaluate(() => {
        const block = document.querySelector('.preset-pool-config');
        const status = block?.querySelector('.pool-status');
        let node = block?.parentElement ?? null;
        while (node) {
            const overflowY = getComputedStyle(node).overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
                if (!status) return;
                // строка статуса — последний элемент блока: прижимаем её к нижней
                // кромке окна списка, тогда в кадр попадает максимум блока
                const delta = status.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom;
                node.scrollTop += delta + 6;
                return;
            }
            node = node.parentElement;
        }
        block?.scrollIntoView({ block: 'end' });
    });
    await page.waitForTimeout(300);
}

/** Геометрия блока пула в текущем рендере */
async function measurePoolBlock(page: Page): Promise<OverflowMetrics> {
    return await page.evaluate(() => {
        const block = document.querySelector('.preset-pool-config');
        if (!block) return { right: -1, scrollWidth: -1, clientWidth: -1 };
        const rect = block.getBoundingClientRect();
        return {
            right: Math.round(rect.right),
            scrollWidth: block.scrollWidth,
            clientWidth: block.clientWidth,
        };
    });
}

async function readPresetFromStorage(page: Page, presetId: string) {
    return await page.evaluate((id) => new Promise<{ proxyId: string | null; publicPool: Record<string, unknown> | null }>(
        resolve => chrome.storage.local.get('presets', (data) => {
            const preset = (data.presets || []).find((item: { id: string }) => item.id === id);
            resolve({
                proxyId: preset ? preset.proxyId ?? null : null,
                publicPool: preset ? preset.publicPool ?? null : null,
            });
        })
    ), presetId);
}

test.describe('Manual QA: редактор пресета с публичным пулом', () => {
    let context: BrowserContext;
    let popupUrl: string;
    let presetId: string;

    test.beforeAll(async () => {
        test.setTimeout(180000);
        if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;

        const init = await openPopup(context, popupUrl);
        // sync выключен, чтобы syncFromCloud не перезаписывал подготовленный storage
        await init.evaluate(() => new Promise(resolve => chrome.storage.local.set({ syncEnabled: false }, resolve)));
        // каталог пула — из локального sources/proxys.json, свежий кэш вместо сети
        await init.evaluate((proxies) => new Promise(resolve => chrome.storage.local.set({
            publicProxyCatalog: { fetchedAt: Date.now(), proxies },
        }, resolve)), loadLocalCatalog());
        // дефолтный прокси: в селекте появляется опция «Default (…)»
        await init.evaluate(() => new Promise(resolve => chrome.storage.local.set({
            proxies: [{
                id: 'qa-default-proxy',
                type: 'http',
                host: 'default.example.com',
                port: 8080,
                name: 'Default proxy',
                isDefault: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }],
        }, resolve)));
        presetId = await init.evaluate(() => new Promise<string>(resolve => {
            const preset = {
                id: crypto.randomUUID(),
                name: 'Pool QA',
                domains: ['example.com'],
                enabled: true,
                isDefault: false,
                order: 0,
                proxyId: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            chrome.storage.local.set({ presets: [preset] }, () => resolve(preset.id));
        }));
        await init.close();
    });

    test.afterAll(async () => {
        fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
        await context?.close();
    });

    test('тёмная тема: выбор пула, протоколы, подсказка, фильтры, статус', async () => {
        test.setTimeout(180000);
        const page = await openNarrowPopup(context, popupUrl);
        await page.evaluate(() => new Promise(resolve => chrome.storage.local.set({ theme: 'dark' }, resolve)));
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(600);

        await openPresetEditor(page);

        // Выбор «🌐 Public pool» в селекте прокси пресета
        await page.locator('select.proxy-select').first().selectOption('__public_pool__');
        await page.waitForTimeout(1200);
        const block = page.locator('.preset-pool-config').first();
        await block.waitFor({ state: 'visible', timeout: 10000 });

        report.initialProtocols = await page.$$eval(
            '.preset-pool-config input[data-protocol]',
            nodes => nodes.filter(n => (n as HTMLInputElement).checked)
                .map(n => n.getAttribute('data-protocol') as string)
        );

        // Попытка снять единственный отмеченный протокол
        await block.locator('input[data-protocol="socks5"]').click();
        await page.waitForTimeout(400);
        report.afterUncheckLast = await page.$$eval(
            '.preset-pool-config input[data-protocol]',
            nodes => nodes.filter(n => (n as HTMLInputElement).checked)
                .map(n => n.getAttribute('data-protocol') as string)
        );

        // Отметка http и подпись под ним
        await block.locator('input[data-protocol="http"]').click();
        await page.waitForTimeout(600);
        report.httpHint = (await block.locator('.http-hint').textContent() || '').trim();

        report.countryOptions = await block.locator('select.pool-country option').count();
        report.status = (await block.locator('.pool-status').textContent() || '').trim();

        await scrollPoolBlockIntoView(page);
        report.overflow.dark = await measurePoolBlock(page);
        await page.screenshot({ path: SCREENSHOT_DARK });

        expect.soft(report.initialProtocols).toEqual(['socks5']);
        expect.soft(report.afterUncheckLast).toEqual(['socks5']);
        expect.soft(report.httpHint).toContain('HTTPS');
        expect.soft(report.countryOptions).toBeGreaterThan(10);
        expect.soft(report.status).toMatch(/^[1-9][0-9]* candidates · [0-9]+ alive$/);
        await page.close();
    });

    test('светлая тема: блок пула не переполняет попап', async () => {
        test.setTimeout(180000);
        const page = await openNarrowPopup(context, popupUrl);
        await page.evaluate(() => new Promise(resolve => chrome.storage.local.set({ theme: 'light' }, resolve)));
        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(600);

        await openPresetEditor(page);
        const block = page.locator('.preset-pool-config').first();
        await block.waitFor({ state: 'visible', timeout: 10000 });
        await scrollPoolBlockIntoView(page);

        report.overflow.light = await measurePoolBlock(page);
        await page.screenshot({ path: SCREENSHOT_LIGHT });

        expect.soft(report.overflow.light.right).toBeLessThanOrEqual(POPUP_WIDTH);
        expect.soft(report.overflow.light.scrollWidth).toBeLessThanOrEqual(report.overflow.light.clientWidth);
        await page.close();
    });

    test('страна ID сохраняется после перезагрузки попапа', async () => {
        test.setTimeout(180000);
        const page = await openNarrowPopup(context, popupUrl);
        await openPresetEditor(page);

        const block = page.locator('.preset-pool-config').first();
        await block.waitFor({ state: 'visible', timeout: 10000 });
        await block.locator('select.pool-country').selectOption('ID');
        await page.waitForTimeout(800);

        await page.reload();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(800);
        await openPresetEditor(page);

        report.afterReload = await readPresetFromStorage(page, presetId);

        expect.soft(report.afterReload.publicPool).not.toBeNull();
        expect.soft((report.afterReload.publicPool as { country?: string } | null)?.country).toBe('ID');
        expect.soft(report.afterReload.proxyId).toBeNull();
        await page.close();
    });

    test('выбор Default убирает блок пула и очищает publicPool', async () => {
        test.setTimeout(180000);
        const page = await openNarrowPopup(context, popupUrl);
        await openPresetEditor(page);
        await page.locator('.preset-pool-config').first().waitFor({ state: 'visible', timeout: 10000 });

        await page.locator('select.proxy-select').first().selectOption('');
        await page.waitForTimeout(1200);

        const stored = await readPresetFromStorage(page, presetId);
        const blockVisible = await page.evaluate(() => {
            const block = document.querySelector('.preset-pool-config') as HTMLElement | null;
            if (!block) return false;
            return block.offsetParent !== null || block.getClientRects().length > 0;
        });
        report.afterDefault = { ...stored, blockVisible };

        expect.soft(report.afterDefault.publicPool).toBeNull();
        expect.soft(report.afterDefault.blockVisible).toBe(false);
        await page.close();
    });
});
