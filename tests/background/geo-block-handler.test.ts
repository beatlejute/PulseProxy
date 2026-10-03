import { handleGeoBlockResponse, handleGeoBlockRedirect } from '../../src/background/geo-block-handler';
import { setMark, clearMarkIfNotMatching } from '../../src/background/geo-block-marks';
import { ProxyManager } from '../../src/background/proxy-manager';
import { IconManager } from '../../src/background/icon-manager';

jest.mock('../../src/background/geo-block-marks');
jest.mock('../../src/background/proxy-manager');
jest.mock('../../src/background/icon-manager');
jest.mock('../../src/shared/geo-block');
jest.mock('../../src/shared/storage');
jest.mock('../../src/shared/public-pool');

const mockSetMark = setMark as jest.MockedFunction<typeof setMark>;
const mockClearMarkIfNotMatching = clearMarkIfNotMatching as jest.MockedFunction<typeof clearMarkIfNotMatching>;
const mockProxyManager = ProxyManager as jest.Mocked<typeof ProxyManager>;
const mockIconManager = IconManager as jest.Mocked<typeof IconManager>;

// Mock classifyGeoBlock
jest.mock('../../src/shared/geo-block', () => ({
    classifyGeoBlock: jest.fn(),
}));

import { classifyGeoBlock } from '../../src/shared/geo-block';
const mockClassifyGeoBlock = classifyGeoBlock as jest.MockedFunction<typeof classifyGeoBlock>;

// Mock pickPoolChain
jest.mock('../../src/shared/public-pool', () => ({
    pickPoolChain: jest.fn(),
}));

import { pickPoolChain } from '../../src/shared/public-pool';
const mockPickPoolChain = pickPoolChain as jest.MockedFunction<typeof pickPoolChain>;

// Mock Storage
jest.mock('../../src/shared/storage', () => ({
    Storage: {
        getPresetGeoSite: jest.fn(),
        incrementPresetGeoSite: jest.fn(),
        addPresetGeoExclusion: jest.fn(),
        getPresetGeoExclusions: jest.fn(),
        resetPresetGeoSite: jest.fn(),
        getCurrentState: jest.fn(),
        setCurrentState: jest.fn(),
    },
}));

import { Storage } from '../../src/shared/storage';
const mockStorage = Storage as jest.Mocked<typeof Storage>;

// Mock chrome.tabs
(global.chrome as any) = {
    tabs: {
        reload: jest.fn(),
    },
};

