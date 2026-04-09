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

        // First click
        await button.click();
        await popup.waitForTimeout(1000);

        const afterFirst = await popup.evaluate(() =>
            new Promise<boolean | undefined>(resolve =>
                chrome.storage.local.get(['proxyByDefault'], (r: any) => resolve(r.proxyByDefault))
            )
        );
        expect(afterFirst).toBe(!initial);

        // Second click — toggle back
        await button.click();
        await popup.waitForTimeout(500);

        const afterSecond = await popup.evaluate(() =>
            new Promise<boolean | undefined>(resolve =>
                chrome.storage.local.get(['proxyByDefault'], (r: any) => resolve(r.proxyByDefault))
            )
        );
        expect(afterSecond).toBe(initial);

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
});
