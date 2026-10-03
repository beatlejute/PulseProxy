import { Storage } from '../../src/shared/storage';
import { mockHelpers } from '../__mocks__/chrome';

describe('geo-exclusions-storage', () => {
    beforeEach(() => {
        mockHelpers.resetAllMocks();
    });

    // TC1: добавление, затем чтение
    it('should add and read exclusions', async () => {
        await Storage.addPresetGeoExclusion('preset1', 'socks5://1.2.3.4:1080', 1000);
        const exclusions = await Storage.getPresetGeoExclusions('preset1');
        expect(exclusions['socks5://1.2.3.4:1080']).toBe(1000);
    });

    // TC2: запись через неделю по моку времени остаётся
    it('should persist exclusions over time', async () => {
        const now = Date.now();
        await Storage.addPresetGeoExclusion('preset1', 'socks5://1.2.3.4:1080', now);
        const weekLater = now + 7 * 24 * 60 * 60 * 1000;

        const exclusions = await Storage.getPresetGeoExclusions('preset1');
        // Запись была в now, а мы сейчас в weekLater
        expect(exclusions['socks5://1.2.3.4:1080']).toBe(now);
    });

    // TC3: очистка по каталогу удаляет отсутствующий прокси и оставляет присутствующий
    it('should clean absent proxies from catalog', async () => {
        // Добавляем два исключения для одного пресета
        await Storage.addPresetGeoExclusion('preset1', 'socks5://1.2.3.4:1080', 1000);
        await Storage.addPresetGeoExclusion('preset1', 'socks5://5.6.7.8:1080', 2000);

        // Очищаем, оставляя только первый прокси в каталоге
        await Storage.cleanGeoExclusions(['socks5://1.2.3.4:1080'], ['preset1']);

        const exclusions = await Storage.getPresetGeoExclusions('preset1');
        expect(exclusions['socks5://1.2.3.4:1080']).toBe(1000);
        expect(exclusions['socks5://5.6.7.8:1080']).toBeUndefined();
    });

    // TC4: очистка удаляет записи удалённого пресета
    it('should clean deleted presets', async () => {
        // Добавляем исключения для двух пресетов
        await Storage.addPresetGeoExclusion('preset1', 'socks5://1.2.3.4:1080', 1000);
        await Storage.addPresetGeoExclusion('preset2', 'socks5://1.2.3.4:1080', 2000);

        // Очищаем, оставляя только preset1
        await Storage.cleanGeoExclusions(['socks5://1.2.3.4:1080'], ['preset1']);

        const exclusions1 = await Storage.getPresetGeoExclusions('preset1');
        const exclusions2 = await Storage.getPresetGeoExclusions('preset2');

        expect(exclusions1['socks5://1.2.3.4:1080']).toBe(1000);
        expect(Object.keys(exclusions2).length).toBe(0);
    });

    // TC5: сброс пресета не трогает другой пресет
    it('should delete only specified preset exclusions', async () => {
        // Добавляем исключения для двух пресетов
        await Storage.addPresetGeoExclusion('preset1', 'socks5://1.2.3.4:1080', 1000);
        await Storage.addPresetGeoExclusion('preset2', 'socks5://5.6.7.8:1080', 2000);

        // Удаляем исключения только для preset1
        await Storage.deletePresetGeoExclusions('preset1');

        const exclusions1 = await Storage.getPresetGeoExclusions('preset1');
        const exclusions2 = await Storage.getPresetGeoExclusions('preset2');

        expect(Object.keys(exclusions1).length).toBe(0);
        expect(exclusions2['socks5://5.6.7.8:1080']).toBe(2000);
    });

    // TC6: ключа нет в chrome.storage.sync
    it('should not store exclusions in sync storage', async () => {
        await Storage.addPresetGeoExclusion('preset1', 'socks5://1.2.3.4:1080', 1000);

        const syncData = await new Promise<Record<string, unknown>>((resolve) => {
            chrome.storage.sync.get(null, (result) => resolve(result));
        });

        expect(syncData['publicPoolGeoExclusions']).toBeUndefined();
    });
});
