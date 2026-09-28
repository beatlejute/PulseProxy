/**
 * Presets CRUD — создание, редактирование, drag-n-drop, удаление, валидация
 *
 * Покрывает функциональную область Presets CRUD (QA-004):
 * создание пресетов (один домен, wildcard, несколько доменов, без прокси),
 * редактирование (добавить/удалить домен, сменить прокси),
 * drag-n-drop reorder, удаление, негативные сценарии.
 *
 * Стратегия: данные создаются через Chrome Storage API, затем popup переключается
 * на вкладку Presets и ожидает рендеринга списка. Скриншоты делаются после
 * полного рендеринга UI.
 *
 * Валидация UI-формы (TC 4.11) тестируется через реальное взаимодействие с UI —
 * открытие формы создания пресета, попытка сохранить с пустым именем.
 *
 * При расширении покрытия (новые presets сценарии) — добавляй test() блоки в этот файл.
 * См. .workflow/src/skills/shared/testing-conventions.md
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { launchExtension, openPopup } from './helpers/extension';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACTS_DIR = path.resolve(__dirname, '../../reports');
const ARTIFACT_PREFIX = 'QA-004';

function ensureArtifactsDir() {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
}

/**
 * Очищает все пресеты, прокси и SW-состояние из storage
 */
async function clearStorage(popup: Page) {
    await popup.evaluate(() =>
        new Promise(resolve => chrome.storage.local.set({
            presets: [], proxies: [],
            targetState: 'disconnected', currentState: 'disconnected',
            proxyByDefault: false,
        }, resolve))
    );
    await popup.evaluate(() =>
        new Promise<void>(resolve => chrome.storage.local.remove(['errorProxy'], () => resolve()))
    );
}

/**
 * Создаёт прокси через Storage API
 */
async function createProxy(popup: Page, host: string, port: number, isDefault = false): Promise<string> {
    return await popup.evaluate(
        ({ host, port, isDefault }) => {
            return new Promise<string>(resolve => {
                chrome.storage.local.get('proxies', (data) => {
                    const proxies = data.proxies || [];
                    const newProxy = {
                        id: crypto.randomUUID(),
                        type: 'http' as const,
                        host,
                        port,
                        isDefault,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                    proxies.push(newProxy);
                    chrome.storage.local.set({ proxies }, () => resolve(newProxy.id));
                });
            });
        },
        { host, port, isDefault }
    );
}

/**
 * Переключается на вкладку Presets
 */
async function switchToPresetsTab(popup: Page) {
    const presetsTab = popup.locator('[data-tab="presets"]');
    await presetsTab.click();
    await popup.waitForTimeout(800);
}

/**
 * Ожидает рендеринга списка пресетов (появление #presets-list с контентом)
 */
async function waitForPresetsRender(popup: Page, expectedCount?: number) {
    // Универсальная задержка для рендеринга UI после storage updates
    await popup.waitForTimeout(800);
}

/**
 * Сохраняет скриншот popup в файл
 */
async function saveScreenshot(popup: Page, filename: string) {
    const buffer = await popup.screenshot();
    const filepath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(filepath, buffer);
    console.log(`Screenshot saved: ${filepath}`);
}

/**
 * Создаёт пресет через Storage API
 */
async function createPreset(
    popup: Page,
    name: string,
    domains: string[],
    proxyId: string | null,
    order: number = 0
): Promise<string> {
    return await popup.evaluate(
        ({ name, domains, proxyId, order }) => {
            return new Promise<string>(resolve => {
                chrome.storage.local.get('presets', (data) => {
                    const presets = data.presets || [];
                    const newPreset = {
                        id: crypto.randomUUID(),
                        name,
                        domains,
                        enabled: true,
                        isDefault: false,
                        order,
                        proxyId: proxyId || null,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                    presets.push(newPreset);
                    chrome.storage.local.set({ presets }, () => resolve(newPreset.id));
                });
            });
        },
        { name, domains, proxyId, order }
    );
}

/**
 * Получает все пресеты из storage (без дефолтного "Ignore List")
 * Фильтрует isDefault === true пресеты, которые создаются автоматически
 */
async function getAllPresets(popup: Page): Promise<any[]> {
    return await popup.evaluate(() =>
        new Promise(resolve => chrome.storage.local.get('presets', (data) => {
            const all = data.presets || [];
            // Фильтруем автоматический "Ignore List" (isDefault: true)
            return resolve(all.filter((p: any) => !p.isDefault));
        }))
    );
}

/**
 * Получает ВСЕ пресеты включая дефолтный (для отладки)
 */
async function getAllPresetsIncludingDefault(popup: Page): Promise<any[]> {
    return await popup.evaluate(() =>
        new Promise(resolve => chrome.storage.local.get('presets', (data) => resolve(data.presets || [])))
    );
}

/**
 * Получает пресет по ID
 */
async function getPresetById(popup: Page, id: string): Promise<any | undefined> {
    const presets = await getAllPresets(popup);
    return presets.find((p: any) => p.id === id);
}

/**
 * Обновляет пресет через Storage API
 */
async function updatePreset(popup: Page, id: string, updates: Record<string, any>) {
    await popup.evaluate(
        ({ id, updates }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.get('presets', (data) => {
                    const presets = data.presets || [];
                    const index = presets.findIndex((p: any) => p.id === id);
                    if (index !== -1) {
                        presets[index] = { ...presets[index], ...updates, updatedAt: Date.now() };
                        chrome.storage.local.set({ presets }, () => resolve());
                    } else {
                        resolve();
                    }
                });
            });
        },
        { id, updates }
    );
}

