import { withStorageLock } from '../../src/storage/storage-lock';

describe('withStorageLock', () => {
    it('serializes operations on the same key (no interleaving)', async () => {
        const events: string[] = [];
        const op = (label: string) => async (): Promise<string> => {
            events.push(`${label}:start`);
            await new Promise((r) => setTimeout(r, 10));
            events.push(`${label}:end`);
            return label;
        };

        const [a, b] = await Promise.all([
            withStorageLock('k', op('A')),
            withStorageLock('k', op('B')),
        ]);

        expect(a).toBe('A');
        expect(b).toBe('B');
        // B стартует только после того, как A полностью завершился
        expect(events).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
    });

    it('allows concurrency across different keys', async () => {
        const events: string[] = [];
        const op = (label: string) => async (): Promise<void> => {
            events.push(`${label}:start`);
            await new Promise((r) => setTimeout(r, 10));
            events.push(`${label}:end`);
        };

        await Promise.all([
            withStorageLock('k1', op('A')),
            withStorageLock('k2', op('B')),
        ]);

        // Разные ключи идут параллельно: оба старта раньше любого из концов
        expect(events.slice(0, 2).sort()).toEqual(['A:start', 'B:start']);
    });

    it('a rejected operation does not block the next on the same key', async () => {
        await expect(
            withStorageLock('k', async () => {
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');

        const result = await withStorageLock('k', async () => 'ok');
        expect(result).toBe('ok');
    });
});
