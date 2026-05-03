/**
 * Main Button Label — тесты SVG-надписи состояния кнопки
 *
 * Покрывает функциональную область UI основной кнопки подключения:
 * проверка textContent SVG-надписи `.shield-label` для всех 4 состояний приложения
 * (disconnected, connected, connecting, error).
 *
 * При расширении покрытия (новые label-сценарии) — добавляй test() блоки в этот файл.
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
const ARTIFACT_PREFIX = 'QA-125';

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

test.describe('Main Button Label — SVG-надпись для всех 4 состояний', () => {
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
        await context?.close().catch(() => {
            // Context may already be closed
        });
    });

    test.afterEach(async () => {
        await popup?.close().catch(() => {});
    });

    // TC 125.1: SVG-надпись "OFF" при состоянии disconnected
    test('TC 125.1: SVG-надпись "OFF" при состоянии disconnected', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние disconnected
        await setProxyState(popup, 'disconnected');
        await popup.waitForTimeout(500);

        // Обновляем страницу чтобы UI обновился
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const labelEl = popup.locator('#main-button .shield-label');
        const labelText = await labelEl.textContent();

        expect(labelText).toBe('OFF');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-125.1-label-off.png`) });
    });

    // TC 125.2: SVG-надпись "ON" при состоянии connected
    test('TC 125.2: SVG-надпись "ON" при состоянии connected', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние connected
        await setProxyState(popup, 'connected');
        await popup.waitForTimeout(500);

        // Обновляем страницу
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const labelEl = popup.locator('#main-button .shield-label');
        const labelText = await labelEl.textContent();

        expect(labelText).toBe('ON');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-125.2-label-on.png`) });
    });

    // TC 125.3: SVG-надпись "..." при состоянии connecting
    test('TC 125.3: SVG-надпись "..." при состоянии connecting', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние connecting
        await setProxyState(popup, 'connecting');
        await popup.waitForTimeout(500);

        // Обновляем страницу
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const labelEl = popup.locator('#main-button .shield-label');
        const labelText = await labelEl.textContent();

        expect(labelText).toBe('...');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-125.3-label-connecting.png`) });
    });

    // TC 125.4: SVG-надпись "ERROR" при состоянии error
    test('TC 125.4: SVG-надпись "ERROR" при состоянии error', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        // Устанавливаем состояние error
        await setProxyState(popup, 'error');
        await popup.waitForTimeout(500);

        // Обновляем страницу
        await popup.reload();
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const labelEl = popup.locator('#main-button .shield-label');
        const labelText = await labelEl.textContent();

        expect(labelText).toBe('ERROR');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-125.4-label-error.png`) });
    });
});
