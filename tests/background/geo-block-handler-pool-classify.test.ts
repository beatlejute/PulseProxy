/**
 * QA-183 (PLAN-020, задача 27): гео-ответы на маршруте пула, которых не было
 * в покрытии QA-176, — проверка «я не робот» (`cf-mitigated: challenge`) и два
 * одновременных гео-ответа одного пресета.
 *
 * `src/shared/geo-block` и `src/shared/storage` здесь настоящие: решение «гео-блок
 * или нет» принимает `classifyGeoBlock`, записи исключений и серия сайта читаются
 * из in-memory мока `chrome` (`tests/__mocks__/chrome.ts`, подключает `tests/setup.ts`).
 * Моком заменены только зависимости обработчика: `ProxyManager` (маршрут вкладки
 * и пересборка PAC) и `IconManager` (бейдж).
 *
 * Тест не пишет на диск.
 */
import { handleGeoBlockResponse } from '../../src/background/geo-block-handler';
import { clearMark } from '../../src/background/geo-block-marks';
import { ProxyManager } from '../../src/background/proxy-manager';
import { IconManager } from '../../src/background/icon-manager';
import { mockHelpers } from '../__mocks__/chrome';

jest.mock('../../src/background/proxy-manager');
jest.mock('../../src/background/icon-manager');

const mockProxyManager = ProxyManager as jest.Mocked<typeof ProxyManager>;
const mockIconManager = IconManager as jest.Mocked<typeof IconManager>;

const PRESET_ID = 'preset-pool-1';
const POOL_RULE = 'blocked.example';

// Три участника: CHAIN_LENGTH = 3, поэтому цепочка накрывает весь пул и совпадение
// по `ip` не зависит от порядка цепочки.
const MEMBERS = [
    { key: 'socks5://10.0.0.1:1080', ip: '10.0.0.1', pac: 'SOCKS5 10.0.0.1:1080' },
    { key: 'socks5://10.0.0.2:1080', ip: '10.0.0.2', pac: 'SOCKS5 10.0.0.2:1080' },
    { key: 'socks5://10.0.0.3:1080', ip: '10.0.0.3', pac: 'SOCKS5 10.0.0.3:1080' },
];

function poolRoute(members: typeof MEMBERS) {
    return {
        kind: 'pool' as const,
        server: null,
        viaProxyAll: false,
        poolSize: members.length,
        presetId: PRESET_ID,
        poolRule: POOL_RULE,
        poolMembers: members,
    };
}

type ResponseDetails = chrome.webRequest.OnResponseStartedDetails;

function mainFrameResponse(
    tabId: number,
    statusCode: number,
    ip: string,
    responseHeaders: Array<{ name: string; value?: string }> = [],
): ResponseDetails {
    return {
        tabId,
        requestId: String(tabId),
        url: `https://${POOL_RULE}/page`,
        type: 'main_frame' as const,
        method: 'GET' as const,
        statusCode,
        responseHeaders,
        ip,
    } as ResponseDetails;
}

// `handleGeoBlockResponse` объявлена как void, но обработку пула ведёт асинхронно:
// макрозадача даёт завершиться микрозадачам хранилища и пересборки PAC.
const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeoutMs) {
            throw new Error(`условие не выполнено за ${timeoutMs} мс`);
        }
        await flushAsync();
    }
}

function presetExclusions(): Record<string, number> {
    const data = mockHelpers.getLocalStorageData() as {
        publicPoolGeoExclusions?: Record<string, Record<string, number>>;
    };
    return data.publicPoolGeoExclusions?.[PRESET_ID] ?? {};
}

function siteStreak(): number {
    const data = mockHelpers.getLocalStorageData() as {
        publicPoolGeoSites?: Record<string, Record<string, { streak: number }>>;
    };
    return data.publicPoolGeoSites?.[PRESET_ID]?.[POOL_RULE]?.streak ?? 0;
}

// Отметки вкладок живут в памяти процесса (`geo-block-marks`) и переживают тест.
const TAB_IDS = [41, 42, 51];

describe('pool route geo replies with real classifier', () => {
    const reload = jest.fn();

    beforeEach(() => {
        // `chrome.tabs` в моке `tests/__mocks__/chrome.ts` нет: перезагрузку вкладки
        // обработчик зовёт напрямую, поэтому её задаёт тест.
        (global.chrome as unknown as { tabs: { reload: jest.Mock } }).tabs = { reload };
        mockProxyManager.getRouteForUrl.mockReturnValue(poolRoute(MEMBERS));
        mockProxyManager.refreshIfConnected.mockResolvedValue(undefined);
    });

    afterEach(() => {
        TAB_IDS.forEach(clearMark);
    });

    it('challenge: 403 с cf-mitigated: challenge на main_frame пула — исключения нет, серия не растёт, перезагрузки нет', async () => {
        // Серия сайта до ответа: если проверка «я не робот» принята за гео-блок, она вырастет до 3.
        mockHelpers.setLocalStorageData({
            publicPoolGeoSites: { [PRESET_ID]: { [POOL_RULE]: { streak: 2, stoppedAt: null } } },
        });

        handleGeoBlockResponse(
            mainFrameResponse(51, 403, '10.0.0.1', [{ name: 'cf-mitigated', value: 'challenge' }]),
        );
        await flushAsync();

        expect(presetExclusions()).toEqual({});
        expect(siteStreak()).toBe(0);
        expect(reload).not.toHaveBeenCalled();
        expect(mockIconManager.setTabProxyBadge).toHaveBeenCalledWith(
            51,
            expect.objectContaining({ kind: 'pool' }),
            false,
            false,
        );
    });

    it('concurrent: два одновременных гео-ответа одного пресета — одна запись исключения', async () => {
        // Маршрут пересобирается как настоящий: каждый вызов читает исключения из
        // storage и отдаёт пул без исключённых участников.
        mockProxyManager.getRouteForUrl.mockImplementation(
            () => poolRoute(MEMBERS.filter((m) => presetExclusions()[m.key] === undefined)),
        );

        // Первая обработка не завершается, пока тест сам не разрешит пересборку PAC.
        let releaseRefresh: () => void = () => {};
        mockProxyManager.refreshIfConnected.mockReturnValue(
            new Promise<void>((resolve) => {
                releaseRefresh = resolve;
            }),
        );

        handleGeoBlockResponse(mainFrameResponse(41, 451, '10.0.0.1'));
        await waitFor(() => Object.keys(presetExclusions()).length > 0);

        // Второй ответ несёт `ip` того же участника, но его маршрут уже без исключённого.
        handleGeoBlockResponse(mainFrameResponse(42, 451, '10.0.0.1'));
        releaseRefresh();
        await flushAsync();
        await flushAsync();

        const measured = {
            // Серия сайта и число перезагрузок — замеры для Result: ожидание задачи 27
            // задано только по числу записей исключения пресета.
            exclusionsCount: Object.keys(presetExclusions()).length,
            siteStreak: siteStreak(),
            reloads: reload.mock.calls.length,
        };
        // Инвариант задачи 27: одно одновременное событие — ровно одна запись
        // исключения пресета (дефект QA-183 исправлен в FIX-037).
        expect(measured).toMatchObject({ exclusionsCount: 1 });
    });
});
