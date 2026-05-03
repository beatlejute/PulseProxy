/**
 * Main Button Visual Regression — скриншот-тесты главной кнопки
 *
 * Покрывает визуальную область: внешний вид кнопки в 4 состояниях × 2 темах = 8 скриншотов.
 * Базовые скриншоты фиксируются через --update-snapshots после первого зелёного прогона.
 *
 * Тестовые сценарии:
 * 1. disconnected + dark theme
 * 2. disconnected + light theme
 * 3. connected + dark theme
 * 4. connected + light theme
 * 5. connecting + dark theme
 * 6. connecting + light theme
 * 7. error + dark theme
 * 8. error + light theme
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { launchExtension, openPopup } from './helpers/extension';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACTS_DIR = path.resolve(__dirname, '../../reports');
const ARTIFACT_PREFIX = 'QA-130';

function ensureArtifactsDir() {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
}

/**
 * Устанавливает состояние currentState через Storage API
 */
async function setProxyState(popup: Page, state: 'connected' | 'disconnected' | 'connecting' | 'error') {
    await popup.evaluate(
        ({ state }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.set({ currentState: state }, () => resolve());
            });
        },
        { state }
    );
}

/**
 * Устанавливает тему через Storage API и применяет класс на body
 */
async function setTheme(popup: Page, theme: 'dark' | 'light') {
    await popup.evaluate(
        ({ theme }) => {
            return new Promise<void>(resolve => {
                chrome.storage.local.set({ theme }, () => {
                    // Применяем класс на body сразу для visual отражения
                    if (theme === 'dark') {
                        document.body.classList.add('theme-dark');
                        document.body.classList.remove('theme-light');
                    } else {
                        document.body.classList.add('theme-light');
                        document.body.classList.remove('theme-dark');
                    }
                    resolve();
                });
            });
        },
        { theme }
    );
}

test.describe('Main Button Visual Regression — 4 состояния × 2 темы', () => {
    let context: BrowserContext;
    let popupUrl: string;
    let popup: Page;

    test.beforeAll(async () => {
        test.setTimeout(120000);
        ensureArtifactsDir();
        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close().catch(() => {});
    });

    test.afterEach(async () => {
        await popup?.close().catch(() => {});
    });

    // TC 130.1: disconnected + dark theme
    test('TC 130.1: disconnected + dark theme', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние и тему
        await setProxyState(popup, 'disconnected');
        await setTheme(popup, 'dark');
        await popup.waitForTimeout(500);

        // Делаем скриншот главной кнопки
        const button = popup.locator('#main-button');
        await expect(button).toHaveScreenshot('130.1-disconnected-dark.png', {
            maxDiffPixelRatio: 0.01,
        });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-130.1-disconnected-dark-full.png`) });
    });

    // TC 130.2: disconnected + light theme
    test('TC 130.2: disconnected + light theme', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние и тему
        await setProxyState(popup, 'disconnected');
        await setTheme(popup, 'light');
        await popup.waitForTimeout(500);

        // Делаем скриншот главной кнопки
        const button = popup.locator('#main-button');
        await expect(button).toHaveScreenshot('130.2-disconnected-light.png', {
            maxDiffPixelRatio: 0.01,
        });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-130.2-disconnected-light-full.png`) });
    });

    // TC 130.3: connected + dark theme
    test('TC 130.3: connected + dark theme', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние и тему
        await setProxyState(popup, 'connected');
        await setTheme(popup, 'dark');
        await popup.waitForTimeout(500);

        // Обновляем страницу чтобы состояние применилось
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Делаем скриншот главной кнопки
        const button = popup.locator('#main-button');
        await expect(button).toHaveScreenshot('130.3-connected-dark.png', {
            maxDiffPixelRatio: 0.01,
        });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-130.3-connected-dark-full.png`) });
    });

    // TC 130.4: connected + light theme
    test('TC 130.4: connected + light theme', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние и тему
        await setProxyState(popup, 'connected');
        await setTheme(popup, 'light');
        await popup.waitForTimeout(500);

        // Обновляем страницу чтобы состояние применилось
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Делаем скриншот главной кнопки
        const button = popup.locator('#main-button');
        await expect(button).toHaveScreenshot('130.4-connected-light.png', {
            maxDiffPixelRatio: 0.01,
        });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-130.4-connected-light-full.png`) });
    });

    // TC 130.5: connecting + dark theme
    test('TC 130.5: connecting + dark theme', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние и тему
        await setProxyState(popup, 'connecting');
        await setTheme(popup, 'dark');
        await popup.waitForTimeout(500);

        // Обновляем страницу чтобы состояние применилось
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Делаем скриншот главной кнопки
        const button = popup.locator('#main-button');
        await expect(button).toHaveScreenshot('130.5-connecting-dark.png', {
            maxDiffPixelRatio: 0.01,
        });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-130.5-connecting-dark-full.png`) });
    });

    // TC 130.6: connecting + light theme
    test('TC 130.6: connecting + light theme', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние и тему
        await setProxyState(popup, 'connecting');
        await setTheme(popup, 'light');
        await popup.waitForTimeout(500);

        // Обновляем страницу чтобы состояние применилось
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Делаем скриншот главной кнопки
        const button = popup.locator('#main-button');
        await expect(button).toHaveScreenshot('130.6-connecting-light.png', {
            maxDiffPixelRatio: 0.01,
        });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-130.6-connecting-light-full.png`) });
    });

    // TC 130.7: error + dark theme
    test('TC 130.7: error + dark theme', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние и тему
        await setProxyState(popup, 'error');
        await setTheme(popup, 'dark');
        await popup.waitForTimeout(500);

        // Обновляем страницу чтобы состояние применилось
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Делаем скриншот главной кнопки
        const button = popup.locator('#main-button');
        await expect(button).toHaveScreenshot('130.7-error-dark.png', {
            maxDiffPixelRatio: 0.01,
        });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-130.7-error-dark-full.png`) });
    });

    // TC 130.8: error + light theme
    test('TC 130.8: error + light theme', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние и тему
        await setProxyState(popup, 'error');
        await setTheme(popup, 'light');
        await popup.waitForTimeout(500);

        // Обновляем страницу чтобы состояние применилось
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Делаем скриншот главной кнопки
        const button = popup.locator('#main-button');
        await expect(button).toHaveScreenshot('130.8-error-light.png', {
            maxDiffPixelRatio: 0.01,
        });

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-130.8-error-light-full.png`) });
    });
});
