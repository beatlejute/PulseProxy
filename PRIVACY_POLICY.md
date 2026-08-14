# Privacy Policy for PulseProxy VPN

Last updated: August 14, 2026

## Overview

PulseProxy VPN is a browser extension that helps you manage and switch between proxy servers. This privacy policy explains what data the extension stores, what it sends, and to whom.

## What stays on your device

All of your configuration is stored locally using Chrome's storage APIs and is **never** transmitted to the developer:

- Proxy server configurations (host, port, type, name, color)
- Authentication credentials (if you choose to save them)
- Presets and domain rules
- Extension preferences and settings

### Chrome Sync (optional)

If you enable the "Sync settings" option, your proxies, presets, theme, and language are synchronized through `chrome.storage.sync` — that is, through your own Google account, by Chrome itself. Sync is off by default and can be turned off at any time in the extension settings.

## What the extension does NOT collect

- No browsing history, page URLs, or page contents
- No traffic that passes through the proxy
- No proxy usernames or passwords — credentials never leave your device
- No keystrokes, form data, or clipboard contents

## Anonymous usage statistics

The extension sends aggregated product-usage events to **Google Analytics 4** (Measurement Protocol). Events are tied to a random identifier (UUID) generated on first run and stored locally; it is not linked to your Google account, e-mail, or any other identity.

| Event | Data sent |
|-------|-----------|
| `extension_installed` | Extension version, browser language, install source |
| `onboarding_started` | Extension version, install/update reason |
| `extension_active_session` | Days since install, total number of proxy activations, extension version, whether a proxy is configured, number of presets |
| `proxy_activated` | Proxy protocol (http/https/socks4/socks5), activation counter, time since install |
| `proxy_test_success` / `proxy_test_failure` | Proxy protocol and the **address of the tested proxy** (`type://host:port`), and the error reason on failure |
| `affiliate_link_clicked` | Provider name, placement of the link in the UI, target URL |

Notes:

- The `proxy_test_*` events include the address (host and port) of the proxy being checked. They never include the username or password.
- As with any HTTP request, Google's servers receive standard request metadata, including your IP address.
- Analytics currently cannot be disabled from the extension's settings. If you do not want these events sent, you can block requests to `www.google-analytics.com`, or build and load the extension from source with analytics removed.

## Other network requests made by the extension

| Request | Destination | Purpose |
|---------|-------------|---------|
| Public proxy list | `raw.githubusercontent.com` → fallback `cdn.jsdelivr.net` | Fetch `sources/proxys.json` for the public proxies catalog |
| Preset templates | `raw.githubusercontent.com` → fallback `cdn.jsdelivr.net` | Fetch ready-made domain sets |
| Remote configuration | `raw.githubusercontent.com` → fallback `cdn.jsdelivr.net` | Fetch the current promo/referral link |
| Proxy health check | `http://example.com/?_pulse_check=<random-id>` **through the proxy being tested** | Verify that the proxy actually works |

These requests contain no personal data. The health-check request is deliberately routed through the proxy under test, so that proxy's operator sees it — as they would see any request you send through them.

## Third parties

- **Google Analytics** — receives the anonymous usage events listed above.
- **GitHub / jsDelivr** — serve the static data files listed above; they see the request as a normal file download.
- **Proxy operators** — any proxy you enable, and especially the free public proxies from the built-in catalog, can see, log, and modify the traffic you route through it. PulseProxy does not operate these servers and cannot vouch for them. Do not send sensitive data through public proxies.
- **Referral links** — promo links in the interface are opened with `utm_source` / `utm_medium` / `utm_campaign` parameters, so the destination site can attribute the visit to the extension. No personal data is added.

## Permissions

| Permission | Purpose |
|------------|---------|
| `proxy` | Core functionality — configure browser proxy settings |
| `storage` | Save your preferences, proxies, and presets locally |
| `webRequest` | Intercept authentication challenges from proxy servers |
| `webRequestAuthProvider` | Provide saved credentials for proxy authentication |
| `webNavigation` | Detect which site a tab loads, to show the per-tab proxy badge and verify the proxy health check |
| `tabs` | Per-tab badges and opening the extension in a full browser tab |
| `alarms` | Periodic background tasks (session heartbeat) |
| `<all_urls>` | Apply proxy settings to all websites as per your configuration |
| `https://www.google-analytics.com/*` | Send the anonymous usage events described above |

## Security

- Proxy configurations and credentials remain on your device, or within Chrome's own sync, and are never sent to the developer
- Credentials are stored using Chrome's storage APIs and are supplied only to the proxy server you configured
- The extension's own outbound requests are limited to the destinations listed in this policy

## Children's Privacy

PulseProxy does not knowingly collect any information from children under 13 years of age.

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last updated" date at the top of this document.

## Contact

If you have any questions about this privacy policy or the extension, please:

- Open an issue on GitHub: https://github.com/beatlejute/PulseProxy/issues
- Visit the repository: https://github.com/beatlejute/PulseProxy

## Open Source

PulseProxy is open source software. You can review the complete source code at:
https://github.com/beatlejute/PulseProxy
