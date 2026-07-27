export const DEFAULT_FETCH_TIMEOUT_MS = 5000;

export interface FetchWithFallbackOptions extends RequestInit {
    /** Таймаут одного запроса в мс; по истечении запрос абортится и берётся следующий URL */
    timeoutMs?: number;
}

/**
 * Fetches a resource from multiple URLs with fallback support.
 * Tries URLs in order and returns the result of the first successful request.
 * Each attempt is aborted after `timeoutMs` (default 5000 ms) so a stalled
 * connection can't hang the caller — critical for popup UI responsiveness.
 *
 * @template T - The expected response type
 * @param {string[]} urls - Array of URLs to try in order
 * @param {FetchWithFallbackOptions} [options] - Optional fetch options + timeoutMs
 * @returns {Promise<T>} - The parsed JSON response from the first successful URL
 * @throws {Error} - If all URLs fail
 */
export async function fetchWithFallback<T>(
    urls: string[],
    options?: FetchWithFallbackOptions
): Promise<T> {
    if (!urls || urls.length === 0) {
        throw new Error('fetchWithFallback: at least one URL is required');
    }

    const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, ...fetchOptions } = options ?? {};

    let lastError: Error | null = null;

    for (const url of urls) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Continue to next URL
        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError || new Error('fetchWithFallback: all URLs failed');
}
