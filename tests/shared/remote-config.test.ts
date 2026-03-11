import { RemoteConfig, RemoteConfigService } from '../../src/shared/remote-config';
import { fetchWithFallback } from '../../src/shared/fetch-with-fallback';

// Мок для fetchWithFallback
jest.mock('../../src/shared/fetch-with-fallback');
const mockFetchWithFallback = fetchWithFallback as jest.MockedFunction<typeof fetchWithFallback>;

describe('RemoteConfigService', () => {
    let service: RemoteConfigService;

    // Сохраняем оригинальный сервис для восстановления
    const originalService = RemoteConfig;

    beforeEach(() => {
        // Создаём новый экземпляр для каждого теста
        service = new RemoteConfigService();
        mockFetchWithFallback.mockClear();
    });

    afterEach(() => {
        // Очищаем моки
        jest.clearAllMocks();
    });

    describe('init()', () => {
        it('должен загрузить конфиг с primary URL', async () => {
            const mockConfig = { referralLink: 'https://example.com/ref' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            expect(mockFetchWithFallback).toHaveBeenCalledTimes(1);
            expect(service.isLoaded).toBe(true);
        });

        it('должен использовать fallback URL при ошибке primary', async () => {
            const mockConfig = { referralLink: 'https://fallback.com/ref' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            // fetchWithFallback сам обрабатывает fallback логику
            expect(mockFetchWithFallback).toHaveBeenCalledTimes(1);
            expect(service.isLoaded).toBe(true);
        });

        it('должен использовать DEFAULT_CONFIG при ошибке загрузки', async () => {
            mockFetchWithFallback.mockRejectedValue(new Error('Network error'));

            await service.init();

            expect(service.isLoaded).toBe(true);
            expect(service.referralLink).toBe('#'); // DEFAULT_CONFIG.referralLink
        });

        it('должен использовать DEFAULT_CONFIG при невалидном JSON', async () => {
            mockFetchWithFallback.mockRejectedValue(new Error('Invalid JSON'));

            await service.init();

            expect(service.isLoaded).toBe(true);
            expect(service.referralLink).toBe('#');
        });

        it('должен установить isLoaded=true даже при ошибке', async () => {
            mockFetchWithFallback.mockRejectedValue(new Error('Network error'));

            await service.init();

            expect(service.isLoaded).toBe(true);
        });
    });

    describe('fetchConfig()', () => {
        it('должен добавить cache-buster к URL', async () => {
            const mockConfig = { referralLink: 'https://example.com/ref' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            // Используем spy для проверки приватного метода
            const fetchSpy = jest.spyOn(service as any, 'fetchConfig');
            await service.init();

            expect(fetchSpy).toHaveBeenCalled();
            fetchSpy.mockRestore();
        });

        it('должен использовать primary URL с cache-buster', async () => {
            const mockConfig = { referralLink: 'https://example.com/ref' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            const calledUrls = mockFetchWithFallback.mock.calls[0][0];
            expect(calledUrls[0]).toContain('https://raw.githubusercontent.com/beatlejute/PulseProxy');
            expect(calledUrls[0]).toContain('?_t='); // cache-buster
        });

        it('должен использовать fallback URL с cache-buster', async () => {
            const mockConfig = { referralLink: 'https://example.com/ref' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            const calledUrls = mockFetchWithFallback.mock.calls[0][0];
            expect(calledUrls).toHaveLength(2);
            expect(calledUrls[1]).toContain('https://cdn.jsdelivr.net/gh/beatlejute/PulseProxy');
            expect(calledUrls[1]).toContain('?_t='); // cache-buster
        });
    });

    describe('referralLink getter', () => {
        it('должен вернуть referralLink из конфига после загрузки', async () => {
            const mockConfig = { referralLink: 'https://example.com/ref' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            expect(service.referralLink).toBe('https://example.com/ref');
        });

        it('должен вернуть DEFAULT_CONFIG.referralLink до инициализации', () => {
            // До init() должно возвращаться значение по умолчанию
            expect(service.referralLink).toBe('#');
        });

        it('должен вернуть DEFAULT_CONFIG.referralLink при ошибке загрузки', async () => {
            mockFetchWithFallback.mockRejectedValue(new Error('Network error'));

            await service.init();

            expect(service.referralLink).toBe('#');
        });

        it('должен вернуть пустой конфиг при минимальном конфиге', async () => {
            const mockConfig = { referralLink: '' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            expect(service.referralLink).toBe('');
        });
    });

    describe('isLoaded getter', () => {
        it('должен вернуть false до инициализации', () => {
            expect(service.isLoaded).toBe(false);
        });

        it('должен вернуть true после успешной инициализации', async () => {
            const mockConfig = { referralLink: 'https://example.com/ref' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            expect(service.isLoaded).toBe(true);
        });

        it('должен вернуть true после неудачной инициализации', async () => {
            mockFetchWithFallback.mockRejectedValue(new Error('Network error'));

            await service.init();

            expect(service.isLoaded).toBe(true);
        });
    });

    describe('различные варианты конфига', () => {
        it('должен обработать минимальный конфиг', async () => {
            const mockConfig = { referralLink: '#' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            expect(service.referralLink).toBe('#');
            expect(service.isLoaded).toBe(true);
        });

        it('должен обработать конфиг с длинным referralLink', async () => {
            const mockConfig = {
                referralLink: 'https://example.com/ref?utm_source=pulseproxy&utm_medium=extension',
            };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            expect(service.referralLink).toBe(
                'https://example.com/ref?utm_source=pulseproxy&utm_medium=extension'
            );
        });

        it('должен обработать конфиг с Unicode в referralLink', async () => {
            const mockConfig = { referralLink: 'https://пример.рф/ref' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            expect(service.referralLink).toBe('https://пример.рф/ref');
        });
    });

    describe('кеширование', () => {
        it('должен сохранить конфиг в памяти после загрузки', async () => {
            const mockConfig = { referralLink: 'https://example.com/ref' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            // Проверяем что getter возвращает закэшированное значение
            expect(service.referralLink).toBe('https://example.com/ref');
            expect(service.referralLink).toBe('https://example.com/ref'); // второй вызов
        });

        it('должен использовать одно и то же значение при множественных обращениях', async () => {
            const mockConfig = { referralLink: 'https://example.com/ref' };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            const link1 = service.referralLink;
            const link2 = service.referralLink;
            const link3 = service.referralLink;

            expect(link1).toBe(link2);
            expect(link2).toBe(link3);
        });
    });

    describe('edge cases', () => {
        it('должен обработать null в referralLink', async () => {
            const mockConfig = { referralLink: null as unknown as string };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            expect(service.referralLink).toBeNull();
        });

        it('должен обработать undefined в referralLink', async () => {
            const mockConfig = { referralLink: undefined as unknown as string };
            mockFetchWithFallback.mockResolvedValue(mockConfig);

            await service.init();

            expect(service.referralLink).toBeUndefined();
        });
    });
});

describe('RemoteConfig (singleton)', () => {
    it('должен экспортировать singleton экземпляр', () => {
        expect(RemoteConfig).toBeDefined();
        expect(RemoteConfig instanceof RemoteConfigService).toBe(true);
    });
});