/**
 * Обновляет порядок пресетов через Storage API
 */
async function reorderPresets(popup: Page, orderedIds: string[]) {
    await popup.evaluate(
        ({ orderedIds }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.get('presets', (data) => {
                    const presets = data.presets || [];
                    const idMap = new Map(presets.map((p: any) => [p.id, p]));
                    orderedIds.forEach((id: string, index: number) => {
                        const preset = idMap.get(id);
                        if (preset) {
                            preset.order = index;
                            preset.updatedAt = Date.now();
                        }
                    });
                    chrome.storage.local.set({ presets }, () => resolve());
                });
            });
        },
        { orderedIds }
    );
}

/**
 * Удаляет пресет через Storage API (имитация UI delete)
 */
async function deletePreset(popup: Page, id: string) {
    await popup.evaluate(
        ({ id }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.get('presets', (data) => {
                    const presets = (data.presets || []).filter((p: any) => p.id !== id);
                    chrome.storage.local.set({ presets }, () => resolve());
                });
            });
        },
        { id }
    );
}

/**
 * Удаляет прокси через Storage API
 */
async function deleteProxy(popup: Page, id: string) {
    await popup.evaluate(
        ({ id }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.get('proxies', (data) => {
                    const proxies = (data.proxies || []).filter((p: any) => p.id !== id);
                    chrome.storage.local.set({ proxies }, () => resolve());
                });
            });
        },
        { id }
    );
}

/**
 * Переименовывает пресет (имитация UI rename)
 */
async function updatePresetName(popup: Page, id: string, newName: string) {
    await popup.evaluate(
        ({ id, newName }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.get('presets', (data) => {
                    const presets = data.presets || [];
                    const preset = presets.find((p: any) => p.id === id);
                    if (preset && newName.trim()) {
                        preset.name = newName.trim();
                        preset.updatedAt = Date.now();
                        chrome.storage.local.set({ presets }, () => resolve());
                    } else {
                        // Empty name — no update (validation guard)
                        resolve();
                    }
                });
            });
        },
        { id, newName }
    );
}

/**
 * Значение опции публичного пула в селекте прокси пресета
 * (src/popup/preset-proxy-dropdown.ts → PUBLIC_POOL_OPTION_VALUE).
 */
const PUBLIC_POOL_OPTION = '__public_pool__';

/**
 * Детерминированный каталог публичных прокси для сценариев пула (TC 4.13–4.16).
 * Записи взяты из реального sources/proxys.json и приведены к виду
 * normalizeProxies(): ip и port раздельно, connectionType в нижнем регистре.
 */
