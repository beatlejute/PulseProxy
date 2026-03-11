import { matchesDomain, isExcluded } from '../../src/shared/domain-matcher';

describe('domain-matcher.ts', () => {
    describe('matchesDomain()', () => {
        describe('wildcard patterns (*.example.com)', () => {
            it('should match subdomain', () => {
                expect(matchesDomain('sub.example.com', '*.example.com')).toBe(true);
            });

            it('should match nested subdomain', () => {
                expect(matchesDomain('nested.sub.example.com', '*.example.com')).toBe(true);
            });

            it('should NOT match exact domain (without subdomain)', () => {
                expect(matchesDomain('example.com', '*.example.com')).toBe(false);
            });

            it('should NOT match different domain', () => {
                expect(matchesDomain('other.com', '*.example.com')).toBe(false);
            });

            it('should NOT match partial domain', () => {
                expect(matchesDomain('notexample.com', '*.example.com')).toBe(false);
            });
        });

        describe('exact match patterns', () => {
            it('should match exact domain', () => {
                expect(matchesDomain('example.com', 'example.com')).toBe(true);
            });

            it('should NOT match subdomain for exact pattern', () => {
                expect(matchesDomain('sub.example.com', 'example.com')).toBe(false);
            });

            it('should NOT match different domain', () => {
                expect(matchesDomain('other.com', 'example.com')).toBe(false);
            });

            it('should handle case sensitivity', () => {
                expect(matchesDomain('Example.com', 'example.com')).toBe(false);
            });
        });

        describe('edge cases', () => {
            it('should handle single-label domain', () => {
                expect(matchesDomain('localhost', 'localhost')).toBe(true);
                expect(matchesDomain('localhost', '*.localhost')).toBe(false);
            });

            it('should handle deeply nested subdomains', () => {
                expect(matchesDomain('a.b.c.example.com', '*.example.com')).toBe(true);
            });

            it('should handle IDN domains (ASCII form)', () => {
                expect(matchesDomain('xn--e1aybc.xn--p1ai', 'xn--e1aybc.xn--p1ai')).toBe(true);
                expect(matchesDomain('sub.xn--e1aybc.xn--p1ai', '*.xn--e1aybc.xn--p1ai')).toBe(true);
            });

            it('should handle empty strings', () => {
                expect(matchesDomain('', '')).toBe(true);
                expect(matchesDomain('example.com', '')).toBe(false);
                expect(matchesDomain('', '*.example.com')).toBe(false);
            });

            it('should handle domains with hyphens', () => {
                expect(matchesDomain('my-example.com', 'my-example.com')).toBe(true);
                expect(matchesDomain('sub.my-example.com', '*.my-example.com')).toBe(true);
            });
        });
    });

    describe('isExcluded()', () => {
        it('should return false for empty exclude list', () => {
            expect(isExcluded('example.com', [])).toBe(false);
        });

        it('should return true if domain matches any pattern', () => {
            const excludeList = ['*.example.com', 'test.com', 'blocked.org'];
            expect(isExcluded('sub.example.com', excludeList)).toBe(true);
            expect(isExcluded('test.com', excludeList)).toBe(true);
            expect(isExcluded('blocked.org', excludeList)).toBe(true);
        });

        it('should return false if domain does not match any pattern', () => {
            const excludeList = ['*.example.com', 'test.com'];
            expect(isExcluded('other.com', excludeList)).toBe(false);
            expect(isExcluded('example.com', excludeList)).toBe(false);
        });

        it('should handle wildcard exclusions', () => {
            const excludeList = ['*.example.com'];
            expect(isExcluded('api.example.com', excludeList)).toBe(true);
            expect(isExcluded('deep.nested.example.com', excludeList)).toBe(true);
            expect(isExcluded('example.com', excludeList)).toBe(false);
        });

        it('should handle mixed exact and wildcard patterns', () => {
            const excludeList = ['*.example.com', 'exact.com', '*.blocked.org'];
            expect(isExcluded('sub.example.com', excludeList)).toBe(true);
            expect(isExcluded('exact.com', excludeList)).toBe(true);
            expect(isExcluded('test.blocked.org', excludeList)).toBe(true);
            expect(isExcluded('safe.com', excludeList)).toBe(false);
        });

        it('should handle IDN domains in exclude list', () => {
            const excludeList = ['*.xn--e1aybc.xn--p1ai', 'xn--test.xn--p1ai'];
            expect(isExcluded('sub.xn--e1aybc.xn--p1ai', excludeList)).toBe(true);
            expect(isExcluded('xn--test.xn--p1ai', excludeList)).toBe(true);
            expect(isExcluded('example.com', excludeList)).toBe(false);
        });
    });
});
