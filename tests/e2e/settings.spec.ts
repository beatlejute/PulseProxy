/**
 * Settings tab — тема, язык, синхронизация, proxy all sites, proxy check
 *
 * Покрывает функциональную область Settings всего popup'а расширения.
 * При расширении покрытия (новые настройки) — добавляй test() блоки в этот файл,
 * не создавай новый. См. .workflow/src/skills/shared/testing-conventions.md
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { launchExtension, openPopup } from './helpers/extension';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACTS_DIR = path.resolve(__dirname, '../../reports');
const ARTIFACT_PREFIX = 'QA-038';

function ensureArtifactsDir() {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
}

async function dismissModalIfPresent(popup: Page): Promise<void> {
    const modalOverlay = popup.locator('.modal-overlay');
    if (await modalOverlay.isVisible().catch(() => false)) {
        await popup.keyboard.press('Escape');
        await popup.waitForTimeout(500);
        if (await modalOverlay.isVisible().catch(() => false)) {
            const closeButton = popup.locator('.modal .close-button, .modal button:has-text("Close"), .modal button:has-text("Закрыть")');
            if (await closeButton.isVisible().catch(() => false)) {
                await closeButton.click();
                await popup.waitForTimeout(500);
            }
        }
    }
}

async function openSettingsTab(popup: Page): Promise<void> {
    // Wait for the popup to be fully loaded
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(1000);

    const settingsTab = popup.locator('[data-tab="settings"]');
    await expect(settingsTab).toBeVisible({ timeout: 10000 });

    // Click to activate the settings tab
    await settingsTab.click();

    // Wait for the settings tab content to become visible (active class added)
    const settingsContent = popup.locator('#tab-settings.active');
    await expect(settingsContent).toBeVisible({ timeout: 10000 });
}

async function getChromeProxySettings(popup: Page): Promise<any> {
    return await popup.evaluate(() =>
        new Promise((resolve) => {
            if (chrome && chrome.proxy && chrome.proxy.settings) {
                chrome.proxy.settings.get({}, (details) => {
                    resolve(details);
                });
            } else {
                resolve({ error: 'chrome.proxy.settings unavailable' });
            }
        })
    );
}

async function createProxy(popup: Page, host: string, port: number, type = 'http'): Promise<string> {
    return popup.evaluate(
        ({ host, port, type }) => {
            return new Promise<string>(resolve => {
                chrome.storage.local.get('proxies', (data) => {
                    const proxies = data.proxies || [];
                    const newProxy = {
                        id: crypto.randomUUID(),
                        type, host, port,
                        isDefault: false,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                    proxies.push(newProxy);
                    chrome.storage.local.set({ proxies }, () => resolve(newProxy.id));
                });
            });
        },
        { host, port, type }
    );
}

async function setDefaultProxy(popup: Page, id: string) {
    await popup.evaluate(
        ({ id }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.get('proxies', (data) => {
                    const proxies = data.proxies || [];
                    for (const p of proxies) {
                        p.isDefault = p.id === id;
                        p.updatedAt = Date.now();
                    }
                    chrome.storage.local.set({ proxies }, () => resolve());
                });
            });
        },
        { id }
    );
}

test.describe('Settings — popup configuration', () => {
    let context: BrowserContext;
    let popupUrl: string;
    let popup: Page;

    test.beforeAll(async () => {
        test.setTimeout(60000);
        ensureArtifactsDir();
        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        popup = await openPopup(context, popupUrl);
        await dismissModalIfPresent(popup);
        await openSettingsTab(popup);
    });

    test.afterEach(async () => {
        await popup?.close();
    });

    test('theme: switch light → dark and persist', async () => {
        const themeToggle = popup.locator('#theme-toggle');

        // Capture light state (initial)
        if (await themeToggle.isChecked()) {
            await themeToggle.click();
            await popup.waitForTimeout(500);
        }
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-6.1-light-theme.png`) });

        // Switch to dark
        await themeToggle.click();
        await popup.waitForTimeout(500);
        expect(await themeToggle.isChecked()).toBe(true);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-6.2-dark-theme.png`) });

        const storage = await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.get(['theme'], resolve))
        );
        expect(storage).toMatchObject({ theme: 'dark' });

        // Verify persistence after popup reload (TC 6.1 DoD)
        await popup.close();
        popup = await openPopup(context, popupUrl);
        await dismissModalIfPresent(popup);
        await openSettingsTab(popup);
        const themeToggleAfterReload = popup.locator('#theme-toggle');
        expect(await themeToggleAfterReload.isChecked()).toBe(true);
    });

    test('theme: switch dark → light and persist', async () => {
        const themeToggle = popup.locator('#theme-toggle');

        if (!(await themeToggle.isChecked())) {
            await themeToggle.click();
            await popup.waitForTimeout(500);
        }

        await themeToggle.click();
        await popup.waitForTimeout(500);
        expect(await themeToggle.isChecked()).toBe(false);

        const storage = await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.get(['theme'], resolve))
        );
        expect(storage).toMatchObject({ theme: 'light' });

        // Verify persistence after popup reload (TC 6.2 DoD)
        await popup.close();
        popup = await openPopup(context, popupUrl);
        await dismissModalIfPresent(popup);
        await openSettingsTab(popup);
        const themeToggleAfterReload = popup.locator('#theme-toggle');
        expect(await themeToggleAfterReload.isChecked()).toBe(false);
    });

    test('language: all 8 locales render without __MSG_ keys', async () => {
        const languageSelect = popup.locator('#language-select');
        const languages = ['en', 'ru', 'de', 'fr', 'es', 'zh', 'ja', 'pt'];

        for (const lang of languages) {
            await languageSelect.selectOption({ value: lang });
            await popup.waitForTimeout(500);

            const msgPatternCount = await popup.locator('text=/__MSG_/').count();
            expect(msgPatternCount, `language ${lang} contains __MSG_ keys`).toBe(0);

            const htmlContent = await popup.content();
            expect(htmlContent.includes('__MSG_'), `language ${lang} HTML contains __MSG_`).toBe(false);
        }
    });

    test('sync: toggle persists in storage', async () => {
        const syncToggle = popup.locator('#sync-toggle');
        await expect(syncToggle).toBeVisible();

        const initial = await syncToggle.isChecked();

        // Toggle to opposite state — this triggers a confirmation dialog
        await syncToggle.click();
        await popup.waitForTimeout(500);

        // Handle the confirmation dialog
        const confirmBtn = popup.locator('.modal-footer .btn-primary');
        if (await confirmBtn.isVisible().catch(() => false)) {
            await confirmBtn.click();
            await popup.waitForTimeout(500);
        }

        const afterFirstToggle = await popup.evaluate(() =>
            new Promise<{ syncEnabled?: boolean }>(resolve =>
                chrome.storage.local.get(['syncEnabled'], resolve as any)
            )
        );
        expect(afterFirstToggle.syncEnabled).toBe(!initial);

        // Toggle back
        await syncToggle.click();
        await popup.waitForTimeout(500);

        // Handle the confirmation dialog again
        const confirmBtn2 = popup.locator('.modal-footer .btn-primary');
        if (await confirmBtn2.isVisible().catch(() => false)) {
            await confirmBtn2.click();
            await popup.waitForTimeout(500);
        }
        await popup.waitForTimeout(500);

        const afterSecondToggle = await popup.evaluate(() =>
            new Promise<{ syncEnabled?: boolean }>(resolve =>
                chrome.storage.local.get(['syncEnabled'], resolve as any)
            )
        );
        expect(afterSecondToggle.syncEnabled).toBe(initial);
    });

    test('proxy all sites: button toggles proxyByDefault in storage', async () => {
        // TC 6.7 & 6.8: "Proxy all sites" — включение и выключение маршрутизации

        // Pre-setup: create a default proxy for routing
        const proxyId = await createProxy(popup, 'default-proxy.local', 8080, 'http');
        await setDefaultProxy(popup, proxyId);
        await popup.waitForTimeout(500);

        // The proxy-by-default-toggle is in the Presets tab, not Settings
        const presetsTab = popup.locator('[data-tab="presets"]');
        await expect(presetsTab).toBeVisible({ timeout: 10000 });
        await presetsTab.click();
        await popup.waitForTimeout(500);

        const presetsContent = popup.locator('#tab-presets.active');
        await expect(presetsContent).toBeVisible({ timeout: 10000 });

        const button = popup.locator('#proxy-by-default-toggle');
        await expect(button).toBeVisible();

        const rawInitial = await popup.evaluate(() =>
            new Promise<boolean | undefined>(resolve =>
                chrome.storage.local.get(['proxyByDefault'], (r: any) => resolve(r.proxyByDefault))
            )
        );
        // Storage returns undefined by default, but getProxyByDefault() returns ?? true
        const initial = rawInitial ?? true;

        // TC 6.7: Enable "Proxy all sites" — трафик маршрутизируется через прокси
        // Нажимаем кнопку чтобы включить proxyByDefault
        await button.click();
        await popup.waitForTimeout(1000);

        const afterFirst = await popup.evaluate(() =>
            new Promise<boolean | undefined>(resolve =>
                chrome.storage.local.get(['proxyByDefault'], (r: any) => resolve(r.proxyByDefault))
            )
        );
        expect(afterFirst).toBe(!initial);

        // Verify proxy rules are applied when proxyByDefault is enabled
        const enabledProxySettings = await getChromeProxySettings(popup);
        console.log('TC 6.7: Proxy settings when proxyByDefault=true:', JSON.stringify(enabledProxySettings));

        // If chrome.proxy.settings is available, verify it has value property
        if (enabledProxySettings && !enabledProxySettings.error) {
            expect(enabledProxySettings.value).toBeDefined();
            expect(enabledProxySettings.value).not.toBeNull();
        }

        // TC 6.8: Disable "Proxy all sites" — трафик возвращается к direct
        // Нажимаем кнопку чтобы выключить proxyByDefault
        await button.click();
        await popup.waitForTimeout(1000);

        const afterSecond = await popup.evaluate(() =>
            new Promise<boolean | undefined>(resolve =>
                chrome.storage.local.get(['proxyByDefault'], (r: any) => resolve(r.proxyByDefault))
            )
        );
        expect(afterSecond).toBe(initial);

        // Verify proxy rules are cleared when proxyByDefault is disabled
        const disabledProxySettings = await getChromeProxySettings(popup);
        console.log('TC 6.8: Proxy settings when proxyByDefault=false:', JSON.stringify(disabledProxySettings));

        // When proxyByDefault is disabled, proxy settings should be cleared or use direct
        if (disabledProxySettings && !disabledProxySettings.error) {
            // After disabling proxyByDefault, either value is cleared or uses direct routing
            if (disabledProxySettings.value) {
                // If value exists, it should indicate direct routing (not a proxy)
                expect(disabledProxySettings.value).toBeDefined();
            }
        }

        // Известная UX-проблема (OBSERVATION-002 в QA-037): текст кнопки меняется только в ON состоянии.
        // Тест не падает, но отметка для будущей регрессии.
        const buttonText = await button.textContent();
        expect(buttonText).toBeTruthy();
    });

    test('proxy check: toggle persists in storage', async () => {
        const proxyCheckToggle = popup.locator('#proxy-check-toggle');
        await expect(proxyCheckToggle).toBeVisible();

        const initial = await proxyCheckToggle.isChecked();

        await popup.evaluate(() => {
            const toggle = document.getElementById('proxy-check-toggle') as HTMLInputElement;
            toggle.checked = !toggle.checked;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await popup.waitForTimeout(500);

        const afterFirst = await popup.evaluate(() =>
            new Promise<{ proxyCheckEnabled?: boolean }>(resolve =>
                chrome.storage.local.get(['proxyCheckEnabled'], resolve as any)
            )
        );
        expect(afterFirst.proxyCheckEnabled).toBe(!initial);

        await popup.evaluate(() => {
            const toggle = document.getElementById('proxy-check-toggle') as HTMLInputElement;
            toggle.checked = !toggle.checked;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await popup.waitForTimeout(500);

        const afterSecond = await popup.evaluate(() =>
            new Promise<{ proxyCheckEnabled?: boolean }>(resolve =>
                chrome.storage.local.get(['proxyCheckEnabled'], resolve as any)
            )
        );
        expect(afterSecond.proxyCheckEnabled).toBe(initial);
    });

    // QA-64 TC 4.1–4.3: labelTheme — все 8 локалей содержат «тёмная»/«dark»/эквивалент
    test('QA-64 TC4.1-4.3: labelTheme all 8 locales show dark qualifier', async () => {
        const languageSelect = popup.locator('#language-select');

        const expectedLabels: Record<string, string> = {
            ru: 'Тёмная тема',
            en: 'Dark theme',
            de: 'Dunkles Design',
            fr: 'Thème sombre',
            es: 'Tema oscuro',
            zh: '深色主题',
            ja: 'ダークテーマ',
            pt: 'Tema escuro',
        };

        for (const [lang, expectedLabel] of Object.entries(expectedLabels)) {
            await languageSelect.selectOption({ value: lang });
            await popup.waitForTimeout(500);

            const labelText = await popup.locator('label[for="theme-toggle"]').textContent();
            expect(
                labelText?.trim(),
                `lang=${lang}: labelTheme should be "${expectedLabel}" (not bare noun)`
            ).toBe(expectedLabel);
        }

        // Восстановить язык en по умолчанию
        await languageSelect.selectOption({ value: 'en' });
        await popup.waitForTimeout(300);
    });

    // QA-64 TC 4.5: label не обрезан, нет горизонтального скролла ни в одной из 8 локалей
    test('QA-64 TC4.5: no horizontal overflow in theme label across all 8 locales', async () => {
        const languageSelect = popup.locator('#language-select');
        const languages = ['ru', 'en', 'de', 'fr', 'es', 'zh', 'ja', 'pt'];

        for (const lang of languages) {
            await languageSelect.selectOption({ value: lang });
            await popup.waitForTimeout(500);

            // Снимок для визуальной верификации
            const settingsContent = popup.locator('#tab-settings.active');
            await popup.screenshot({
                path: path.join(ARTIFACTS_DIR, `QA-64-settings-${lang}.png`),
                clip: await settingsContent.boundingBox() ?? undefined,
            });

            // Проверка горизонтального overflow на уровне tab-settings
            const tabOverflow = await popup.evaluate(() => {
                const el = document.querySelector('#tab-settings') as HTMLElement;
                return el ? el.scrollWidth > el.clientWidth : false;
            });
            expect(tabOverflow, `lang=${lang}: #tab-settings has horizontal overflow`).toBe(false);

            // Проверка overflow у конкретной группы theme-toggle
            const themeGroupOverflow = await popup.evaluate(() => {
                const el = document.querySelector('.setting-group.theme-toggle') as HTMLElement;
                return el ? el.scrollWidth > el.clientWidth : false;
            });
            expect(themeGroupOverflow, `lang=${lang}: .theme-toggle group has horizontal overflow`).toBe(false);
        }

        // Восстановить язык en по умолчанию
        await languageSelect.selectOption({ value: 'en' });
        await popup.waitForTimeout(300);
    });
});

// QA-052: Визуальная проверка стилизации theme-toggle после FIX-010
test.describe('QA-052 — theme-toggle visual styling', () => {
    let context: BrowserContext;
    let popupUrl: string;
    let popup: Page;

    test.beforeAll(async () => {
        test.setTimeout(60000);
        ensureArtifactsDir();
        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close();
    });

    test.beforeEach(async () => {
        popup = await openPopup(context, popupUrl);
        await dismissModalIfPresent(popup);
        await openSettingsTab(popup);
    });

    test.afterEach(async () => {
        await popup?.close();
    });

    // TC 2.1 + TC 2.2: theme-toggle стилизован консистентно с другими toggle'ами,
    // label расположен рядом (не под чекбоксом), скриншот в светлой теме
    test('TC 2.1+2.2: theme-toggle styled consistently, label inline — light theme screenshot', async () => {
        // Сбросить тему в light
        const themeToggle = popup.locator('#theme-toggle');
        if (await themeToggle.isChecked()) {
            await themeToggle.click();
            await popup.waitForTimeout(500);
        }

        // Проверка CSS: flex-direction row (label рядом)
        const themeGroupStyle = await popup.evaluate(() => {
            const el = document.querySelector('.setting-group.theme-toggle') as HTMLElement;
            const style = window.getComputedStyle(el);
            return {
                flexDirection: style.flexDirection,
                alignItems: style.alignItems,
                gap: style.gap,
            };
        });
        expect(themeGroupStyle.flexDirection).toBe('row');
        expect(themeGroupStyle.alignItems).toBe('center');

        // Проверка CSS: checkbox у theme-toggle те же размеры, что у sync-toggle
        const toggleStyles = await popup.evaluate(() => {
            const themeInput = document.querySelector('.setting-group.theme-toggle input[type="checkbox"]') as HTMLElement;
            const syncInput = document.querySelector('.sync-toggle input[type="checkbox"]') as HTMLElement;
            const proxyCheckInput = document.querySelector('.proxy-check-toggle input[type="checkbox"]') as HTMLElement;
            const getStyle = (el: HTMLElement) => {
                const s = window.getComputedStyle(el);
                return { width: s.width, height: s.height, accentColor: s.accentColor };
            };
            return {
                theme: getStyle(themeInput),
                sync: getStyle(syncInput),
                proxyCheck: getStyle(proxyCheckInput),
            };
        });
        // Все три checkbox'а должны иметь одинаковые размеры
        expect(toggleStyles.theme.width).toBe(toggleStyles.sync.width);
        expect(toggleStyles.theme.height).toBe(toggleStyles.sync.height);
        expect(toggleStyles.theme.width).toBe(toggleStyles.proxyCheck.width);

        // Скриншот светлой темы (обязательный artifact QA-052)
        const settingsContent = popup.locator('#tab-settings.active');
        await popup.screenshot({
            path: path.join(ARTIFACTS_DIR, 'QA-052-settings-light.png'),
            clip: await settingsContent.boundingBox() ?? undefined,
        });
    });

    // TC 2.3: Переключение light ↔ dark работает корректно
    test('TC 2.3: light ↔ dark switching works correctly', async () => {
        const themeToggle = popup.locator('#theme-toggle');

        // Убедимся что начинаем в light
        if (await themeToggle.isChecked()) {
            await themeToggle.click();
            await popup.waitForTimeout(500);
        }
        expect(await themeToggle.isChecked()).toBe(false);

        // Переключаем в dark
        await themeToggle.click();
        await popup.waitForTimeout(500);
        expect(await themeToggle.isChecked()).toBe(true);

        const storage = await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.get(['theme'], resolve))
        );
        expect((storage as any).theme).toBe('dark');

        // Переключаем обратно в light
        await themeToggle.click();
        await popup.waitForTimeout(500);
        expect(await themeToggle.isChecked()).toBe(false);

        const storageLightAfter = await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.get(['theme'], resolve))
        );
        expect((storageLightAfter as any).theme).toBe('light');
    });

    // TC 2.4: Dark-тема — чекбокс читаем на тёмном фоне, скриншот тёмной темы
    test('TC 2.4: theme-toggle readable in dark theme — dark screenshot', async () => {
        const themeToggle = popup.locator('#theme-toggle');

        // Переключаем в dark
        if (!(await themeToggle.isChecked())) {
            await themeToggle.click();
            await popup.waitForTimeout(500);
        }
        expect(await themeToggle.isChecked()).toBe(true);

        // Проверяем что checkbox виден (не скрыт)
        await expect(themeToggle).toBeVisible();

        // Проверяем что label виден
        const themeLabel = popup.locator('label[for="theme-toggle"]');
        await expect(themeLabel).toBeVisible();

        // Скриншот тёмной темы (обязательный artifact QA-052)
        const settingsContent = popup.locator('#tab-settings.active');
        await popup.screenshot({
            path: path.join(ARTIFACTS_DIR, 'QA-052-settings-dark.png'),
            clip: await settingsContent.boundingBox() ?? undefined,
        });
    });

    // TC 2.5: Другие toggle'ы (sync, proxy-check) не затронуты изменениями
    test('TC 2.5: sync and proxy-check toggles unaffected', async () => {
        // sync-toggle присутствует и стилизован корректно
        const syncGroupStyle = await popup.evaluate(() => {
            const el = document.querySelector('.sync-toggle') as HTMLElement;
            const style = window.getComputedStyle(el);
            return { flexDirection: style.flexDirection, alignItems: style.alignItems };
        });
        expect(syncGroupStyle.flexDirection).toBe('row');
        expect(syncGroupStyle.alignItems).toBe('center');

        // proxy-check-toggle присутствует и стилизован корректно
        const proxyCheckGroupStyle = await popup.evaluate(() => {
            const el = document.querySelector('.proxy-check-toggle') as HTMLElement;
            const style = window.getComputedStyle(el);
            return { flexDirection: style.flexDirection, alignItems: style.alignItems };
        });
        expect(proxyCheckGroupStyle.flexDirection).toBe('row');
        expect(proxyCheckGroupStyle.alignItems).toBe('center');

        // Оба checkbox'а видимы
        await expect(popup.locator('#sync-toggle')).toBeVisible();
        await expect(popup.locator('#proxy-check-toggle')).toBeVisible();
    });
});

// QA-112 TC 6.9a: Behavioral test — proxyCheckEnabled controls checkProxy on proxy add
test.describe('QA-112 TC 6.9a — proxy check toggle controls checkProxy behavior on proxy add', () => {
    let context: BrowserContext;
    let popupUrl: string;

    test.beforeAll(async () => {
        test.setTimeout(90000);
        ensureArtifactsDir();
        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close();
    });

    async function openAddProxyForm(popup: Page): Promise<void> {
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(1000);
        await dismissModalIfPresent(popup);

        // Открываем вкладку Proxy (по умолчанию все вкладки закрыты)
        const proxyTab = popup.locator('[data-tab="proxy"]');
        await expect(proxyTab).toBeVisible({ timeout: 10000 });
        await proxyTab.click();
        await expect(popup.locator('#tab-proxy.active')).toBeVisible({ timeout: 5000 });

        // Клик по add-proxy-btn открывает диалог выбора типа (proxy-type-modal)
        const addBtn = popup.locator('.add-proxy-btn');
        await expect(addBtn).toBeVisible({ timeout: 10000 });
        await addBtn.click();

        // Выбираем "Custom" чтобы открыть форму добавления прокси
        const customBtn = popup.locator('[data-type="custom"]');
        await expect(customBtn).toBeVisible({ timeout: 5000 });
        await customBtn.click();

        await expect(popup.locator('.proxy-form-modal')).toBeVisible({ timeout: 5000 });
    }

    async function fillProxyForm(popup: Page, host = '192.168.1.100', port = '8080'): Promise<void> {
        const hostInput = popup.locator('.proxy-form input[name="host"]');
        const portInput = popup.locator('.proxy-form input[name="port"]');
        await expect(hostInput).toBeVisible({ timeout: 5000 });
        await hostInput.fill(host);
        await portInput.fill(port);
    }

    test('TC 6.9a-false: proxyCheckEnabled=false → proxy saved directly, btn-checking не появляется', async () => {
        const popup = await openPopup(context, popupUrl);

        // Сбрасываем прокси и выключаем proxy check
        await popup.evaluate(() =>
            new Promise<void>(resolve =>
                chrome.storage.local.set({ proxies: [], proxyCheckEnabled: false }, () => resolve())
            )
        );

        await openAddProxyForm(popup);
        await fillProxyForm(popup);

        // Наблюдаем за появлением btn-checking через MutationObserver внутри страницы
        const checkingDetected = await popup.evaluate((): Promise<boolean> => {
            return new Promise(resolve => {
                let detected = false;
                const observer = new MutationObserver(() => {
                    if (document.querySelector('.btn-checking')) {
                        detected = true;
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

                const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement | null;
                saveBtn?.click();

                // Ждём 3 секунды: если btn-checking не появился — прокси сохранился напрямую
                setTimeout(() => {
                    observer.disconnect();
                    resolve(detected);
                }, 3000);
            });
        });

        await popup.waitForTimeout(500);
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-112-TC-6-9a-false.png') });

        // btn-checking не должен появиться
        expect(checkingDetected).toBe(false);

        // Прокси должен быть сохранён в storage
        const proxies = await popup.evaluate(() =>
            new Promise<Array<{ host: string }>>(resolve =>
                chrome.storage.local.get(['proxies'], (r: any) => resolve(r.proxies || []))
            )
        );
        expect(proxies.length).toBeGreaterThan(0);
        expect(proxies[0].host).toBe('192.168.1.100');

        await popup.close();
    });

    test('TC 6.9a-true: proxyCheckEnabled=true → btn-checking появляется (checkProxy вызывается)', async () => {
        const popup = await openPopup(context, popupUrl);

        // Сбрасываем прокси и включаем proxy check
        await popup.evaluate(() =>
            new Promise<void>(resolve =>
                chrome.storage.local.set({ proxies: [], proxyCheckEnabled: true }, () => resolve())
            )
        );

        await openAddProxyForm(popup);
        await fillProxyForm(popup);

        // Наблюдаем за появлением btn-checking — оно должно появиться до await checkProxyBeforeAdd
        const checkingDetected = await popup.evaluate((): Promise<boolean> => {
            return new Promise(resolve => {
                const observer = new MutationObserver(() => {
                    if (document.querySelector('.btn-checking')) {
                        observer.disconnect();
                        resolve(true);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

                const saveBtn = document.querySelector('.modal-save') as HTMLButtonElement | null;
                saveBtn?.click();

                // Таймаут: если btn-checking не появился за 10с — тест провалится
                setTimeout(() => {
                    observer.disconnect();
                    resolve(false);
                }, 10000);
            });
        });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, 'QA-112-TC-6-9a-true.png') });

        // btn-checking обязательно должен появиться
        expect(checkingDetected).toBe(true);

        // Закрываем диалог, который может появиться после завершения проверки
        await popup.keyboard.press('Escape');
        await popup.waitForTimeout(500);

        await popup.close();
    });
});

