# PulseProxy VPN

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-blue?logo=googlechrome)](https://chrome.google.com/webstore/detail/pulseproxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?logo=github)](https://github.com/beatlejute/PulseProxy)

A Chrome/Chromium browser extension for easy proxy management with support for multiple proxy servers, presets, and settings synchronization.

📖 [Privacy Policy](PRIVACY_POLICY.md) | 🐛 [Report Issues](https://github.com/beatlejute/PulseProxy/issues)

## Features

- **Multiple Proxy Types**: Support for HTTP, HTTPS, SOCKS4, and SOCKS5 proxies
- **Proxy Authentication**: Built-in support for username/password authentication
- **Presets**: Create and manage proxy presets with domain-specific rules
- **Domain Matching**: 
  - Exact domain matching (`example.com`)
  - Wildcard subdomain matching (`*.example.com`)
- **Ignore List**: Define domains that should bypass the proxy
- **Proxy All Sites Mode**: Option to proxy all traffic by default
- **Settings Sync**: Synchronize your settings across devices using Chrome sync
- **Proxy Health Check**: Automatic validation of proxy availability — dead or unreachable proxies are marked as error/timeout and not silently treated as working
- **Multi-language Support**: Available in 8 languages:
  - English
  - Deutsch (German)
  - Español (Spanish)
  - Français (French)
  - 日本語 (Japanese)
  - Português (Portuguese)
  - Русский (Russian)
  - 中文 (Chinese)

## Installation

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
   - Select the project directory

## Development

### Prerequisites

- Node.js (v16 or higher recommended)
- npm

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build the extension |
| `npm run watch` | Build and watch for changes |
| `npm run clean` | Remove build artifacts |
| `npm run type-check` | Run TypeScript type checking |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run package` | Create ZIP archive for Chrome Web Store |

### Project Structure

```
pulse-proxy/
├── src/
│   ├── background/       # Service worker scripts
│   │   ├── index.ts
│   │   ├── icon-manager.ts
│   │   └── proxy-manager.ts
│   ├── popup/             Popup UI scripts
│   │   ├── index.ts
│   │   ├── presets.ts
│   │   ├── proxy-list.ts
│   │   ├── settings.ts
│   │   ├── tabs.ts
│   │   └── ui.ts
│   ├── shared/           # Shared utilities
│   │   ├── constants.ts
│   │   ├── i18n.ts
│   │   └── storage.ts
│   └── types/            # TypeScript types
│       └── index.ts
├── _locales/             # Internationalization files
├── icons/                # Extension icons
├── tests/                # Test files
├── manifest.json         # Extension manifest
├── popup.html            # Popup HTML
└── style.css             # Popup styles
```

## Usage

1. Click the PulseProxy VPN icon in your browser toolbar
2. Add a proxy server in the "Proxy" tab
3. Create presets with domain rules in the "Presets" tab
4. Toggle the connection button to enable/disable the proxy
   - If you have only one proxy added, it is automatically selected when you turn the proxy on for the first time.
   - If you have multiple proxies but none is selected as default, a "Select default proxy" modal will appear.
5. Configure additional settings in the "Settings" tab

### Adding a Proxy Server

1. Go to the "Proxy" tab
2. Click "Add Proxy"
3. Fill in the details:
   - **Name** (optional): A friendly name for the proxy
   - **Type**: HTTP, HTTPS, SOCKS4, or SOCKS5
   - **Host**: Proxy server address
   - **Port**: Proxy server port (1-65535)
   - **Authentication**: Enable and enter credentials if required
4. Click "Save"

After entering a proxy address, the extension automatically verifies its availability (when automatic proxy checking is enabled). Dead or unreachable proxies receive an error indicator and are not silently treated as working.

### Creating Presets

1. Go to the "Presets" tab
2. Click "+ Add Preset"
3. Configure the preset:
   - Enter a name for the preset
   - Select a proxy server
   - Add domain rules (one per line)
4. Use wildcards for subdomain matching: `*.example.com`

## Permissions

The extension requires the following permissions:

- `proxy`: To configure browser proxy settings
- `storage`: To save extension settings
- `webRequest`: To handle proxy authentication
- `webRequestAuthProvider`: To provide authentication credentials
- `<all_urls>`: To apply proxy settings to all websites

## Privacy

PulseProxy VPN respects your privacy:
- **No data collection**: We don't collect, transmit, or share any personal data
- **Local storage**: All settings are stored locally on your device
- **Open source**: Full source code is available for review

Read our full [Privacy Policy](PRIVACY_POLICY.md).

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [Chrome Web Store](https://chrome.google.com/webstore/detail/pulseproxy)
- [GitHub Repository](https://github.com/beatlejute/PulseProxy)
- [Report Issues](https://github.com/beatlejute/PulseProxy/issues)
- [Privacy Policy](PRIVACY_POLICY.md)