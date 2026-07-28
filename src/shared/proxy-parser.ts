import { ProxyType } from '../types';

export interface ParsedProxyString {
    type?: ProxyType;
    host: string;
    port?: number;
    username?: string;
    password?: string;
}

const SCHEME_TO_TYPE: Record<string, ProxyType> = {
    http: 'http',
    https: 'https',
    socks4: 'socks4',
    socks5: 'socks5',
    socks: 'socks5',
};

function isValidPort(value: string): boolean {
    if (!/^\d{1,5}$/.test(value)) return false;
    const port = parseInt(value, 10);
    return port >= 1 && port <= 65535;
}

function isIpLike(value: string): boolean {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}

function build(base: Omit<ParsedProxyString, 'host' | 'port'>, host: string, port?: string, username?: string, password?: string): ParsedProxyString {
    const result: ParsedProxyString = { ...base, host };
    if (port !== undefined) result.port = parseInt(port, 10);
    if (username !== undefined) result.username = username;
    if (password !== undefined) result.password = password;
    return result;
}

/**
 * Разбирает строку прокси в любом распространённом формате:
 * scheme://user:pass@host:port, user:pass@host:port,
 * host:port:user:pass, user:pass:host:port, host:port, host.
 * Возвращает null, если строка не распознана.
 */
export function parseProxyString(input: string): ParsedProxyString | null {
    let rest = input.trim();
    if (!rest || /\s/.test(rest)) return null;

    let type: ProxyType | undefined;
    const schemeMatch = rest.match(/^([a-z][a-z0-9+.-]*):\/\//i);
    if (schemeMatch) {
        type = SCHEME_TO_TYPE[schemeMatch[1].toLowerCase()];
        if (!type) return null;
        rest = rest.slice(schemeMatch[0].length);
    }

    const slashIndex = rest.indexOf('/');
    if (slashIndex !== -1) rest = rest.slice(0, slashIndex);

    let username: string | undefined;
    let password: string | undefined;
    const atIndex = rest.lastIndexOf('@');
    if (atIndex !== -1) {
        const credentials = rest.slice(0, atIndex);
        rest = rest.slice(atIndex + 1);
        const sep = credentials.indexOf(':');
        if (sep === -1) {
            username = credentials || undefined;
        } else {
            username = credentials.slice(0, sep) || undefined;
            password = credentials.slice(sep + 1) || undefined;
        }
    }

    const segments = rest.split(':');
    if (segments.some(s => !s)) return null;

    const base = type !== undefined ? { type } : {};

    if (username !== undefined || password !== undefined) {
        if (segments.length === 1) return build(base, segments[0], undefined, username, password);
        if (segments.length === 2 && isValidPort(segments[1])) {
            return build(base, segments[0], segments[1], username, password);
        }
        return null;
    }

    switch (segments.length) {
        case 1:
            return build(base, segments[0]);
        case 2:
            return isValidPort(segments[1]) ? build(base, segments[0], segments[1]) : null;
        case 3:
            return isValidPort(segments[1])
                ? build(base, segments[0], segments[1], segments[2])
                : null;
        case 4: {
            const hostFirst = isValidPort(segments[1]);
            const credsFirst = isValidPort(segments[3]);
            if (hostFirst && credsFirst) {
                // Оба варианта возможны — хостом считаем IP-подобный сегмент
                return isIpLike(segments[2]) && !isIpLike(segments[0])
                    ? build(base, segments[2], segments[3], segments[0], segments[1])
                    : build(base, segments[0], segments[1], segments[2], segments[3]);
            }
            if (hostFirst) return build(base, segments[0], segments[1], segments[2], segments[3]);
            if (credsFirst) return build(base, segments[2], segments[3], segments[0], segments[1]);
            return null;
        }
        default:
            return null;
    }
}
