import { Storage } from '../../src/shared/storage';
import { GeoBlockConfig } from '../../src/shared/constants';
import { mockHelpers } from '../__mocks__/chrome';

describe('geo-sites-storage', () => {
    beforeEach(() => {
        mockHelpers.resetAllMocks();
    });

    // TC1: 4 увеличения — не остановлен
    it('should not stop site after 4 increments', async () => {
        const now = Date.now();
        const presetId = 'preset1';
        const ruleKey = 'example.com';

        for (let i = 0; i < 4; i++) {
            const state = await Storage.incrementPresetGeoSite(presetId, ruleKey, now);
            expect(state.streak).toBe(i + 1);
            expect(state.stopped).toBe(false);
        }

        const final = await Storage.getPresetGeoSite(presetId, ruleKey, now);
        expect(final.streak).toBe(4);
        expect(final.stopped).toBe(false);
    });

    // TC2: 5-е увеличение — остановлен
    it('should stop site after 5 increments (SITE_STREAK_LIMIT)', async () => {
        const now = Date.now();
        const presetId = 'preset1';
        const ruleKey = 'example.com';

        for (let i = 0; i < 4; i++) {
            await Storage.incrementPresetGeoSite(presetId, ruleKey, now);
        }

        const fifth = await Storage.incrementPresetGeoSite(presetId, ruleKey, now);
        expect(fifth.streak).toBe(5);
        expect(fifth.stopped).toBe(true);

        const final = await Storage.getPresetGeoSite(presetId, ruleKey, now);
        expect(final.streak).toBe(5);
        expect(final.stopped).toBe(true);
    });

    // TC3: через SITE_STOP_MS — не остановлен
    it('should remove stop flag after SITE_STOP_MS', async () => {
        const now = Date.now();
        const presetId = 'preset1';
        const ruleKey = 'example.com';

        for (let i = 0; i < 5; i++) {
            await Storage.incrementPresetGeoSite(presetId, ruleKey, now);
        }

        let state = await Storage.getPresetGeoSite(presetId, ruleKey, now);
        expect(state.stopped).toBe(true);

        const laterTime = now + GeoBlockConfig.SITE_STOP_MS + 1000;
        state = await Storage.getPresetGeoSite(presetId, ruleKey, laterTime);
        expect(state.streak).toBe(5);
        expect(state.stopped).toBe(false);
    });

    // TC4: обнуление снимает остановку и streak
    it('should reset streak and stop flag when reset', async () => {
        const now = Date.now();
        const presetId = 'preset1';
        const ruleKey = 'example.com';

        for (let i = 0; i < 5; i++) {
            await Storage.incrementPresetGeoSite(presetId, ruleKey, now);
        }

        let state = await Storage.getPresetGeoSite(presetId, ruleKey, now);
        expect(state.streak).toBe(5);
        expect(state.stopped).toBe(true);

        await Storage.resetPresetGeoSite(presetId, ruleKey);

        state = await Storage.getPresetGeoSite(presetId, ruleKey, now);
        expect(state.streak).toBe(0);
        expect(state.stopped).toBe(false);
    });

    // TC5: два сайта одного пресета не смешиваются
    it('should keep separate state for different rule keys in same preset', async () => {
        const now = Date.now();
        const presetId = 'preset1';
        const ruleKey1 = 'example.com';
        const ruleKey2 = 'other.com';

        for (let i = 0; i < 3; i++) {
            await Storage.incrementPresetGeoSite(presetId, ruleKey1, now);
        }

        for (let i = 0; i < 5; i++) {
            await Storage.incrementPresetGeoSite(presetId, ruleKey2, now);
        }

        const state1 = await Storage.getPresetGeoSite(presetId, ruleKey1, now);
        const state2 = await Storage.getPresetGeoSite(presetId, ruleKey2, now);

        expect(state1.streak).toBe(3);
        expect(state1.stopped).toBe(false);
        expect(state2.streak).toBe(5);
        expect(state2.stopped).toBe(true);
    });

    // TC6: удаление сайтов пресета не трогает другой пресет
    it('should delete only specified preset sites', async () => {
        const now = Date.now();
        const preset1 = 'preset1';
        const preset2 = 'preset2';
        const ruleKey = 'example.com';

        for (let i = 0; i < 3; i++) {
            await Storage.incrementPresetGeoSite(preset1, ruleKey, now);
            await Storage.incrementPresetGeoSite(preset2, ruleKey, now);
        }

        const state1Before = await Storage.getPresetGeoSite(preset1, ruleKey, now);
        const state2Before = await Storage.getPresetGeoSite(preset2, ruleKey, now);
        expect(state1Before.streak).toBe(3);
        expect(state2Before.streak).toBe(3);

        await Storage.deletePresetGeoSites(preset1);

        const state1After = await Storage.getPresetGeoSite(preset1, ruleKey, now);
        const state2After = await Storage.getPresetGeoSite(preset2, ruleKey, now);

        expect(state1After.streak).toBe(0);
        expect(state1After.stopped).toBe(false);
        expect(state2After.streak).toBe(3);
        expect(state2After.stopped).toBe(false);
    });

    // TC7: пустой пресет при чтении возвращает нулевую серию
    it('should return zero streak and not stopped for non-existent site', async () => {
        const now = Date.now();
        const presetId = 'nonexistent';
        const ruleKey = 'example.com';

        const state = await Storage.getPresetGeoSite(presetId, ruleKey, now);
        expect(state.streak).toBe(0);
        expect(state.stopped).toBe(false);
    });
});
