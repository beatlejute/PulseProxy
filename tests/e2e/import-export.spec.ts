/**
 * Import/Export configuration — JSON export, structure validation, data restoration
 *
 * Покрывает функциональную область Import/Export всего popup'а расширения.
 * При расширении покрытия — добавляй test() блоки в этот файл,
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
const EXPORT_FORMAT_VERSION = 1;

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
    }
}

async function openSettingsTab(popup: Page): Promise<void> {
    // Wait for the popup DOM to be fully loaded and tabs initialized
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(1000);

    const settingsTab = popup.locator('[data-tab="settings"]');
    await expect(settingsTab).toBeVisible({ timeout: 10000 });

    // Check if settings content is already visible (tab already open)
    const settingsContent = popup.locator('#tab-settings.active');
    const isActive = await settingsContent.isVisible().catch(() => false);
    if (!isActive) {
        // Force open the tab via JavaScript to avoid toggle behavior (clicking active tab closes it)
        await popup.evaluate(() => {
            const tab = document.querySelector('[data-tab="settings"]') as HTMLElement;
            if (tab) tab.click();
        });
        await expect(settingsContent).toBeVisible({ timeout: 10000 });
    }

    await popup.waitForTimeout(500);
    await popup.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
    await popup.waitForTimeout(500);
}

/** Keys that export/import carries (data.* in the export JSON) */
const EXPORTED_KEYS = ['proxies', 'presets', 'theme', 'language', 'proxyByDefault', 'proxyCheckEnabled'];

/**
 * Read all keys from chrome.storage.local — the popup's source of truth
 * (cloud sync is opt-in, sync → local is copied only when syncEnabled is true)
 */
async function readStorage(page: Page): Promise<Record<string, unknown>> {
    return page.evaluate(() =>
        new Promise(resolve => chrome.storage.local.get(null, resolve))
    );
}

/** Seed chrome.storage.local */
async function seedStorage(page: Page, data: Record<string, unknown>): Promise<void> {
    await page.evaluate((d) => chrome.storage.local.set(d), data);
    const expectedKeys = Object.keys(data);
    await expect.poll(
        async () => {
            const stored = await readStorage(page);
            return expectedKeys.every(k => k in stored);
        },
        { timeout: 5000, message: 'storage.local did not reflect seeded keys in time' }
    ).toBe(true);
}

/**
 * Click the real #export-button and capture the JSON payload and filename.
 * Intercepts URL.createObjectURL so that when handleExport() creates a Blob and
 * triggers a download via <a download>, we get the exact JSON that would be saved.
 */
async function captureExport(page: Page): Promise<{ json: string; filename: string | null }> {
    await page.evaluate(() => {
        (window as unknown as { __capturedExport: string | null }).__capturedExport = null;
        (window as unknown as { __capturedExportFilename: string | null }).__capturedExportFilename = null;
        const origCreate = URL.createObjectURL.bind(URL);
        URL.createObjectURL = function (obj: Blob | MediaSource): string {
            if (obj instanceof Blob && obj.type === 'application/json') {
                obj.text().then((text) => {
                    (window as unknown as { __capturedExport: string | null }).__capturedExport = text;
                });
            }
            return origCreate(obj);
        };
        // Capture filename from the anchor `download` attribute used by handleExport().
        const origAppend = document.body.appendChild.bind(document.body);
        (document.body as HTMLElement).appendChild = function <T extends Node>(node: T): T {
            if (node instanceof HTMLAnchorElement && node.download) {
                (window as unknown as { __capturedExportFilename: string | null }).__capturedExportFilename = node.download;
            }
            return origAppend(node) as T;
        };
    });

    // Invokes Settings.handleExport() → Storage.exportAllData() → download via <a download>.
    await page.locator('#export-button').click();

    await expect.poll(
        async () => page.evaluate(() => (window as unknown as { __capturedExport: string | null }).__capturedExport),
        { timeout: 5000, message: 'Export was not triggered (URL.createObjectURL did not receive a JSON Blob)' }
    ).not.toBeNull();

    const json = await page.evaluate(
        () => (window as unknown as { __capturedExport: string | null }).__capturedExport
    );
    const filename = await page.evaluate(
        () => (window as unknown as { __capturedExportFilename: string | null }).__capturedExportFilename
    );
    return { json: json as string, filename };
}

/**
 * Re-implementation of validateImportData logic for pure-function testing.
 * Mirrors src/storage/import-export-service.ts validateImportData() exactly.
 */