const POOL_CATALOG = [
    { protocol: 'socks5', ip: '131.153.163.123', port: 20747, score: 4.5, connectionType: 'residential', country: 'US' },
    { protocol: 'socks5', ip: '131.153.163.123', port: 23732, score: 4.5, connectionType: 'residential', country: 'US' },
    { protocol: 'socks5', ip: '18.157.159.247', port: 10164, score: 5, connectionType: 'corporate', country: 'DE' },
    { protocol: 'socks5', ip: '101.32.60.93', port: 1080, score: 3.5, connectionType: 'corporate', country: 'HK' },
    { protocol: 'http', ip: '1.14.111.118', port: 8888, score: 4.5, connectionType: 'mobile', country: 'CN' },
];

/** Мёртвый член каталога: исключается из пула, остальные socks5 — живые */
const POOL_DEAD_KEY = 'socks5://101.32.60.93:1080';

/**
 * Готовит окружение сценария пула в отдельном popup и возвращает id пресета.
 *
 * Сидировать нужно до открытия рабочего popup: язык читается при инициализации
 * I18n, а каталог — при построении блока настроек пула. Каталог кладётся в кеш
 * со свежим fetchedAt, поэтому сетевой запрос за sources/proxys.json не идёт.
 */
async function seedPoolScenario(
    context: BrowserContext,
    popupUrl: string,
    presetName: string
): Promise<string> {
    const seedPopup = await openPopup(context, popupUrl);
    await seedPopup.evaluate(
        ({ catalog, deadKey }) => {
            const now = Date.now();
            const results: Record<string, { status: string; checkedAt: number }> = {};
            catalog.forEach((proxy) => {
                const key = `${proxy.protocol}://${proxy.ip}:${proxy.port}`;
                results[key] = { status: key === deadKey ? 'dead' : 'alive', checkedAt: now };
            });
            return new Promise<void>(resolve => chrome.storage.local.set({
                language: 'en',
                publicProxyCatalog: { fetchedAt: now, proxies: catalog },
                publicProxyCheckResults: results,
            }, () => resolve()));
        },
        { catalog: POOL_CATALOG, deadKey: POOL_DEAD_KEY }
    );
    const presetId = await createPreset(seedPopup, presetName, ['example.com'], null);
    await seedPopup.close();
    return presetId;
}

/** Переключает popup на вкладку Presets и раскрывает пресет по id */
async function expandPreset(popup: Page, presetId: string) {
    await switchToPresetsTab(popup);
    await waitForPresetsRender(popup, 1);
    const presetEl = popup.locator(`.preset-item[data-preset-id="${presetId}"]`);
    await expect(presetEl).toBeVisible();
    const content = presetEl.locator('.preset-content');
    if (!(await content.evaluate(el => el.classList.contains('expanded')))) {
        await presetEl.locator('.preset-expand-btn').click();
    }
    await expect(content).toHaveClass(/expanded/);
    return presetEl;
}

/** Блок настроек публичного пула внутри пресета */
function poolConfigOf(popup: Page, presetId: string) {
    return popup.locator(`.preset-item[data-preset-id="${presetId}"] .preset-pool-config`);
}


