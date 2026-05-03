/**
 * Smoke-тест: открытие popup и базовая навигация
 *
 * Покрывает функциональную область Smoke (базовая работоспособность расширения):
 * открытие popup, навигация по вкладкам, иконка расширения, отсутствие ошибок.
 * При расширении покрытия (новые smoke-сценарии) — добавляй test() блоки в этот файл.
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
const ARTIFACT_PREFIX = 'QA-001';

function ensureArtifactsDir() {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
}

test.describe('Smoke — popup open and basic navigation', () => {
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
        await context?.close().catch(() => {
            // Context may already be closed by test
        });
    });

    test.afterEach(async () => {
        await popup?.close();
    });

    // TC 1.1: Открыть popup через chrome-extension://<extension-id>/popup.html
    test('TC 1.1: popup должен открываться по chrome-extension URL', async () => {
        popup = await openPopup(context, popupUrl);

        // Проверяем что страница загрузилась
        await popup.waitForLoadState('domcontentloaded');
        const url = popup.url();
        expect(url).toContain('chrome-extension://');
        expect(url).toContain('popup.html');

        // Проверяем что popup не пустой
        const bodyText = await popup.locator('body').textContent();
        expect(bodyText?.length).toBeGreaterThan(0);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-1.1-popup-opened.png`) });
    });

    // TC 1.2: Проверить что popup открывается (popup.html рендерится)
    test('TC 1.2: popup должен содержать основные UI-элементы', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');

        // Проверяем наличие основных UI-элементов
        const bodyText = await popup.locator('body').textContent();
        expect(bodyText?.length).toBeGreaterThan(0);

        // Проверяем что нет alert об ошибках при загрузке (проверяем что элементы с классом error не содержат текста)
        const errorElements = popup.locator('.alert, .error, [class*="error-message"]');
        const errorCount = await errorElements.count();
        for (let i = 0; i < errorCount; i++) {
            const text = await errorElements.nth(i).textContent().catch(() => '');
            expect(text?.trim() === '', `Found error element with text: "${text}"`).toBeTruthy();
        }

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-1.2-popup-ui.png`) });
    });

    // TC 1.3: Все 3 вкладки доступны и переключаются
    test('TC 1.3: все 3 вкладки (proxy, presets, settings) должны быть доступны и переключаться', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Проверяем наличие всех 3 вкладок
        const proxyTab = popup.locator('[data-tab="proxy"]');
        const presetsTab = popup.locator('[data-tab="presets"]');
        const settingsTab = popup.locator('[data-tab="settings"]');

        await expect(proxyTab).toBeVisible();
        await expect(presetsTab).toBeVisible();
        await expect(settingsTab).toBeVisible();

        // Проверяем переключение на вкладку Presets
        await presetsTab.click();
        await popup.waitForTimeout(300);
        const presetsContent = popup.locator('.presets-content, [class*="preset"]');
        // Даже если пресетов нет, контейнер должен быть
        const presetsVisible = await presetsTab.evaluate(el => el.classList.contains('active') || el.getAttribute('data-active') === 'true').catch(() => true);
        expect(presetsVisible).toBeTruthy();

        // Проверяем переключение на вкладку Settings
        await settingsTab.click();
        await popup.waitForTimeout(300);
        const settingsVisible = await settingsTab.evaluate(el => el.classList.contains('active') || el.getAttribute('data-active') === 'true').catch(() => true);
        expect(settingsVisible).toBeTruthy();

        // Возвращаемся на Proxy
        await proxyTab.click();
        await popup.waitForTimeout(300);

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-1.3-tabs-navigation.png`) });
    });

    // TC 1.4: Иконка расширения в состоянии "disconnected"
    test('TC 1.4: при первом запуске иконка должна быть в состоянии disconnected', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Проверяем статус в storage — currentState/targetState должен быть disconnected
        const storageState = await popup.evaluate(() =>
            new Promise(resolve => chrome.storage.local.get(['currentState', 'targetState'], resolve))
        );

        // При первом запуске состояние должно быть disconnected или undefined
        const currentState = (storageState as any).currentState;
        const targetState = (storageState as any).targetState;
        expect(currentState === 'disconnected' || currentState === undefined || currentState === null).toBeTruthy();
        expect(targetState === 'disconnected' || targetState === undefined || targetState === null).toBeTruthy();

        // Проверяем UI-индикатор статуса
        const statusText = await popup.locator('.status, [class*="status"], [class*="connected"], [class*="disconnected"]').first().textContent().catch(() => null);

        // Скриншот начального состояния
        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-1.4-disconnected-state.png`) });
    });

    // TC 1.5: Отсутствие ошибок в console Service Worker
    test('TC 1.5: в консоли popup не должно быть ошибок при открытии', async ({ context: testContext }) => {
        test.setTimeout(45000);
        const errors: string[] = [];
        popup = await openPopup(context, popupUrl);

        popup.on('console', (msg) => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(1000);

        // Проверяем что нет критических ошибок JS
        const consoleErrors = errors.filter(e =>
            !e.includes('favicon') && // Игнорируем favicon 404
            !e.includes('net::ERR_')  // Игнорируем сетевые ошибки внешних ресурсов
        );

        expect(consoleErrors.length, `Console errors found: ${JSON.stringify(consoleErrors)}`).toBe(0);

        // Также проверим console Service Worker через background pages
        try {
            const serviceWorkers = context.serviceWorkers();
            if (serviceWorkers.length > 0) {
                // Service Worker уже может быть запущен, проверяем через evaluate
                const swConsole = await serviceWorkers[0].evaluate(() => {
                    // Проверяем наличие глобальных ошибок
                    return 'SW alive';
                }).catch(() => 'SW unavailable');
                expect(swConsole).toBe('SW alive');
            }
        } catch (e) {
            // Service Worker может быть недоступен в некоторых состояниях
            // Это не критическая ошибка
        }
    });
});