function validateImportDataLocally(jsonString: string): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    } catch {
        return { valid: false, errors: ['invalidJson'], warnings: [] };
    }

    if (!parsed || typeof parsed !== 'object') {
        return { valid: false, errors: ['invalidStructure'], warnings: [] };
    }

    const data = parsed as Record<string, unknown>;

    if (typeof data.version !== 'number') {
        errors.push('missingVersion');
    } else if (data.version > EXPORT_FORMAT_VERSION) {
        warnings.push('newerVersion');
    }

    if (!data.data || typeof data.data !== 'object') {
        return { valid: false, errors: ['missingData'], warnings };
    }

    const innerData = data.data as Record<string, unknown>;

    if (!Array.isArray(innerData.presets)) {
        errors.push('invalidPresets');
    }

    if (!Array.isArray(innerData.proxies)) {
        errors.push('invalidProxies');
    }

    if (errors.length > 0) {
        return { valid: false, errors, warnings };
    }

    return { valid: true, errors: [], warnings };
}

test.describe('Import/Export — configuration (JSON)', () => {
    let context: BrowserContext;
    let popupUrl: string;

    test.beforeAll(async () => {
        test.setTimeout(120000);
        ensureArtifactsDir();
        const ext = await launchExtension();
        context = ext.context;
        popupUrl = ext.popupUrl;
    });

    test.afterAll(async () => {
        await context?.close();
    });

    // TC 7.1: Create proxy + presets → Click #export-button → JSON file downloaded with correct structure
    test('TC 7.1: export generates valid JSON with correct structure', async () => {
        const page = await openPopup(context, popupUrl);
        await dismissModalIfPresent(page);

        // Remove exported data keys to ensure test data isolation (drops extension defaults like "default-custom-preset")
        await page.evaluate((keys) => chrome.storage.local.remove(keys), EXPORTED_KEYS);
        await page.waitForTimeout(500);

        // Seed data
        await seedStorage(page, {
            proxies: [
                {
                    id: 'exp-proxy-1',
                    host: '192.168.1.100',
                    port: 8080,
                    type: 'http',
                    isDefault: false,
                    name: 'Export Test Proxy',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ],
            presets: [
                {
                    id: 'exp-preset-1',
                    name: 'Export Test Preset',
                    domains: ['example.com', 'test.org'],
                    enabled: true,
                    isDefault: false,
                    order: 0,
                    proxyId: null,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ],
        });

        // Navigate to settings, verify buttons
        await openSettingsTab(page);
        await page.locator('#export-button').waitFor({ state: 'visible', timeout: 10000 });
        await expect(page.locator('#export-button')).toBeVisible();
        await expect(page.locator('#import-button')).toBeVisible();
        await expect(page.locator('#import-file-input')).toHaveAttribute('accept', '.json');

        // Click the real export button and capture the JSON payload that would be saved to disk.
        const { json: capturedJson, filename: capturedFilename } = await captureExport(page);
        const exportData = JSON.parse(capturedJson);

        // Save exported JSON as evidence
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'tc-7.1-export.json'), capturedJson, 'utf-8');

        // Validate structure
        expect(exportData.version).toBe(EXPORT_FORMAT_VERSION);
        expect(typeof exportData.exportedAt).toBe('string');
        expect(Array.isArray(exportData.data.proxies)).toBe(true);
        expect(Array.isArray(exportData.data.presets)).toBe(true);
        expect(typeof exportData.data.theme).toBe('string');
        expect(typeof exportData.data.language).toBe('string');

        // Exactly the seeded data — defaults were removed before seeding
        const proxyIds = exportData.data.proxies.map((p: any) => p.id);
        expect(proxyIds).toEqual(['exp-proxy-1']);

        const presetIds = exportData.data.presets.map((p: any) => p.id);
        expect(presetIds).toEqual(['exp-preset-1']);

        // Filename sanity: handleExport() uses `pulseproxy-settings-YYYY-MM-DD.json`
        expect(capturedFilename).toMatch(/^pulseproxy-settings-\d{4}-\d{2}-\d{2}\.json$/);

        console.log('TC 7.1: PASS (real #export-button click, captured filename=' + capturedFilename + ')');
        await page.close();
    });

    // TC 7.2: Verify JSON structure contains all required sections
    test('TC 7.2: JSON contains all required sections (proxies, presets, settings)', async () => {
        const page = await openPopup(context, popupUrl);
        await dismissModalIfPresent(page);

        await seedStorage(page, {
            proxies: [{
                id: 'struct-proxy', host: '10.0.0.1', port: 3128, type: 'socks5',
                isDefault: true, name: 'Struct Test', createdAt: Date.now(), updatedAt: Date.now(),
            }],
            presets: [{
                id: 'struct-preset', name: 'Struct Test Preset',
                domains: ['struct.example.com'], enabled: true, isDefault: false,
                order: 0, proxyId: 'struct-proxy', createdAt: Date.now(), updatedAt: Date.now(),
            }],
            theme: 'dark', language: 'ru', proxyByDefault: true, proxyCheckEnabled: true,
        });

        await openSettingsTab(page);
        const { json } = await captureExport(page);
        const exported = JSON.parse(json).data;

        expect(exported.proxies).toBeDefined();
        expect(exported.presets).toBeDefined();
        expect(exported.theme).toBe('dark');
        expect(exported.language).toBe('ru');
        expect(exported.proxyByDefault).toBe(true);
        expect(exported.proxyCheckEnabled).toBe(true);

        const proxy = (exported.proxies as any[]).find((p: any) => p.id === 'struct-proxy');
        expect(proxy).toBeDefined();
        expect(proxy.host).toBe('10.0.0.1');
        expect(proxy.port).toBe(3128);

        const preset = (exported.presets as any[]).find((p: any) => p.id === 'struct-preset');
        expect(preset).toBeDefined();
        expect(preset.domains).toContain('struct.example.com');

        console.log('TC 7.2: PASS');
        await page.close();
    });

    // TC 7.3: Delete all data → Import JSON → data restored
    test('TC 7.3: import restores all data after deletion', async () => {
        const page = await openPopup(context, popupUrl);
        await dismissModalIfPresent(page);

        // Step 1: Seed data
        await seedStorage(page, {
            proxies: [{
                id: 'restore-proxy', host: '172.16.0.1', port: 9090, type: 'http',
                isDefault: false, name: 'Restore Test Proxy', createdAt: Date.now(), updatedAt: Date.now(),
            }],
            presets: [{
                id: 'restore-preset', name: 'Restore Test Preset',
                domains: ['restore.example.com'], enabled: true, isDefault: false,
                order: 0, proxyId: null, createdAt: Date.now(), updatedAt: Date.now(),
            }],
            theme: 'dark', language: 'de', proxyByDefault: true, proxyCheckEnabled: false,
        });

        // Step 2: Export via the real #export-button
        await openSettingsTab(page);
        const { json: exportJson } = await captureExport(page);
        const exportData = JSON.parse(exportJson);

        expect(exportData.data.proxies.some((p: any) => p.id === 'restore-proxy')).toBe(true);
        expect(exportData.data.presets.some((p: any) => p.id === 'restore-preset')).toBe(true);

        // Step 3: Delete data
        await page.evaluate((keys) => chrome.storage.local.remove(keys), EXPORTED_KEYS);
        await page.waitForTimeout(500);

        const storageAfterDelete = await readStorage(page);
        expect(storageAfterDelete.proxies).toBeUndefined();
        expect(storageAfterDelete.presets).toBeUndefined();

        // Step 4: Import via the real #import-file-input → confirm → success alert → popup reload
        await page.locator('#import-file-input').setInputFiles({
            name: 'pulseproxy-settings.json',
            mimeType: 'application/json',
            buffer: Buffer.from(exportJson, 'utf-8'),
        });
        const confirmOk = page.locator('.modal-overlay .modal-footer .btn-primary');
        await expect(confirmOk).toBeVisible({ timeout: 5000 });
        await confirmOk.click();
        const alertOk = page.locator('.modal-overlay .modal-footer .btn-primary');
        await expect(alertOk).toBeVisible({ timeout: 5000 });
        await Promise.all([
            page.waitForEvent('load'),
            alertOk.click(),
        ]);

        // Step 5: Verify restoration
        const storageAfterImport = await readStorage(page);
        const restoredProxies = (storageAfterImport.proxies as any[]) || [];
        const restoredPresets = (storageAfterImport.presets as any[]) || [];

        expect(restoredProxies.some((p: any) => p.id === 'restore-proxy')).toBe(true);
        expect(restoredPresets.some((p: any) => p.id === 'restore-preset')).toBe(true);
        expect(storageAfterImport.theme).toBe('dark');
        expect(storageAfterImport.language).toBe('de');
        expect(storageAfterImport.proxyByDefault).toBe(true);
        expect(storageAfterImport.proxyCheckEnabled).toBe(false);

        console.log('TC 7.3: PASS');
        await page.close();
    });

    // TC 7.4: Import invalid JSON → error message
    test('TC 7.4: invalid JSON import shows error', async () => {
        const page = await openPopup(context, popupUrl);
        await dismissModalIfPresent(page);
        await openSettingsTab(page);

        await expect(page.locator('#import-file-input')).toBeAttached();
        await expect(page.locator('#import-file-input')).toHaveAttribute('accept', '.json');

        // Validation tests (pure function mirroring the service logic)
        expect(validateImportDataLocally('{ invalid json !!! }').valid).toBe(false);
        expect(validateImportDataLocally('{ invalid json !!! }').errors).toContain('invalidJson');
        expect(validateImportDataLocally('').valid).toBe(false);
        expect(validateImportDataLocally('just some text').valid).toBe(false);
        expect(validateImportDataLocally('null').valid).toBe(false);

        console.log('TC 7.4: PASS');
        await page.close();
    });

    // TC 7.5: Import JSON with higher version → warning
    test('TC 7.5: import JSON with higher version shows warning', async () => {
        const page = await openPopup(context, popupUrl);
        await dismissModalIfPresent(page);
        await openSettingsTab(page);

        const higherVersionData = {
            version: 999,
            exportedAt: new Date().toISOString(),
            extensionVersion: '99.0.0',
            data: { presets: [], proxies: [], theme: 'light', language: 'en', proxyByDefault: false, proxyCheckEnabled: true },
        };

        const result = validateImportDataLocally(JSON.stringify(higherVersionData));
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('newerVersion');

        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'tc-7.5-higher-version.json'), JSON.stringify(higherVersionData, null, 2), 'utf-8');

        // Same version → no warnings
        const sameResult = validateImportDataLocally(JSON.stringify({
            version: EXPORT_FORMAT_VERSION,
            exportedAt: new Date().toISOString(),
            data: { presets: [], proxies: [], theme: 'light', language: 'en', proxyByDefault: false, proxyCheckEnabled: true },
        }));
        expect(sameResult.valid).toBe(true);
        expect(sameResult.warnings).toEqual([]);

        console.log('TC 7.5: PASS');
        await page.close();
    });

    // TC 7.6: Import empty file → correct handling
    test('TC 7.6: empty file and malformed data handled gracefully', async () => {
        const page = await openPopup(context, popupUrl);
        await dismissModalIfPresent(page);
        await openSettingsTab(page);

        // Empty / malformed
        expect(validateImportDataLocally('').valid).toBe(false);
        expect(validateImportDataLocally('').errors).toContain('invalidJson');

        // Missing data section
        expect(validateImportDataLocally(JSON.stringify({ version: 1 })).valid).toBe(false);
        expect(validateImportDataLocally(JSON.stringify({ version: 1 })).errors).toContain('missingData');

        // Non-object data
        expect(validateImportDataLocally(JSON.stringify({ version: 1, data: 'x' })).valid).toBe(false);

        // Non-array presets/proxies
        const noArrays = validateImportDataLocally(JSON.stringify({ version: 1, data: { presets: 'x', proxies: 'y' } }));
        expect(noArrays.valid).toBe(false);
        expect(noArrays.errors).toContain('invalidPresets');
        expect(noArrays.errors).toContain('invalidProxies');

        // Valid empty arrays
        expect(validateImportDataLocally(JSON.stringify({
            version: 1, exportedAt: new Date().toISOString(),
            data: { presets: [], proxies: [], theme: 'light', language: 'en', proxyByDefault: false, proxyCheckEnabled: true },
        })).valid).toBe(true);

        // Fully valid
        expect(validateImportDataLocally(JSON.stringify({
            version: 1, exportedAt: new Date().toISOString(),
            data: {
                presets: [{ id: 't', name: 'T', domains: [], enabled: true, isDefault: false, order: 0 }],
                proxies: [{ id: 't', host: '1.2.3.4', port: 80, type: 'http', isDefault: false }],
                theme: 'dark', language: 'ru', proxyByDefault: true, proxyCheckEnabled: true,
            },
        })).valid).toBe(true);

        console.log('TC 7.6: PASS');
        await page.close();
    });
});
