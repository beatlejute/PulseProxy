/**
 * Fetches a resource from multiple URLs with fallback support.
 * Tries URLs in order and returns the result of the first successful request.
 *
 * @template T - The expected response type
 * @param {string[]} urls - Array of URLs to try in order
 * @param {RequestInit} [options] - Optional fetch options
 * @returns {Promise<T>} - The parsed JSON response from the first successful URL
 * @throws {Error} - If all URLs fail
 */
export async function fetchWithFallback<T>(
    urls: string[],
    options?: RequestInit
): Promise<T> {
    if (!urls || urls.length === 0) {
        throw new Error('fetchWithFallback: at least one URL is required');
    }

    let lastError: Error | null = null;

    for (const url of urls) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Continue to next URL
        }
    }

    throw lastError || new Error('fetchWithFallback: all URLs failed');
}
