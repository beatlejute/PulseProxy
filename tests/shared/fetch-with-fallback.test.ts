import { fetchWithFallback } from '../../src/shared/fetch-with-fallback';

// Мок для fetch API
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('fetchWithFallback', () => {
    beforeEach(() => {
        mockFetch.mockClear();
    });

    describe('успешные сценарии', () => {
        it('должен вернуть данные с первого URL если он успешен', async () => {
            const mockData = { key: 'value' };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockData),
            } as Response);

            const result = await fetchWithFallback(['https://primary.com/api']);
            expect(result).toEqual(mockData);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledWith('https://primary.com/api', undefined);
        });

        it('должен использовать fallback если первый URL не удался', async () => {
            const mockData = { key: 'value' };
            mockFetch
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockData),
                } as Response);

            const result = await fetchWithFallback([
                'https://primary.com/api',
                'https://fallback.com/api',
            ]);
            expect(result).toEqual(mockData);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('должен использовать fallback если первый вернул ошибку HTTP', async () => {
            const mockData = { key: 'value' };
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                } as Response)
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockData),
                } as Response);

            const result = await fetchWithFallback([
                'https://primary.com/api',
                'https://fallback.com/api',
            ]);
            expect(result).toEqual(mockData);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('должен вернуть данные со второго fallback URL', async () => {
            const mockData = { key: 'value' };
            mockFetch
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockData),
                } as Response);

            const result = await fetchWithFallback([
                'https://primary.com/api',
                'https://fallback1.com/api',
                'https://fallback2.com/api',
            ]);
            expect(result).toEqual(mockData);
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });

        it('должен передавать options в fetch', async () => {
            const mockData = { key: 'value' };
            const options: RequestInit = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: 'test' }),
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockData),
            } as Response);

            await fetchWithFallback(['https://api.com'], options);
            expect(mockFetch).toHaveBeenCalledWith('https://api.com', options);
        });
    });

    describe('ошибки', () => {
        it('должен выбросить ошибку если все URL не удались', async () => {
            mockFetch
                .mockRejectedValueOnce(new Error('Network error 1'))
                .mockRejectedValueOnce(new Error('Network error 2'))
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                } as Response);

            await expect(
                fetchWithFallback([
                    'https://url1.com/api',
                    'https://url2.com/api',
                    'https://url3.com/api',
                ])
            ).rejects.toThrow('HTTP 500');
        });

        it('должен выбросить ошибку если передан пустой массив URL', async () => {
            await expect(fetchWithFallback([])).rejects.toThrow(
                'fetchWithFallback: at least one URL is required'
            );
        });

        it('должен выбросить ошибку если передан null вместо URL', async () => {
            await expect(fetchWithFallback(null as unknown as string[])).rejects.toThrow(
                'fetchWithFallback: at least one URL is required'
            );
        });

        it('должен выбросить ошибку если все URL вернули HTTP ошибки', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                } as Response)
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                } as Response);

            await expect(
                fetchWithFallback(['https://url1.com/api', 'https://url2.com/api'])
            ).rejects.toThrow('HTTP 500');
        });
    });

    describe('edge cases', () => {
        it('должен корректно обрабатывать не-Error исключения', async () => {
            mockFetch.mockRejectedValueOnce('string error');

            await expect(fetchWithFallback(['https://url.com/api'])).rejects.toThrow(
                'string error'
            );
        });

        it('должен работать с разными типами данных', async () => {
            const mockArray = [1, 2, 3];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockArray),
            } as Response);

            const result = await fetchWithFallback<number[]>('https://api.com' as never);
            expect(result).toEqual(mockArray);
        });

        it('должен работать с пустым ответом', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({}),
            } as Response);

            const result = await fetchWithFallback<Record<string, never>>(
                'https://api.com' as never
            );
            expect(result).toEqual({});
        });
    });
});
