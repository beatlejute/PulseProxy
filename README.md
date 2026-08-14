# PulseProxy VPN

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-blue?logo=googlechrome)](https://chrome.google.com/webstore/detail/pulseproxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?logo=github)](https://github.com/beatlejute/PulseProxy)

A Chrome/Chromium (Manifest V3) browser extension for easy proxy management: multiple proxy servers, per-domain presets, a catalog of public proxies, and settings sync.

Current version: **1.4.0**

📖 [Privacy Policy](PRIVACY_POLICY.md) | 📝 [Changelog](CHANGELOG.md) | 🐛 [Report Issues](https://github.com/beatlejute/PulseProxy/issues)

## Features

### Proxy management
- **Multiple Proxy Types**: HTTP, HTTPS, SOCKS4, and SOCKS5
- **Proxy Authentication**: Built-in support for username/password authentication
- **Multi-proxy list**: Store several servers, mark one as default, assign a name and a color marker to each
- **Quick input parsing**: Paste `socks5://user:pass@host:port` or `host:port` — the form is filled in automatically
- **Proxy Health Check**: Optional automatic validation on add — dead or unreachable proxies are marked as error/timeout and are not silently treated as working
- **Public Proxies Catalog**: Built-in list of free proxies (updated in this repository) with filters, search by `IP:Port`, and background liveness checking with a 24-hour result cache

### Routing rules
- **Presets**: Group domains and bind them to a specific proxy; reorder presets by drag & drop
- **Preset Templates**: Ready-made domain sets (streaming, AI services, social networks, …) fetched from the repository
- **Domain Matching**: Exact (`example.com`) and wildcard subdomain (`*.example.com`) matching, with IDN/punycode support
- **Proxy All Sites Mode**: Route all traffic through the proxy by default
- **Ignore List**: Domains that always bypass the proxy

### Interface
- **Per-tab Badge**: The toolbar icon shows whether the current tab goes through a proxy — a flag/checkmark in the proxy's color, `ALL` for the "proxy all sites" mode, and an error indicator on failure
- **Full-page View**: Open the popup in a tab (3-column layout) via the toolbar button or the extension's Options page
- **Onboarding**: A welcome page on install with three ways to start — a step-by-step setup wizard, enabling sync, or importing a settings file
- **Themes**: Light and dark, following the OS setting by default
- **Settings Import/Export**: Save proxies, presets, and settings to a JSON file and restore them
- **Settings Sync**: Synchronize settings across devices via `chrome.storage.sync`
- **Multi-language Support**: Available in 8 languages — English, Deutsch, Español, Français, 日本語, Português, Русский, 中文

## Installation

### From Chrome Web Store

[Install PulseProxy VPN](https://chrome.google.com/webstore/detail/pulseproxy)

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/beatlejute/PulseProxy.git
   cd PulseProxy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project directory (the repository root, not `dist/`)

## Usage

1. Click the PulseProxy VPN icon in your browser toolbar
2. Add a proxy server in the "Proxy" tab
3. Create presets with domain rules in the "Presets" tab
4. Toggle the connection button to enable/disable the proxy
   - If you have only one proxy added, it is automatically selected when you turn the proxy on for the first time
   - If you have multiple proxies but none is selected as default, a "Select default proxy" modal will appear
5. Configure additional settings in the "Settings" tab

Use the button in the popup header to open the same interface in a full browser tab — handy for editing long domain lists.

### Adding a Proxy Server

1. Go to the "Proxy" tab
2. Click "Add Proxy"
3. Fill in the details:
   - **Name** (optional): A friendly name for the proxy; a leading flag emoji is used as the tab badge
   - **Color** (optional): Marker color shown in the list and used as the badge background
   - **Type**: HTTP, HTTPS, SOCKS4, or SOCKS5
   - **Host**: Proxy server address
   - **Port**: Proxy server port (1-65535)
   - **Authentication**: Enable and enter credentials if required
4. Click "Save"

After entering a proxy address, the extension verifies its availability (when "Check proxy before adding" is enabled in Settings). Dead or unreachable proxies receive an error indicator and are not silently treated as working.

### Using Public Proxies

1. Go to the "Proxy" tab and open the public proxies list
2. Filter by protocol, country, and speed, or search for a specific `IP:Port`
3. The extension checks entries in the background and sorts them by liveness; results are cached for 24 hours
4. Add a suitable proxy to your list in one click

> Public proxies are free and shared — they may be slow, unstable, and insecure. Do not send sensitive data through them.

### Creating Presets

1. Go to the "Presets" tab
2. Click "+ Add Preset" (or pick a ready-made template)
3. Configure the preset:
   - Enter a name for the preset
   - Select a proxy server
   - Add domain rules (one per line)
4. Use wildcards for subdomain matching: `*.example.com`

## Development

### Prerequisites

- Node.js 20 or higher
- npm

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build the extension (esbuild → `dist/`) |
| `npm run watch` | Build and watch for changes (sourcemaps, no minification) |
| `npm run clean` | Remove build artifacts |
| `npm run type-check` | Run TypeScript type checking |
| `npm test` | Run unit and integration tests (Jest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report (thresholds: 70% lines/statements/functions, 65% branches) |
| `npm run package` | Build and create a ZIP archive for the Chrome Web Store |
| `npx playwright test` | Run E2E tests (Playwright, real Chromium with the extension loaded) |

`update-proxies` / `update-proxies:local` are maintainer-only scripts that refresh [sources/proxys.json](sources/proxys.json); the script itself is not part of the public repository.

### Project Structure

```
PulseProxy/
├── src/
│   ├── background/           # Service worker
│   │   ├── index.ts          # Message routing, alarms, webNavigation, install/onboarding
│   │   ├── icon-manager.ts   # Toolbar icon and per-tab badges
│   │   └── proxy-manager.ts  # PAC generation, proxy on/off, health check
│   ├── popup/                # Popup and full-page UI
│   │   ├── index.ts          # Entry point, tab wiring
│   │   ├── proxy-list.ts     # Proxy list, proxy-form-modal.ts — add/edit form
│   │   ├── presets.ts        # Presets, preset-dialogs.ts / preset-drag.ts
│   │   ├── public-proxies-modal.ts, public-proxy-check.ts
│   │   ├── settings.ts, tabs.ts, ui.ts
│   │   ├── tour.ts           # Setup wizard
│   │   ├── theme-init.ts, theme-resolver.ts, view-mode.ts
│   │   └── dialog.ts, modal-*.ts, safe-dom.ts, dom-utils.ts
│   ├── storage/              # Storage layer
│   │   ├── storage.ts, storage-lock.ts, sync-service.ts
│   │   ├── proxy-repository.ts, preset-repository.ts
│   │   ├── import-export-service.ts, migration-service.ts
│   │   └── public-proxy-check-cache.ts, merge-utils.ts
│   ├── shared/               # Shared utilities
│   │   ├── constants.ts, i18n.ts, storage.ts
│   │   ├── domain-matcher.ts, punycode.ts, proxy-parser.ts
│   │   └── remote-config.ts, fetch-with-fallback.ts, analytics.ts
│   ├── welcome/              # Welcome page script
│   └── types/                # TypeScript types
├── tests/
│   ├── background/, popup/, storage/, shared/, welcome/   # Unit tests (Jest)
│   ├── integration/                             # Integration tests (Jest)
│   └── e2e/                                     # E2E tests (Playwright, with snapshots)
├── _locales/                 # Internationalization files (8 locales)
├── sources/                  # Public data: proxys.json, presets.json, config.json
├── icons/                    # Extension icons
├── manifest.json             # Extension manifest (MV3)
├── popup.html                # Popup / full-page UI
├── welcome.html              # Onboarding page
├── options.html              # Options page (redirects to the full-page view)
└── style.css                 # Styles
```

### Testing

- **Unit and integration** — Jest + jsdom, `npm test`
- **E2E** — Playwright launches a real Chromium with the unpacked extension; includes visual regression tests (snapshots live next to the specs in `tests/e2e/*-snapshots/`). Run `npm run build` before the E2E suite.

Code is written following TDD, SOLID, and DRY.

## Permissions

| Permission | Purpose |
|------------|---------|
| `proxy` | Configure browser proxy settings |
| `storage` | Save settings, proxies, and presets |
| `webRequest` | Handle proxy authentication challenges |
| `webRequestAuthProvider` | Provide authentication credentials |
| `webNavigation` | Detect which site a tab loads to show the per-tab badge |
| `tabs` | Per-tab badges and opening the full-page view |
| `alarms` | Periodic background tasks (heartbeat) |
| `<all_urls>` | Apply proxy settings to all websites |
| `https://www.google-analytics.com/*` | Send anonymous usage statistics |

## Privacy and network requests

- **Your data stays on your device**: proxies, credentials, and presets are stored in `chrome.storage` and are never transmitted anywhere. If you enable sync, they are synchronized through your Google account by Chrome itself.
- **Browsing traffic is not collected**: the extension does not log visited pages or their contents.
- **Anonymous usage statistics**: the extension sends aggregated events (install, onboarding, proxy activation, health-check result, promo-link clicks) to Google Analytics 4 with a randomly generated client ID. No host names, credentials, or browsing history are included.
- **Requests to the repository**: the public proxy list, preset templates, and remote configuration are fetched from GitHub (with a jsDelivr fallback).

Read the full [Privacy Policy](PRIVACY_POLICY.md).

## License

MIT License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [Chrome Web Store](https://chrome.google.com/webstore/detail/pulseproxy)
- [GitHub Repository](https://github.com/beatlejute/PulseProxy)
- [Report Issues](https://github.com/beatlejute/PulseProxy/issues)
- [Privacy Policy](PRIVACY_POLICY.md)
- [Changelog](CHANGELOG.md)