describe('geo-block-handler', () => {
    describe('own proxy', () => {
        const ownRoute = { kind: 'own' as const, key: 'own-proxy' };

        beforeEach(() => {
            jest.clearAllMocks();
            mockProxyManager.getRouteForUrl.mockReturnValue(ownRoute);
        });

        it('own proxy: 451 on main_frame sets mark', () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true, code: 451 });

            const details = {
                tabId: 1,
                requestId: '1',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);

            expect(mockSetMark).toHaveBeenCalledWith(1, '1', 'example.com');
            expect(mockIconManager.setTabProxyBadge).toHaveBeenCalledWith(1, ownRoute, false, true);
        });

        it('own proxy: 403 on chatgpt.com sets mark for geo-block signature', () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true, code: 403 });

            const details = {
                tabId: 2,
                requestId: '2',
                url: 'https://chatgpt.com/path',
                type: 'main_frame' as const,
                statusCode: 403,
                responseHeaders: [],
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);

            expect(mockSetMark).toHaveBeenCalledWith(2, '2', 'chatgpt.com');
            expect(mockIconManager.setTabProxyBadge).toHaveBeenCalledWith(2, ownRoute, false, true);
        });

        it('own proxy: 403 on other host does not set mark', () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: false });

            const details = {
                tabId: 3,
                requestId: '3',
                url: 'https://other-domain.com/path',
                type: 'main_frame' as const,
                statusCode: 403,
                responseHeaders: [],
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);

            expect(mockSetMark).not.toHaveBeenCalled();
            expect(mockClearMarkIfNotMatching).toHaveBeenCalledWith(3, '3');
            expect(mockIconManager.setTabProxyBadge).toHaveBeenCalledWith(3, ownRoute, false, false);
        });

        it('own proxy: redirect claude.ai to app-unavailable-in-region sets mark', () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });

            const details = {
                tabId: 4,
                requestId: '4',
                url: 'https://claude.ai/path',
                type: 'main_frame' as const,
                statusCode: 302,
                redirectUrl: 'https://claude.com/app-unavailable-in-region',
            } as chrome.webRequest.OnBeforeRedirectDetails;

            handleGeoBlockRedirect(details);

            expect(mockSetMark).toHaveBeenCalledWith(4, '4', 'claude.ai');
            expect(mockIconManager.setTabProxyBadge).toHaveBeenCalledWith(4, ownRoute, false, true);
        });

        it('own proxy: ignores tabId less than 0', () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true, code: 451 });

            const details = {
                tabId: -1,
                requestId: '5',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);

            expect(mockSetMark).not.toHaveBeenCalled();
            expect(mockClearMarkIfNotMatching).not.toHaveBeenCalled();
            expect(mockIconManager.setTabProxyBadge).not.toHaveBeenCalled();
        });

        it('own proxy: does not modify currentState on geo-block', () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true, code: 451 });

            const details = {
                tabId: 6,
                requestId: '6',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);

            expect(mockSetMark).toHaveBeenCalled();
            // Гео-блок не ошибка подключения: обработчик не трогает состояние
            // подключения — ни записи, ни чтения currentState.
            expect(mockStorage.setCurrentState).not.toHaveBeenCalled();
            expect(mockStorage.getCurrentState).not.toHaveBeenCalled();
        });

        it('own proxy: mark carries the request host, not details.ip', () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true, code: 451 });

            const details = {
                tabId: 7,
                requestId: '7',
                url: 'https://example.com/private-page',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '192.0.2.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);

            // В отметку уходит только хост: ни ip ответа, ни адрес страницы
            // в аргументах не появляются.
            expect(mockSetMark).toHaveBeenCalledWith(7, '7', 'example.com');
            for (const call of mockSetMark.mock.calls) {
                expect(call).not.toContain('192.0.2.1');
                expect(call).not.toContain('https://example.com/private-page');
            }
            expect(mockStorage.addPresetGeoExclusion).not.toHaveBeenCalled();
        });
    });

    describe('pool', () => {
        const poolRoute = { kind: 'pool' as const, presetId: 'preset1', poolRule: 'rule1', poolMembers: [
            { key: 'member1', ip: '10.0.0.1', pac: 'SOCKS5 10.0.0.1:1080' },
            { key: 'member2', ip: '10.0.0.2', pac: 'SOCKS5 10.0.0.2:1081' },
            { key: 'member3', ip: '10.0.0.3', pac: 'SOCKS5 10.0.0.3:1082' },
        ]};

        beforeEach(() => {
            jest.clearAllMocks();
            jest.useFakeTimers();
            mockProxyManager.getRouteForUrl.mockReturnValue(poolRoute as any);
            mockProxyManager.refreshIfConnected.mockResolvedValue(undefined);
            mockPickPoolChain.mockReturnValue([
                'SOCKS5 10.0.0.1:1080',
                'SOCKS5 10.0.0.2:1081',
                'SOCKS5 10.0.0.3:1082',
            ]);
            (mockStorage.getPresetGeoSite as jest.Mock).mockResolvedValue({ streak: 1, stopped: false });
            (mockStorage.incrementPresetGeoSite as jest.Mock).mockResolvedValue({ streak: 2, stopped: false });
            (mockStorage.getPresetGeoExclusions as jest.Mock).mockResolvedValue({});
            (mockStorage.addPresetGeoExclusion as jest.Mock).mockResolvedValue(undefined);
            (mockStorage.resetPresetGeoSite as jest.Mock).mockResolvedValue(undefined);
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('pool: IP matches no member — head excluded', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });

            const details = {
                tabId: 11,
                requestId: '11',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '10.0.0.99',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.addPresetGeoExclusion).toHaveBeenCalledWith('preset1', 'member1', expect.any(Number));
        });

        it('pool: IP matches second member — second member excluded', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });

            const details = {
                tabId: 10,
                requestId: '10',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '10.0.0.2',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.addPresetGeoExclusion).toHaveBeenCalledWith('preset1', 'member2', expect.any(Number));
        });

        it('pool: exclusion writes for preset scope — proxy removed from all domains', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });

            const details = {
                tabId: 12,
                requestId: '12',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '10.0.0.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.addPresetGeoExclusion).toHaveBeenCalledWith('preset1', 'member1', expect.any(Number));
        });

        it('pool: 5th block in row — site stopped, mark set', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });
            (mockStorage.getPresetGeoSite as jest.Mock).mockResolvedValue({ streak: 4, stopped: false });
            (mockStorage.incrementPresetGeoSite as jest.Mock).mockResolvedValue({ streak: 5, stopped: true });

            const details = {
                tabId: 13,
                requestId: '13',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '10.0.0.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockSetMark).toHaveBeenCalledWith(13, '13', 'example.com');
        });

        it('pool: stopped site — no exclusion, mark set', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });
            (mockStorage.getPresetGeoSite as jest.Mock).mockResolvedValue({ streak: 5, stopped: true });

            const details = {
                tabId: 14,
                requestId: '14',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '10.0.0.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.addPresetGeoExclusion).not.toHaveBeenCalled();
            expect(mockSetMark).toHaveBeenCalledWith(14, '14', 'example.com');
        });

        it('pool: response without geo-block resets series', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: false });

            const details = {
                tabId: 15,
                requestId: '15',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 200,
                responseHeaders: [],
                ip: '10.0.0.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.resetPresetGeoSite).toHaveBeenCalledWith('preset1', 'rule1');
        });

        it('pool: single member — no exclusion, mark set', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });
            const singleMemberRoute = { kind: 'pool' as const, presetId: 'preset2', poolRule: 'rule2', poolMembers: [
                { key: 'member1', ip: '10.0.0.1', pac: 'SOCKS5 10.0.0.1:1080' },
            ]};
            mockProxyManager.getRouteForUrl.mockReturnValue(singleMemberRoute as any);
            mockPickPoolChain.mockReturnValue(['SOCKS5 10.0.0.1:1080']);

            const details = {
                tabId: 16,
                requestId: '16',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '10.0.0.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.addPresetGeoExclusion).not.toHaveBeenCalled();
            expect(mockSetMark).toHaveBeenCalledWith(16, '16', 'example.com');
        });

        it('pool: main_frame with exclusion — reload called', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });

            const details = {
                tabId: 17,
                requestId: '17',
                url: 'https://example.com',
                type: 'main_frame' as const,
                method: 'GET' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '10.0.0.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.addPresetGeoExclusion).toHaveBeenCalledWith('preset1', 'member1', expect.any(Number));
            expect(mockProxyManager.refreshIfConnected).toHaveBeenCalled();
            expect((global.chrome as any).tabs.reload).toHaveBeenCalledWith(17);
        });

        it('pool: main_frame POST — exclusion set, refresh called, reload not called', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });

            const details = {
                tabId: 20,
                requestId: '20',
                url: 'https://example.com',
                type: 'main_frame' as const,
                method: 'POST' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '10.0.0.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.addPresetGeoExclusion).toHaveBeenCalled();
            expect(mockProxyManager.refreshIfConnected).toHaveBeenCalled();
            expect((global.chrome as any).tabs.reload).not.toHaveBeenCalled();
        });

        it('pool: subrequest — exclusion set, no reload', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });

            const details = {
                tabId: 18,
                requestId: '18',
                url: 'https://api.openai.com/v1/models',
                type: 'xhr' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '10.0.0.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.addPresetGeoExclusion).toHaveBeenCalledWith('preset1', 'member1', expect.any(Number));
            expect(mockProxyManager.refreshIfConnected).not.toHaveBeenCalled();
        });

        it('pool: non-geo-blocked response — no exclusion', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: false });

            const details = {
                tabId: 19,
                requestId: '19',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 403,
                responseHeaders: [],
                ip: '10.0.0.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.addPresetGeoExclusion).not.toHaveBeenCalled();
        });

        it('pool: tabId less than 0 — ignored', () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });

            const details = {
                tabId: -1,
                requestId: '21',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 451,
                responseHeaders: [],
                ip: '10.0.0.1',
            } as chrome.webRequest.OnResponseStartedDetails;

            handleGeoBlockResponse(details);

            expect(mockStorage.getPresetGeoSite).not.toHaveBeenCalled();
        });

        it('pool: redirect with geo-block — exclusion set', async () => {
            mockClassifyGeoBlock.mockReturnValue({ geoBlocked: true });

            const details = {
                tabId: 22,
                requestId: '22',
                url: 'https://example.com',
                type: 'main_frame' as const,
                statusCode: 302,
                redirectUrl: 'https://example.com/blocked',
            } as chrome.webRequest.OnBeforeRedirectDetails;

            handleGeoBlockRedirect(details);
            await jest.runAllTimersAsync();

            expect(mockStorage.addPresetGeoExclusion).toHaveBeenCalledWith('preset1', 'member1', expect.any(Number));
        });
    });
});
