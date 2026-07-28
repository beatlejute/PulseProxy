import { parseProxyString } from '../../src/shared/proxy-parser';

describe('parseProxyString()', () => {
    describe('URL-формат со схемой', () => {
        it('Тест 1: http://user:pass@1.2.3.4:8080 → все компоненты', () => {
            expect(parseProxyString('http://user:pass@1.2.3.4:8080')).toEqual({
                type: 'http', host: '1.2.3.4', port: 8080, username: 'user', password: 'pass',
            });
        });

        it('Тест 2: socks5://1.2.3.4:1080 → тип, хост, порт без кредов', () => {
            expect(parseProxyString('socks5://1.2.3.4:1080')).toEqual({
                type: 'socks5', host: '1.2.3.4', port: 1080,
            });
        });

        it('Тест 3: схема socks:// маппится в socks5', () => {
            expect(parseProxyString('socks://1.2.3.4:1080')).toEqual({
                type: 'socks5', host: '1.2.3.4', port: 1080,
            });
        });

        it('Тест 4: неизвестная схема (ftp://) → null', () => {
            expect(parseProxyString('ftp://1.2.3.4:8080')).toBeNull();
        });

        it('Тест 5: path после host:port отбрасывается', () => {
            expect(parseProxyString('http://1.2.3.4:8080/some/path')).toEqual({
                type: 'http', host: '1.2.3.4', port: 8080,
            });
        });
    });

    describe('креды через @', () => {
        it('Тест 6: user:pass@1.2.3.4:8080 без схемы', () => {
            expect(parseProxyString('user:pass@1.2.3.4:8080')).toEqual({
                host: '1.2.3.4', port: 8080, username: 'user', password: 'pass',
            });
        });

        it('Тест 7: пароль с @ внутри (user:p@ss@1.2.3.4:8080)', () => {
            expect(parseProxyString('user:p@ss@1.2.3.4:8080')).toEqual({
                host: '1.2.3.4', port: 8080, username: 'user', password: 'p@ss',
            });
        });

        it('Тест 8: только логин без пароля (user@1.2.3.4:8080)', () => {
            expect(parseProxyString('user@1.2.3.4:8080')).toEqual({
                host: '1.2.3.4', port: 8080, username: 'user',
            });
        });
    });

    describe('колоночные форматы', () => {
        it('Тест 9: ip:port:user:pass', () => {
            expect(parseProxyString('1.2.3.4:8080:user:pass')).toEqual({
                host: '1.2.3.4', port: 8080, username: 'user', password: 'pass',
            });
        });

        it('Тест 10: user:pass:ip:port', () => {
            expect(parseProxyString('user:pass:1.2.3.4:8080')).toEqual({
                host: '1.2.3.4', port: 8080, username: 'user', password: 'pass',
            });
        });

        it('Тест 11: неоднозначность (числовой пароль) решается по IP-подобному сегменту', () => {
            expect(parseProxyString('user:1234:1.2.3.4:8080')).toEqual({
                host: '1.2.3.4', port: 8080, username: 'user', password: '1234',
            });
        });

        it('Тест 12: ip:port:user (3 сегмента) → логин без пароля', () => {
            expect(parseProxyString('1.2.3.4:8080:user')).toEqual({
                host: '1.2.3.4', port: 8080, username: 'user',
            });
        });
    });

    describe('простые форматы', () => {
        it('Тест 13: ip:port', () => {
            expect(parseProxyString('1.2.3.4:8080')).toEqual({ host: '1.2.3.4', port: 8080 });
        });

        it('Тест 14: домен вместо IP (proxy.example.com:8080)', () => {
            expect(parseProxyString('proxy.example.com:8080')).toEqual({
                host: 'proxy.example.com', port: 8080,
            });
        });

        it('Тест 15: только хост', () => {
            expect(parseProxyString('1.2.3.4')).toEqual({ host: '1.2.3.4' });
            expect(parseProxyString('proxy.example.com')).toEqual({ host: 'proxy.example.com' });
        });

        it('Тест 16: пробелы по краям обрезаются', () => {
            expect(parseProxyString('  1.2.3.4:8080  ')).toEqual({ host: '1.2.3.4', port: 8080 });
        });
    });

    describe('невалидный ввод', () => {
        it('Тест 17: пустая строка и пробелы → null', () => {
            expect(parseProxyString('')).toBeNull();
            expect(parseProxyString('   ')).toBeNull();
        });

        it('Тест 18: пробелы внутри строки → null', () => {
            expect(parseProxyString('1.2.3.4 8080')).toBeNull();
        });

        it('Тест 19: нечисловой порт → null', () => {
            expect(parseProxyString('1.2.3.4:abc')).toBeNull();
        });

        it('Тест 20: порт вне диапазона (99999) → null', () => {
            expect(parseProxyString('1.2.3.4:99999')).toBeNull();
        });

        it('Тест 21: пустые сегменты (1.2.3.4:) → null', () => {
            expect(parseProxyString('1.2.3.4:')).toBeNull();
        });
    });
});
