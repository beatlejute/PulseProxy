import { GeoBlockConfig, GeoBlockSignatures } from './constants';

export interface GeoBlockResult {
  geoBlocked: boolean;
  signalId?: string;
  service?: string;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().trim();
}

function hostMatches(urlHost: string, sigHosts: readonly string[]): boolean {
  const h = normalizeHost(urlHost);
  if (!h) return false;
  for (const sh of sigHosts) {
    const shNorm = normalizeHost(sh);
    if (shNorm === '*') return true;
    if (h === shNorm) return true;
    if (h.endsWith('.' + shNorm)) return true;
  }
  return false;
}

function redirectMatches(
  redirectUrl: string | undefined,
  redirectHost?: string,
  redirectHostStartsWith?: string,
  redirectPathRegex?: RegExp,
): boolean {
  if (!redirectUrl) return false;
  try {
    const url = new URL(redirectUrl);
    if (redirectHost) {
      const h = normalizeHost(url.host);
      if (h !== normalizeHost(redirectHost)) return false;
    }
    if (redirectHostStartsWith) {
      if (!redirectUrl.toLowerCase().startsWith(redirectHostStartsWith.toLowerCase())) return false;
    }
    if (redirectPathRegex) {
      if (!redirectPathRegex.test(url.pathname)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hasChallengeHeader(
  responseHeaders?: Array<{ name: string; value?: string }> | Record<string, string>,
): boolean {
  if (!responseHeaders) return false;
  const headerName = GeoBlockConfig.CHALLENGE_HEADER.toLowerCase();
  const headerValue = GeoBlockConfig.CHALLENGE_VALUE.toLowerCase();

  if (Array.isArray(responseHeaders)) {
    return responseHeaders.some((h) => {
      const name = (h.name || '').toLowerCase();
      const value = (h.value || '').toLowerCase();
      return name === headerName && value === headerValue;
    });
  }

  for (const [name, value] of Object.entries(responseHeaders)) {
    if (name.toLowerCase() === headerName && (value || '').toLowerCase() === headerValue) {
      return true;
    }
  }
  return false;
}

export function classifyGeoBlock(
  routeKind: 'pool' | 'own',
  requestType?: string,
  url?: string,
  statusCode?: number,
  redirectUrl?: string,
  responseHeaders?: Array<{ name: string; value?: string }> | Record<string, string>,
): GeoBlockResult {
  const urlHost = url ? (() => { try { return new URL(url).host; } catch { return ''; } })() : '';
  const reqType = (requestType || '').toLowerCase();

  for (const sig of GeoBlockSignatures) {
    if (!sig.routes.includes(routeKind as 'pool' | 'own')) continue;

    if (sig.requestType === 'main_frame') {
      if (reqType !== 'main_frame') continue;
    }

    // Подзапросы к хостам не из таблицы не считаются гео-блоком
    if (reqType !== 'main_frame' && sig.hosts.includes('*')) {
      continue;
    }

    if (!hostMatches(urlHost, sig.hosts)) continue;

    if (sig.signalType === 'status') {
      if (statusCode !== sig.statusCode) continue;
      if (sig.id === 'any-403-pool' && hasChallengeHeader(responseHeaders)) {
        continue;
      }
      return { geoBlocked: true, signalId: sig.id, service: sig.service };
    }

    if (sig.signalType === 'redirect') {
      if (statusCode !== sig.statusCode) continue;
      if (!redirectMatches(redirectUrl, sig.redirectHost, sig.redirectHostStartsWith, sig.redirectPathRegex)) {
        continue;
      }
      return { geoBlocked: true, signalId: sig.id, service: sig.service };
    }
  }

  return { geoBlocked: false };
}
