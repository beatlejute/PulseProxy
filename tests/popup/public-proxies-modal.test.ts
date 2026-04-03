/**
 * @jest-environment jsdom
 */

import { validateIpPortFormat } from '../../src/popup/public-proxies-modal';

jest.mock('../../src/shared/i18n', () => ({
    I18n: {
        getMessage: jest.fn((key: string) => key),
        applyTranslations: jest.fn(),
    },
}));

jest.mock('../../src/shared/analytics', () => ({
    trackEvent: jest.fn().mockResolvedValue(undefined),
    buildAffiliateUrl: jest.fn((url: string, placement: string) => `${url}?utm_source=${placement}`),
}));

jest.mock('../../src/shared/remote-config', () => ({
    RemoteConfig: { referralLink: 'https://example.com/ref' },
}));

jest.mock('../../src/popup/proxy-form-modal', () => ({
    checkProxyBeforeAdd: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/shared/storage', () => ({
    Storage: {
        getProxyCheckEnabled: jest.fn().mockResolvedValue(false),
    },
}));

describe('validateIpPortFormat()', () => {
    it('Тест 1: валидный IP:Port (1.2.3.4:8080) → возвращает true, подсказка не показывается', () => {
        const input = '1.2.3.4:8080';
        const isValid = validateIpPortFormat(input);
        const showHint = input.length >= 4 && !isValid;

        expect(isValid).toBe(true);
        expect(showHint).toBe(false);
    });

    it('Тест 2: невалидный IP:Port длиной 4+ символа (not-an-ip) → возвращает false, подсказка показывается', () => {
        const input = 'not-an-ip';
        const isValid = validateIpPortFormat(input);
        const showHint = input.length >= 4 && !isValid;

        expect(isValid).toBe(false);
        expect(showHint).toBe(true);
    });

    it('Тест 3: короткая строка менее 4 символов (abc) → подсказка не показывается', () => {
        const input = 'abc';
        const showHint = input.length >= 4 && !validateIpPortFormat(input);

        expect(showHint).toBe(false);
    });
});
