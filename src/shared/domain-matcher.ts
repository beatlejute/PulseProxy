/**
 * Проверяет, соответствует ли домен шаблону с поддержкой wildcards.
 *
 * @param domain - Домен для проверки (например, "sub.example.com")
 * @param pattern - Шаблон для сопоставления (например, "*.example.com" или "example.com")
 * @returns true если домен соответствует шаблону
 *
 * @example
 * matchesDomain('sub.example.com', '*.example.com') // true
 * matchesDomain('example.com', '*.example.com')     // false (точное совпадение требуется)
 * matchesDomain('example.com', 'example.com')       // true
 * matchesDomain('other.com', '*.example.com')       // false
 */
export function matchesDomain(domain: string, pattern: string): boolean {
    if (pattern.startsWith('*.')) {
        const base = pattern.substring(2);
        return (
            domain.length > base.length &&
            domain.endsWith('.' + base)
        );
    }
    return domain === pattern;
}

/**
 * Проверяет, находится ли домен в списке исключений.
 *
 * @param domain - Домен для проверки
 * @param excludeList - Список шаблонов для исключения (поддерживает wildcards)
 * @returns true если домен совпадает с любым шаблоном в списке исключений
 *
 * @example
 * isExcluded('api.example.com', ['*.example.com', 'test.com']) // true
 * isExcluded('other.com', ['*.example.com', 'test.com'])       // false
 */
export function isExcluded(domain: string, excludeList: string[]): boolean {
    return excludeList.some(pattern => matchesDomain(domain, pattern));
}
