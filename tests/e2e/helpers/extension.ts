import { chromium, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const EXTENSION_PATH = path.resolve(__dirname, '../../..');

export async function launchExtension(): Promise<{
    context: BrowserContext;
    extensionId: string;
    popupUrl: string;
}> {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
        ],
    });

    // Ждём service worker расширения (до 15 секунд)
    let [background] = context.serviceWorkers();
    if (!background) {
        background = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }

    const extensionId = background.url().split('/')[2];
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;

    // Небольшая пауза для инициализации расширения
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { context, extensionId, popupUrl };
}

export async function openPopup(context: BrowserContext, popupUrl: string) {
    const page = await context.newPage();
    await page.goto(popupUrl);
    await page.waitForLoadState('domcontentloaded');
    return page;
}
