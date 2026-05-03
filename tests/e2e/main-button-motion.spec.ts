/**
 * Main Button Motion — тесты поведения hover-эффекта при prefers-reduced-motion
 *
 * Покрывает функциональную область accessibility (a11y):
 * проверка отключения transform-анимации для пользователей с чувствительностью к движению.
 *
 * Тестовые сценарии:
 * 1. При reducedMotion: 'reduce' + hover — transform = 'none', drop-shadow остаётся
 * 2. При reducedMotion: 'no-preference' + hover — transform содержит 'scale(1.08)'
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { launchExtension, openPopup } from './helpers/extension';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACTS_DIR = path.resolve(__dirname, '../../reports');
const ARTIFACT_PREFIX = 'QA-129';

function ensureArtifactsDir() {
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
}

test.describe('Main Button Motion — prefers-reduced-motion поведение', () => {
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

    // TC 129.1: При reducedMotion: 'reduce' + hover — transform = 'none'
    test('TC 129.1: При reducedMotion: reduce - transform должен быть none при hover', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.emulateMedia({ reducedMotion: 'reduce' });
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const button = popup.locator('#main-button');
        const shieldIcon = popup.locator('#main-button .shield-icon');

        // Наводим hover
        await button.hover();
        await popup.waitForTimeout(300);

        // Проверяем состояние при hover
        const computedStyle = await button.evaluate((el: Element) => {
            const style = window.getComputedStyle(el);
            return {
                transform: style.transform,
            };
        });

        const shieldIconStyle = await shieldIcon.evaluate((el: Element) => {
            const style = window.getComputedStyle(el);
            return {
                filter: style.filter,
            };
        });

        // transform должен быть 'none' или эквивалентная матрица (при reduced-motion)
        const isTransformNone = computedStyle.transform === 'none' || computedStyle.transform === 'matrix(1, 0, 0, 1, 0, 0)';
        expect(isTransformNone).toBeTruthy();

        // drop-shadow должен остаться на .shield-icon
        expect(shieldIconStyle.filter).toContain('drop-shadow');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-129.1-reduced-motion-hover.png`) });
    });

    // TC 129.2: При reducedMotion: 'no-preference' + hover — transform содержит 'scale(1.08)'
    test('TC 129.2: При no-preference - transform содержит scale(1.08) при hover', async () => {
        popup = await openPopup(context, popupUrl);
        await popup.emulateMedia({ reducedMotion: 'no-preference' });
        await popup.waitForLoadState('domcontentloaded');
        await popup.waitForTimeout(500);

        const button = popup.locator('#main-button');
        const shieldIcon = popup.locator('#main-button .shield-icon');

        // Наводим hover
        await button.hover();
        await popup.waitForTimeout(300);

        // Проверяем состояние при hover
        const computedStyle = await button.evaluate((el: Element) => {
            const style = window.getComputedStyle(el);
            return {
                transform: style.transform,
            };
        });

        const shieldIconStyle = await shieldIcon.evaluate((el: Element) => {
            const style = window.getComputedStyle(el);
            return {
                filter: style.filter,
            };
        });

        // transform должен содержать 'scale(1.08)' при no-preference
        expect(computedStyle.transform).toContain('1.08');

        // drop-shadow должен присутствовать на .shield-icon
        expect(shieldIconStyle.filter).toContain('drop-shadow');

        await popup.screenshot({ path: path.join(ARTIFACTS_DIR, `${ARTIFACT_PREFIX}-129.2-no-preference-hover.png`) });
    });
});
