import { encodePunycode, decodePunycode, toASCII } from '../../src/shared/punycode';

describe('punycode.ts', () => {
    describe('encodePunycode()', () => {
        it('should return ASCII string as-is (no encoding needed)', () => {
            // ASCII-only strings don't need encoding, returned as-is
            expect(encodePunycode('example')).toBe('example');
        });

        it('should encode Cyrillic domain "пример"', () => {
            const result = encodePunycode('пример');
            expect(result).toMatch(/^[a-z0-9-]+$/);
            expect(result.length).toBeGreaterThan(0);
        });

        it('should encode mixed ASCII/Cyrillic', () => {
            const result = encodePunycode('testпример');
            expect(result).toMatch(/^[a-z0-9-]+$/);
            // Должен содержать basic chars в начале
            expect(result.startsWith('test-')).toBe(true);
        });

        it('should handle empty string', () => {
            expect(encodePunycode('')).toBe('');
        });

        it('should handle single non-ASCII character', () => {
            expect(encodePunycode('т')).toMatch(/^[a-z0-9-]+$/);
        });
    });

    describe('decodePunycode()', () => {
        it('should decode basic ASCII string unchanged', () => {
            expect(decodePunycode('example')).toBe('example');
        });

        it('should decode Punycode with delimiter back to Cyrillic', () => {
            // Используем результат encodePunycode для проверки
            const original = 'пример';
            const encoded = encodePunycode(original);
            // encoded должен содержать delimiter если есть non-ASCII
            expect(encoded).toContain('-');
            const decoded = decodePunycode(encoded);
            expect(decoded).toBe(original);
        });

        it('should be inverse of encode for mixed ASCII/Cyrillic', () => {
            const original = 'testпример';
            const encoded = encodePunycode(original);
            const decoded = decodePunycode(encoded);
            expect(decoded).toBe(original);
        });

        it('should handle empty string', () => {
            expect(decodePunycode('')).toBe('');
        });

        it('should be inverse of encode for various non-ASCII inputs', () => {
            const testCases = ['пример', 'тест', 'abcтест', 'тест123', 'яндекс', 'рф'];
            testCases.forEach(original => {
                const encoded = encodePunycode(original);
                const decoded = decodePunycode(encoded);
                expect(decoded).toBe(original);
            });
        });
    });

    describe('toASCII()', () => {
        it('should return ASCII domain unchanged', () => {
            expect(toASCII('example.com')).toBe('example.com');
        });

        it('should encode Cyrillic domain to Punycode', () => {
            const result = toASCII('пример.рф');
            expect(result).toMatch(/^xn--[a-z0-9-]+\.xn--[a-z0-9-]+$/);
        });

        it('should handle wildcard prefix with Cyrillic domain', () => {
            const result = toASCII('*.пример.рф');
            expect(result).toMatch(/^\*\.xn--[a-z0-9-]+\.xn--[a-z0-9-]+$/);
        });

        it('should handle mixed ASCII/Cyrillic domain', () => {
            const result = toASCII('testпример.com');
            expect(result).toMatch(/^xn--[a-z0-9-]+\.com$/);
        });

        it('should handle subdomains with mixed content', () => {
            const result = toASCII('sub.пример.example.com');
            expect(result).toBe('sub.xn--e1afmkfd.example.com');
        });

        it('should handle domain with only some labels non-ASCII', () => {
            const result = toASCII('example.пример.com');
            expect(result).toMatch(/^example\.xn--[a-z0-9-]+\.com$/);
        });

        it('should handle empty string', () => {
            expect(toASCII('')).toBe('');
        });

        it('should handle single-label non-ASCII domain', () => {
            const result = toASCII('рф');
            expect(result).toBe('xn--p1ai');
        });
    });

    describe('real-world domains', () => {
        it('should handle common Russian domains', () => {
            const yandexResult = toASCII('яндекс.рф');
            expect(yandexResult).toMatch(/^xn--[a-z0-9-]+\.xn--[a-z0-9-]+$/);
            
            const googleResult = toASCII('гугл.com');
            expect(googleResult).toMatch(/^xn--[a-z0-9-]+\.com$/);
        });

        it('should handle Chinese domains', () => {
            const result = toASCII('百度.com');
            expect(result).toMatch(/^xn--[a-z0-9-]+\.com$/);
        });

        it('should handle Arabic domains', () => {
            const result = toASCII('جوجل.com');
            expect(result).toMatch(/^xn--[a-z0-9-]+\.com$/);
        });

        it('should handle emoji domains (if supported)', () => {
            expect(() => toASCII('😀.com')).not.toThrow();
        });
    });

    describe('edge cases', () => {
        it('should handle consecutive hyphens in ASCII labels', () => {
            expect(toASCII('ex--ample.com')).toBe('ex--ample.com');
        });

        it('should handle numbers in domain', () => {
            const result = toASCII('пример123.com');
            expect(result).toMatch(/^xn--[a-z0-9-]+\.com$/);
        });

        it('should handle long domain names', () => {
            const longDomain = 'оченьдлинныйподдомен.пример.рф';
            const result = toASCII(longDomain);
            expect(result).toMatch(/^xn--[a-z0-9-]+\.xn--[a-z0-9-]+\.xn--[a-z0-9-]+$/);
            expect(result.length).toBeLessThan(254); // Max domain length
        });

        it('should preserve case in ASCII labels', () => {
            expect(toASCII('Example.COM')).toBe('Example.COM');
        });
    });

    describe('round-trip conversion', () => {
        const testDomains = [
            'example.com',
            'пример.рф',
            '*.яндекс.ru',
            'sub.гугл.com',
            'test123.пример.org',
        ];

        testDomains.forEach(domain => {
            it(`should produce valid ASCII output for "${domain}"`, () => {
                const ascii = toASCII(domain);
                // Verify the ASCII output is valid for PAC scripts
                expect(ascii).toMatch(/^[\w.*-]+(\.[\w*-]+)*$/);
            });
        });
    });
});