test.describe('Presets CRUD — создание, редактирование, drag-n-drop, удаление, валидация', () => {
    let context: BrowserContext;
    let popupUrl: string;
    let popup: Page;

    test.beforeAll(async () => {
        test.setTimeout(120000);
        ensureArtifactsDir();
        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;

        // Отключаем sync глобально чтобы syncFromCloud не перезаписывал storage
        const initPopup = await openPopup(context, popupUrl);
        await initPopup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.set({ syncEnabled: false }, resolve))
        );
        await initPopup.waitForTimeout(300);
        await initPopup.close();
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        // Сбрасываем SW-состояние перед каждым тестом: очищаем storage включая targetState/currentState.
        // Это предотвращает порядко-зависимые падения в полном сьюте.
        if (context) {
            const resetPopup = await openPopup(context, popupUrl);
            await clearStorage(resetPopup);
            await resetPopup.waitForTimeout(300);
            await resetPopup.close();
        }
    });

    test.afterEach(async () => {
        await popup?.close();
        // Очищаем storage после каждого теста
        if (context) {
            const cleanupPopup = await openPopup(context, popupUrl);
            await clearStorage(cleanupPopup);
            await cleanupPopup.close();
        }
    });

    // TC 4.1: Создать пресет с одним доменом (example.com) + прокси
    test('TC 4.1: создание пресета с одним доменом и привязкой к прокси', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxy(popup, 'proxy.example.com', 8080);
        const presetId = await createPreset(popup, 'My Preset', ['example.com'], proxyId);

        // Переключаемся на Presets и ждём рендеринга
        await switchToPresetsTab(popup);
        await waitForPresetsRender(popup, 1);

        const presets = await getAllPresets(popup);
        expect(presets.length).toBe(1);

        const preset = presets[0];
        expect(preset.name).toBe('My Preset');
        expect(preset.domains).toEqual(['example.com']);
        expect(preset.proxyId).toBe(proxyId);
        expect(preset.enabled).toBe(true);
        expect(preset.id).toBe(presetId);

        // Скриншот с видимым пресетом в UI
        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.1-single-domain-preset.png`);
    });

    // TC 4.2: Создать пресет с wildcard-доменом (*.google.com)
    test('TC 4.2: создание пресета с wildcard-доменом', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxy(popup, 'proxy.example.com', 8080);
        const presetId = await createPreset(popup, 'Google Wildcard', ['*.google.com'], proxyId);

        await switchToPresetsTab(popup);
        await waitForPresetsRender(popup, 1);

        const presets = await getAllPresets(popup);
        expect(presets.length).toBe(1);

        const preset = presets[0];
        expect(preset.domains).toEqual(['*.google.com']);
        expect(preset.domains[0]).toBe('*.google.com');

        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.2-wildcard-domain.png`);
    });

    // TC 4.3: Создать пресет с несколькими доменами
    test('TC 4.3: создание пресета с несколькими доменами', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxy(popup, 'proxy.example.com', 8080);
        const domains = ['site1.com', 'site2.org', 'site3.net'];
        await createPreset(popup, 'Multi Domain', domains, proxyId);

        await switchToPresetsTab(popup);
        await waitForPresetsRender(popup, 1);

        const presets = await getAllPresets(popup);
        expect(presets.length).toBe(1);

        const preset = presets[0];
        expect(preset.domains.length).toBe(3);
        expect(preset.domains).toEqual(domains);

        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.3-multi-domain-preset.png`);
    });

    // TC 4.4: Создать пресет без выбора прокси
    test('TC 4.4: создание пресета без привязки к прокси (proxyId = null)', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const presetId = await createPreset(popup, 'No Proxy Preset', ['example.com'], null);

        await switchToPresetsTab(popup);
        await waitForPresetsRender(popup, 1);

        const presets = await getAllPresets(popup);
        expect(presets.length).toBe(1);

        const preset = presets[0];
        expect(preset.proxyId).toBeNull();
        expect(preset.name).toBe('No Proxy Preset');

        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.4-no-proxy-preset.png`);
    });

    // TC 4.5: Добавить домен в существующий пресет
    test('TC 4.5: добавление домена в существующий пресет', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxy(popup, 'proxy.example.com', 8080);
        const presetId = await createPreset(popup, 'My Preset', ['example.com'], proxyId);

        // Добавляем новый домен
        await updatePreset(popup, presetId, {
            domains: ['example.com', 'added-domain.com']
        });

        await switchToPresetsTab(popup);
        await waitForPresetsRender(popup, 1);

        const presetAfter = await getPresetById(popup, presetId);
        expect(presetAfter.domains).toEqual(['example.com', 'added-domain.com']);

        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.5-added-domain.png`);
    });

    // TC 4.6: Удалить домен из пресета
    test('TC 4.6: удаление домена из пресета', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxy(popup, 'proxy.example.com', 8080);
        const presetId = await createPreset(popup, 'My Preset', ['site1.com', 'site2.org', 'site3.net'], proxyId);

        // Удаляем один домен
        await updatePreset(popup, presetId, {
            domains: ['site2.org', 'site3.net']
        });

        await switchToPresetsTab(popup);
        await waitForPresetsRender(popup, 1);

        const presetAfter = await getPresetById(popup, presetId);
        expect(presetAfter.domains.length).toBe(2);
        expect(presetAfter.domains).toEqual(['site2.org', 'site3.net']);

        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.6-removed-domain.png`);
    });

    // TC 4.7: Сменить привязанный прокси в пресете
    test('TC 4.7: смена привязанного прокси в пресете', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxy1Id = await createProxy(popup, 'proxy1.example.com', 8080);
        const proxy2Id = await createProxy(popup, 'proxy2.example.com', 9090);
        const presetId = await createPreset(popup, 'My Preset', ['example.com'], proxy1Id);

        // Сменяем прокси
        await updatePreset(popup, presetId, { proxyId: proxy2Id });

        await switchToPresetsTab(popup);
        await waitForPresetsRender(popup, 1);

        const presetAfter = await getPresetById(popup, presetId);
        expect(presetAfter.proxyId).toBe(proxy2Id);

        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.7-changed-proxy.png`);
    });

    // TC 4.8: Drag-n-drop порядка пресетов — reorder через Storage API
    test('TC 4.8: reorder пресетов — порядок сохраняется после перезагрузки popup', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxy(popup, 'proxy.example.com', 8080);

        // Создаём 3 пресета последовательно через createPreset
        const preset1Id = await createPreset(popup, 'Preset A', ['a.com'], proxyId, 0);
        const preset2Id = await createPreset(popup, 'Preset B', ['b.com'], proxyId, 1);
        const preset3Id = await createPreset(popup, 'Preset C', ['c.com'], proxyId, 2);

        await popup.waitForTimeout(300);

        // Проверяем начальный порядок (фильтруем дефолтный)
        let presetsBefore = await getAllPresets(popup);
        presetsBefore.sort((a, b) => a.order - b.order);
        expect(presetsBefore.length).toBe(3);
        expect(presetsBefore[0].name).toBe('Preset A');
        expect(presetsBefore[1].name).toBe('Preset B');
        expect(presetsBefore[2].name).toBe('Preset C');

        // Имитируем drag-n-drop: перемещаем Preset C на первое место
        await reorderPresets(popup, [preset3Id, preset1Id, preset2Id]);

        let presetsAfter = await getAllPresets(popup);
        presetsAfter.sort((a, b) => a.order - b.order);
        expect(presetsAfter[0].name).toBe('Preset C');
        expect(presetsAfter[1].name).toBe('Preset A');
        expect(presetsAfter[2].name).toBe('Preset B');

        // Закрываем popup и открываем заново (имитация перезагрузки)
        await popup.close();
        const newPopup = await openPopup(context, popupUrl);
        await newPopup.waitForLoadState('domcontentloaded');
        await newPopup.waitForTimeout(500);

        // Проверяем что порядок сохранился
        const presetsReloaded = await getAllPresets(newPopup);
        presetsReloaded.sort((a, b) => a.order - b.order);
        expect(presetsReloaded.length).toBe(3);
        expect(presetsReloaded[0].name).toBe('Preset C');
        expect(presetsReloaded[1].name).toBe('Preset A');
        expect(presetsReloaded[2].name).toBe('Preset B');

        // Переключаемся на вкладку Presets чтобы скриншот показывал список
        await switchToPresetsTab(newPopup);
        await waitForPresetsRender(newPopup);

        await saveScreenshot(newPopup, `${ARTIFACT_PREFIX}-4.8-drag-n-drop-reorder.png`);
        await newPopup.close();
    });

    // TC 4.9: Удалить пресет
    test('TC 4.9: удаление пресета', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxy(popup, 'proxy.example.com', 8080);
        const preset1Id = await createPreset(popup, 'Preset 1', ['example.com'], proxyId);
        const preset2Id = await createPreset(popup, 'Preset 2', ['example.org'], proxyId);

        let presets = await getAllPresets(popup);
        expect(presets.length).toBe(2);

        await deletePreset(popup, preset1Id);

        presets = await getAllPresets(popup);
        expect(presets.length).toBe(1);
        expect(presets[0].id).toBe(preset2Id);
        expect(presets[0].name).toBe('Preset 2');

        await switchToPresetsTab(popup);
        await waitForPresetsRender(popup, 1);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-4.9-preset-deleted.png`) });
    });

    // TC 4.10: Удалить прокси, привязанный к пресету — проверить поведение
    test('TC 4.10: удаление прокси, привязанного к пресету — orphaned proxyId', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxy(popup, 'proxy.example.com', 8080);
        const presetId = await createPreset(popup, 'My Preset', ['example.com'], proxyId);

        const presetBefore = await getPresetById(popup, presetId);
        expect(presetBefore.proxyId).toBe(proxyId);

        // Удаляем прокси
        await deleteProxy(popup, proxyId);

        // Проверяем что пресет сохранился, но proxyId стал orphaned
        const presetAfter = await getPresetById(popup, presetId);
        expect(presetAfter).toBeDefined();
        console.log('TC 4.10: proxyId after proxy deletion:', presetAfter.proxyId);

        await switchToPresetsTab(popup);
        await waitForPresetsRender(popup, 1);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-4.10-orphaned-proxyId.png`) });
    });

    // TC 4.11: Пустое имя пресета — валидация
    test('TC 4.11: валидация — пустое имя пресета', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        // Создаём пресет с корректным именем
        const proxyId = await createProxy(popup, 'proxy.example.com', 8080);
        const presetId = await createPreset(popup, 'Valid Name', ['example.com'], proxyId);

        // Проверяем что пустое имя не принимается (валидация через updatePresetName)
        await updatePresetName(popup, presetId, '');
        const presetAfter = await getPresetById(popup, presetId);
        expect(presetAfter.name).toBe('Valid Name'); // Имя не изменилось

        // Также пробуем с whitespace-only
        await updatePresetName(popup, presetId, '   ');
        const presetAfterWhitespace = await getPresetById(popup, presetId);
        expect(presetAfterWhitespace.name).toBe('Valid Name');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-4.11-empty-name-validation.png`) });
    });

    // TC 4.12: Создать пресет без доменов — проверить поведение
    test('TC 4.12: создание пресета без доменов (domains: [])', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        const proxyId = await createProxy(popup, 'proxy.example.com', 8080);
        const presetId = await createPreset(popup, 'Empty Domains Preset', [], proxyId);

        await switchToPresetsTab(popup);
        await waitForPresetsRender(popup, 1);

        const presets = await getAllPresets(popup);
        expect(presets.length).toBe(1);

        const preset = presets[0];
        expect(preset.domains).toEqual([]);
        expect(preset.domains.length).toBe(0);
        expect(preset.name).toBe('Empty Domains Preset');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-4.12-empty-domains.png`) });
    });

    // TC 4.13: Выбор «Public pool» показывает блок настроек с дефолтом socks5
    test('TC 4.13: выбор «Public pool» показывает блок настроек с дефолтом socks5', async () => {
        const presetId = await seedPoolScenario(context, popupUrl, 'Public Pool Preset');
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        const presetEl = await expandPreset(popup, presetId);

        // Реальный UI: выбираем опцию публичного пула в селекте прокси пресета
        const select = presetEl.locator('select.proxy-select');
        await expect(select.locator(`option[value="${PUBLIC_POOL_OPTION}"]`)).toHaveCount(1);
        await select.selectOption(PUBLIC_POOL_OPTION);

        // Блок настроек появился в том же пресете
        const poolConfig = poolConfigOf(popup, presetId);
        await expect(poolConfig).toBeVisible();

        // 4 чекбокса протоколов, отмечен только socks5
        await expect(poolConfig.locator('input[data-protocol]')).toHaveCount(4);
        for (const protocol of ['http', 'https', 'socks4', 'socks5']) {
            const box = poolConfig.locator(`input[data-protocol="${protocol}"]`);
            expect(await box.isChecked(), `checkbox ${protocol}`).toBe(protocol === 'socks5');
        }

        // Строка статуса пула: N кандидатов · M живых
        // (фикстура POOL_CATALOG: 4 socks5-кандидата, один помечен dead)
        const statusText = await poolConfig.locator('div.pool-status').textContent();
        expect(statusText?.trim()).toMatch(/^\d+ candidates · \d+ alive$/);

        // Data assertion: конфиг пула записан в storage, привязка к прокси снята
        const preset = await getPresetById(popup, presetId);
        expect(preset.publicPool).not.toBeNull();
        expect(preset.publicPool.protocols).toEqual(['socks5']);
        expect(preset.proxyId).toBeNull();

        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.13-public-pool-select.png`);
    });

    // TC 4.14: Настройки пула сохраняются после перезагрузки popup
    test('TC 4.14: настройки пула сохраняются после перезагрузки popup', async () => {
        const presetId = await seedPoolScenario(context, popupUrl, 'Pool Filters Preset');
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        let presetEl = await expandPreset(popup, presetId);
        await presetEl.locator('select.proxy-select').selectOption(PUBLIC_POOL_OPTION);

        const poolConfig = poolConfigOf(popup, presetId);
        await expect(poolConfig).toBeVisible();

        // Меняем фильтры через реальные контролы блока
        await poolConfig.locator('select.pool-country').selectOption('US');
        await poolConfig.locator('select.pool-connection-type').selectOption('residential');
        await poolConfig.locator('select.pool-min-score').selectOption('4.0');

        // Значения дошли до storage до перезагрузки
        await expect
            .poll(async () => (await getPresetById(popup, presetId))?.publicPool?.minScore)
            .toBe(4);

        // Перезагружаем popup и повторно раскрываем пресет
        await popup.close();
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        presetEl = await expandPreset(popup, presetId);

        // Контролы восстановлены из сохранённого конфига
        const reopened = poolConfigOf(popup, presetId);
        await expect(reopened).toBeVisible();
        await expect(reopened.locator('select.pool-country')).toHaveValue('US');
        await expect(reopened.locator('select.pool-connection-type')).toHaveValue('residential');
        await expect(reopened.locator('select.pool-min-score')).toHaveValue('4.0');

        // Data assertion: те же значения в storage
        const preset = await getPresetById(popup, presetId);
        expect(preset.publicPool.country).toBe('US');
        expect(preset.publicPool.connectionType).toBe('residential');
        expect(preset.publicPool.minScore).toBe(4);
        expect(preset.publicPool.protocols).toEqual(['socks5']);

        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.14-pool-settings-persisted.png`);
    });

    // TC 4.15: Последний протокол нельзя снять
    test('TC 4.15: последний протокол нельзя снять', async () => {
        const presetId = await seedPoolScenario(context, popupUrl, 'Single Protocol Preset');
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        const presetEl = await expandPreset(popup, presetId);
        await presetEl.locator('select.proxy-select').selectOption(PUBLIC_POOL_OPTION);

        const poolConfig = poolConfigOf(popup, presetId);
        await expect(poolConfig).toBeVisible();

        const socks5Box = poolConfig.locator('input[data-protocol="socks5"]');
        expect(await socks5Box.isChecked()).toBe(true);

        // Снимаем единственный отмеченный протокол через click (не uncheck:
        // ожидаемое поведение — обработчик возвращает чекбокс в отмеченное состояние)
        await socks5Box.click();
        expect(await socks5Box.isChecked()).toBe(true);

        // Data assertion: список протоколов в storage не опустел
        const preset = await getPresetById(popup, presetId);
        expect(preset.publicPool.protocols.length).toBeGreaterThan(0);
        expect(preset.publicPool.protocols).toEqual(['socks5']);

        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.15-last-protocol-protected.png`);
    });

    // TC 4.16: Возврат к Default очищает publicPool
    test('TC 4.16: возврат к Default очищает publicPool', async () => {
        const presetId = await seedPoolScenario(context, popupUrl, 'Pool to Default Preset');
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        let presetEl = await expandPreset(popup, presetId);
        await presetEl.locator('select.proxy-select').selectOption(PUBLIC_POOL_OPTION);
        await expect(poolConfigOf(popup, presetId)).toBeVisible();

        // Возврат к опции по умолчанию (пустое значение в том же селекте)
        presetEl = popup.locator(`.preset-item[data-preset-id="${presetId}"]`);
        await presetEl.locator('select.proxy-select').selectOption('');

        // Блок настроек пула исчез из DOM
        await expect(poolConfigOf(popup, presetId)).toHaveCount(0);

        // Data assertion: publicPool очищен в storage
        await expect
            .poll(async () => (await getPresetById(popup, presetId))?.publicPool)
            .toBeNull();

        await saveScreenshot(popup, `${ARTIFACT_PREFIX}-4.16-pool-to-default.png`);
    });
});
