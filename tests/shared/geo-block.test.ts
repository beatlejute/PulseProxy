import { classifyGeoBlock } from '../../src/shared/geo-block';
import { GeoBlockConfig } from '../../src/shared/constants';

describe('classifyGeoBlock', () => {
  // ChatGPT: 403 on main_frame
  describe('ChatGPT 403', () => {
    test('pool route detects 403 on main_frame', () => {
      const result = classifyGeoBlock('pool', 'main_frame', 'https://chatgpt.com/', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('chatgpt');
    });

    test('own route detects 403 on main_frame', () => {
      const result = classifyGeoBlock('own', 'main_frame', 'https://chatgpt.com/', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('chatgpt');
    });
  });

  // OpenAI API: 403 on any request type
  describe('OpenAI API 403', () => {
    test('pool route detects 403 on main_frame', () => {
      const result = classifyGeoBlock('pool', 'main_frame', 'https://api.openai.com/v1/models', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('openai-api');
    });

    test('pool route detects 403 on subrequest', () => {
      const result = classifyGeoBlock('pool', 'xhr', 'https://api.openai.com/v1/models', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('openai-api');
    });

    test('own route detects 403 on main_frame', () => {
      const result = classifyGeoBlock('own', 'main_frame', 'https://api.openai.com/v1/models', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('openai-api');
    });

    test('own route detects 403 on subrequest', () => {
      const result = classifyGeoBlock('own', 'xhr', 'https://api.openai.com/v1/models', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('openai-api');
    });
  });

  // Anthropic API: 403 on any request type
  describe('Anthropic API 403', () => {
    test('pool route detects 403 on main_frame', () => {
      const result = classifyGeoBlock('pool', 'main_frame', 'https://api.anthropic.com/v1/messages', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('anthropic-api');
    });

    test('own route detects 403 on any request', () => {
      const result = classifyGeoBlock('own', 'fetch', 'https://api.anthropic.com/v1/messages', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('anthropic-api');
    });
  });

  // Claude: redirect to app-unavailable-in-region
  describe('Claude redirect', () => {
    test('pool route detects redirect on main_frame', () => {
      const result = classifyGeoBlock(
        'pool',
        'main_frame',
        'https://claude.ai/',
        302,
        'https://claude.com/app-unavailable-in-region'
      );
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('claude');
    });

    test('own route detects redirect on main_frame', () => {
      const result = classifyGeoBlock(
        'own',
        'main_frame',
        'https://claude.ai/chat',
        302,
        'https://claude.com/app-unavailable-in-region?redirect=/chat'
      );
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('claude');
    });
  });

  // Netflix: 403 on main_frame
  describe('Netflix 403', () => {
    test('pool route detects 403 on www.netflix.com', () => {
      const result = classifyGeoBlock('pool', 'main_frame', 'https://www.netflix.com/', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('netflix');
    });

    test('own route detects 403 on help.netflix.com', () => {
      const result = classifyGeoBlock('own', 'main_frame', 'https://help.netflix.com/en/', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('netflix');
    });
  });

  // Spotify: redirect to why-not-available
  describe('Spotify redirect', () => {
    test('pool route detects redirect to why-not-available/en', () => {
      const result = classifyGeoBlock(
        'pool',
        'main_frame',
        'https://accounts.spotify.com/login',
        301,
        'https://www.spotify.com/en/why-not-available/'
      );
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('spotify');
    });

    test('own route detects redirect with other region', () => {
      const result = classifyGeoBlock(
        'own',
        'main_frame',
        'https://accounts.spotify.com/login',
        301,
        'https://www.spotify.com/int/why-not-available/'
      );
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('spotify');
    });

    test('pool route does NOT detect login redirect (not geo-block)', () => {
      const result = classifyGeoBlock(
        'pool',
        'main_frame',
        'https://accounts.spotify.com/login',
        301,
        'https://accounts.spotify.com/login?continue=/'
      );
      expect(result.geoBlocked).toBe(false);
    });
  });

  // Any 451: on both routes
  describe('Any site 451', () => {
    test('pool route detects 451 on main_frame', () => {
      const result = classifyGeoBlock('pool', 'main_frame', 'https://example.com/', 451);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('any-451');
    });

    test('own route detects 451 on main_frame', () => {
      const result = classifyGeoBlock('own', 'main_frame', 'https://example.com/', 451);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('any-451');
    });

    test('pool route does NOT detect 451 on subrequest', () => {
      const result = classifyGeoBlock('pool', 'xhr', 'https://example.com/api', 451);
      expect(result.geoBlocked).toBe(false);
    });
  });

  // Any 403 pool: pool only, no challenge header
  describe('Any site 403 (pool only)', () => {
    test('pool route detects 403 on main_frame', () => {
      const result = classifyGeoBlock('pool', 'main_frame', 'https://example.com/', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('any-403-pool');
    });

    test('own route does NOT detect 403', () => {
      const result = classifyGeoBlock('own', 'main_frame', 'https://example.com/', 403);
      expect(result.geoBlocked).toBe(false);
    });

    test('pool route does NOT detect 403 on subrequest', () => {
      const result = classifyGeoBlock('pool', 'xhr', 'https://example.com/api', 403);
      expect(result.geoBlocked).toBe(false);
    });
  });

  // Edge case: Challenge header
  describe('Challenge header (Cloudflare)', () => {
    test('pool route with cf-mitigated:challenge header is NOT geo-block', () => {
      const result = classifyGeoBlock(
        'pool',
        'main_frame',
        'https://example.com/',
        403,
        undefined,
        [{ name: 'cf-mitigated', value: 'challenge' }]
      );
      expect(result.geoBlocked).toBe(false);
    });

    test('pool route with cf-mitigated header in record format', () => {
      const result = classifyGeoBlock(
        'pool',
        'main_frame',
        'https://example.com/',
        403,
        undefined,
        { 'cf-mitigated': 'challenge' }
      );
      expect(result.geoBlocked).toBe(false);
    });

    test('pool route with different header value is geo-block', () => {
      const result = classifyGeoBlock(
        'pool',
        'main_frame',
        'https://example.com/',
        403,
        undefined,
        [{ name: 'cf-mitigated', value: 'other' }]
      );
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('any-403-pool');
    });
  });

  // Edge case: Subrequest to non-signature host
  describe('Subrequest to non-signature host', () => {
    test('subrequest to example.com does NOT trigger any-403-pool', () => {
      const result = classifyGeoBlock('pool', 'xhr', 'https://example.com/data', 403);
      expect(result.geoBlocked).toBe(false);
    });

    test('subrequest to cdn does NOT trigger any-451', () => {
      const result = classifyGeoBlock('pool', 'fetch', 'https://cdn.example.com/script.js', 451);
      expect(result.geoBlocked).toBe(false);
    });
  });

  // Edge case: Host case insensitivity
  describe('Case insensitivity', () => {
    test('ChatGPT.COM uppercase is detected', () => {
      const result = classifyGeoBlock('pool', 'main_frame', 'https://CHATGPT.COM/', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('chatgpt');
    });

    test('Mixed case api.OpenAI.com is detected', () => {
      const result = classifyGeoBlock('pool', 'main_frame', 'https://api.OpenAI.Com/v1', 403);
      expect(result.geoBlocked).toBe(true);
      expect(result.signalId).toBe('openai-api');
    });

    test('cf-mitigated header case insensitive', () => {
      const result = classifyGeoBlock(
        'pool',
        'main_frame',
        'https://example.com/',
        403,
        undefined,
        [{ name: 'CF-MITIGATED', value: 'CHALLENGE' }]
      );
      expect(result.geoBlocked).toBe(false);
    });
  });

  // Edge case: No geo-block signals
  describe('No geo-block', () => {
    test('200 response is not geo-block', () => {
      const result = classifyGeoBlock('pool', 'main_frame', 'https://example.com/', 200);
      expect(result.geoBlocked).toBe(false);
    });

    test('301 without redirect signal is not geo-block', () => {
      const result = classifyGeoBlock('pool', 'main_frame', 'https://example.com/', 301, 'https://other.com/');
      expect(result.geoBlocked).toBe(false);
    });

    test('missing URL still works (empty string check)', () => {
      const result = classifyGeoBlock('pool', 'main_frame', '', 403);
      expect(result.geoBlocked).toBe(false);
    });

    test('undefined request type still works', () => {
      const result = classifyGeoBlock('pool', undefined, 'https://example.com/', 403);
      expect(result.geoBlocked).toBe(false);
    });
  });
});
