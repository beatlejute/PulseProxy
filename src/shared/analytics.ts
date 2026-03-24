const DEBUG_MODE = false;
const GA4_MEASUREMENT_ID = 'G-J3GWC9H7DR';
const GA4_API_SECRET = '0xc6u0PrSUyMVilvqwk2cQ';
const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

const STORAGE_KEYS = {
  CLIENT_ID: 'ga4_client_id',
  INSTALL_TS: 'ga4_install_ts',
  ACTIVATION_COUNT: 'ga4_activation_count',
};

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getClientId(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CLIENT_ID);
  let clientId = result[STORAGE_KEYS.CLIENT_ID] as string | undefined;

  if (!clientId) {
    clientId = generateUUID();
    await chrome.storage.local.set({ [STORAGE_KEYS.CLIENT_ID]: clientId });
  }

  return clientId;
}

export async function sendGA4Event(
  eventName: string,
  params: Record<string, string | number | boolean>
): Promise<void> {
  const clientId = await getClientId();
  const body = {
    client_id: clientId,
    non_personalized_ads: false,
    events: [{
      name: eventName,
      params: {
        ...params,
        engagement_time_msec: '100',
        session_id: String(Date.now()),
      },
    }],
  };

  const url = `${GA4_ENDPOINT}?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function trackEvent(
  eventName: string,
  params: Record<string, string | number | boolean>
): Promise<void> {
  try {
    await sendGA4Event(eventName, params);
  } catch (error) {
    console.warn('GA4 trackEvent Error:', error);
  }
}

export function buildAffiliateUrl(baseUrl: string, placement: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('utm_source', 'pulseproxy');
  url.searchParams.set('utm_medium', 'extension');
  url.searchParams.set('utm_campaign', placement);
  return url.toString();
}
