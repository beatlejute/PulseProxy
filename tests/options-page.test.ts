import { readFileSync } from 'fs';
import { join } from 'path';
import { PAGE_VIEW_QUERY } from '../src/popup/view-mode';

/**
 * Страница «Параметры расширения» (chrome://extensions) должна открывать
 * popup.html в полностраничном режиме. Тест фиксирует связку:
 * manifest.options_ui → options.html → redirect на popup.html?view=page.
 */
describe('options page (Параметры расширения)', () => {
    const ROOT = join(__dirname, '..');

    it('manifest регистрирует options_ui с открытием в отдельной вкладке', () => {
        const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf-8'));

        expect(manifest.options_ui).toBeDefined();
        expect(manifest.options_ui.page).toBe('options.html');
        expect(manifest.options_ui.open_in_tab).toBe(true);
    });

    it('options.html редиректит на popup.html в page-режиме (query совпадает с PAGE_VIEW_QUERY)', () => {
        const html = readFileSync(join(ROOT, 'options.html'), 'utf-8');

        expect(html).toContain('http-equiv="refresh"');
        expect(html).toContain(`url=popup.html?${PAGE_VIEW_QUERY}`);
    });
});
