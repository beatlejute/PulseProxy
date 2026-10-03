/**
 * QA-182 (PLAN-020, задачи 23–24): обработка гео-блока на маршруте своего прокси
 * с настоящим классификатором и настоящими утверждениями о storage.
 *
 * Отличие от `geo-block-handler.test.ts`: там `src/shared/geo-block` и
 * `src/shared/storage` заменены моками, поэтому проверяется реакция на заданный
 * итог классификатора, а не сама классификация. Здесь оба модуля настоящие:
 * решение «гео-блок или нет» принимает `classifyGeoBlock` по URL, типу запроса,
 * коду ответа и адресу редиректа, а `currentState` и содержимое хранилища
 * читаются из in-memory мока `chrome` (`tests/__mocks__/chrome.ts`, подключает
 * `tests/setup.ts`). Заменены моком только зависимости обработчика:
 * `ProxyManager` (маршрут вкладки) и `IconManager` (бейдж).
 *
 * Тест не пишет на диск.
 */
import { handleGeoBlockResponse, handleGeoBlockRedirect } from '../../src/background/geo-block-handler';
import { getMark, clearMark } from '../../src/background/geo-block-marks';
import { ProxyManager } from '../../src/background/proxy-manager';
import { IconManager } from '../../src/background/icon-manager';
import { Storage } from '../../src/shared/storage';
import { mockHelpers } from '../__mocks__/chrome';

jest.mock('../../src/background/proxy-manager');
jest.mock('../../src/background/icon-manager');

const mockProxyManager = ProxyManager as jest.Mocked<typeof ProxyManager>;
const mockIconManager = IconManager as jest.Mocked<typeof IconManager>;

const ownRoute = { kind: 'own' as const, key: 'own-proxy' };

// Вкладки этого файла — отметки модуля geo-block-marks живут в памяти процесса
// и переживают отдельный тест, поэтому чистим их после каждого.
const TAB_IDS = [31, 32, 33, 34, 35, 36, 37];

type ResponseDetails = chrome.webRequest.OnResponseStartedDetails;

function responseDetails(tabId: number, url: string, statusCode: number, ip?: string): ResponseDetails {
    return {
        tabId,
        requestId: String(tabId),
        url,
        type: 'main_frame' as const,
        method: 'GET' as const,
        statusCode,
        responseHeaders: [],
        ...(ip ? { ip } : {}),
    } as ResponseDetails;
}

describe('own proxy with classifier', () => {
    beforeEach(() => {
        mockProxyManager.getRouteForUrl.mockReturnValue(ownRoute);
    });

    afterEach(() => {
        TAB_IDS.forEach(clearMark);
    });

    it('451 на main_frame — отметка есть', () => {
        handleGeoBlockResponse(responseDetails(31, 'https://example.com/article', 451));

        expect(getMark(31)?.host).toBe('example.com');
        expect(mockIconManager.setTabProxyBadge).toHaveBeenCalledWith(31, ownRoute, false, true);
    });

    it('редирект claude.ai на app-unavailable-in-region — отметка есть', () => {
        const details = {
            tabId: 32,
            requestId: '32',
            url: 'https://claude.ai/chat',
            type: 'main_frame' as const,
            method: 'GET' as const,
            statusCode: 302,
            redirectUrl: 'https://claude.com/app-unavailable-in-region',
        } as chrome.webRequest.OnBeforeRedirectDetails;

        handleGeoBlockRedirect(details);

        expect(getMark(32)?.host).toBe('claude.ai');
        expect(mockIconManager.setTabProxyBadge).toHaveBeenCalledWith(32, ownRoute, false, true);
    });

    it('403 на chatgpt.com — отметка есть', () => {
        handleGeoBlockResponse(responseDetails(33, 'https://chatgpt.com/c/abc', 403));

        expect(getMark(33)?.host).toBe('chatgpt.com');
        expect(mockIconManager.setTabProxyBadge).toHaveBeenCalledWith(33, ownRoute, false, true);
    });

    it('403 на другом хосте — отметки нет', () => {
        handleGeoBlockResponse(responseDetails(34, 'https://other-host.example/page', 403));

        expect(getMark(34)).toBeUndefined();
        expect(mockIconManager.setTabProxyBadge).toHaveBeenCalledWith(34, ownRoute, false, false);
    });

    it('tabId = -1 — ответ игнорируется', () => {
        handleGeoBlockResponse(responseDetails(-1, 'https://example.com/article', 451));

        expect(getMark(-1)).toBeUndefined();
        expect(mockProxyManager.getRouteForUrl).not.toHaveBeenCalled();
        expect(mockIconManager.setTabProxyBadge).not.toHaveBeenCalled();
    });

    it('currentState в storage после обработки равен значению до неё', async () => {
        await Storage.setCurrentState('connected');
        await Storage.setTargetState('disconnected');

        const before = await Storage.getCurrentState();
        const rawBefore = mockHelpers.getLocalStorageData().currentState;

        handleGeoBlockResponse(responseDetails(35, 'https://example.com/article', 451));

        const after = await Storage.getCurrentState();
        const rawAfter = mockHelpers.getLocalStorageData().currentState;

        // Обработчик вообще не трогает состояние подключения: значение то же,
        // что и до ответа, — и по чтению через Storage, и по сырому хранилищу.
        expect(before).toBe('connected');
        expect(after).toBe(before);
        expect(rawAfter).toEqual(rawBefore);
        expect(getMark(35)?.host).toBe('example.com');
    });

    it('после ответа с ip ни в chrome.storage.local, ни в chrome.storage.sync нет ip или URL ответа', async () => {
        const privateUrl = 'https://privacy-check.example/account?token=secret';
        const clientIp = '203.0.113.77';

        await Storage.setCurrentState('connected');
        await Storage.setTargetState('connected');
        mockHelpers.setSyncStorageData({ theme: 'dark', language: 'ru' });

        handleGeoBlockResponse(responseDetails(36, privateUrl, 451, clientIp));

        const local = mockHelpers.getLocalStorageData();
        const sync = mockHelpers.getSyncStorageData();
        const stored = JSON.stringify({ local, sync });

        // Хранилище заполнено — перебор значений не вакуумный.
        expect(Object.keys(local).length).toBeGreaterThan(0);
        expect(Object.keys(sync).length).toBeGreaterThan(0);
        // Ответ обработан (отметка поставлена), поэтому «в storage пусто» здесь
        // не объясняется тем, что обработчик не сработал.
        expect(getMark(36)?.host).toBe('privacy-check.example');

        for (const value of [...Object.values(local), ...Object.values(sync)]) {
            expect(JSON.stringify(value)).not.toContain(clientIp);
            expect(JSON.stringify(value)).not.toContain(privateUrl);
        }
        expect(stored).not.toContain(clientIp);
        expect(stored).not.toContain(privateUrl);
        // Вторая половина инварианта «в storage не пишутся и никуда не
        // отправляются» (PLAN-020, задача 23): обработка ответа не делает
        // сетевых вызовов.
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('451 без сигнатуры на подзапросе — отметки нет', () => {
        const details = {
            ...responseDetails(37, 'https://example.com/article', 451),
            type: 'xhr' as const,
        } as ResponseDetails;

        handleGeoBlockResponse(details);

        // Сигнатура any-451 объявлена только для main_frame (constants.ts:159),
        // поэтому настоящий классификатор отвечает «не гео-блок».
        expect(getMark(37)).toBeUndefined();
        expect(mockIconManager.setTabProxyBadge).toHaveBeenCalledWith(37, ownRoute, false, false);
    });
});
