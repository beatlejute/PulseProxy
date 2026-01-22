# Privacy Policy for PulseProxy

Last updated: January 22, 2026

## Overview

PulseProxy is a browser extension that helps you manage and switch between proxy servers. This privacy policy explains how PulseProxy handles your data.

## Data Collection

**PulseProxy does NOT collect, transmit, or share any personal data.**

- No analytics or tracking
- No data sent to external servers
- No user behavior monitoring
- No advertising or marketing data collection

## Data Storage

All data is stored **locally on your device** using Chrome's built-in storage APIs:

### Local Storage
- Proxy server configurations (host, port, type)
- Authentication credentials (if you choose to save them)
- Extension preferences and settings
- Custom presets

### Chrome Sync (Optional)
If you enable Chrome Sync in your browser, your extension settings may be synchronized across your devices through your Google account. This is a standard Chrome feature and is controlled by your Chrome sync settings.

## Permissions

PulseProxy requires the following permissions to function:

| Permission | Purpose |
|------------|---------|
| `proxy` | Core functionality - configure browser proxy settings |
| `storage` | Save your preferences and proxy configurations locally |
| `webRequest` | Intercept authentication challenges from proxy servers |
| `webRequestAuthProvider` | Provide saved credentials for proxy authentication |
| `<all_urls>` | Apply proxy settings to all websites as per your configuration |

### Why These Permissions?

- **proxy**: Essential for the extension's core purpose - routing your traffic through proxy servers
- **storage**: Saves your settings so you don't have to reconfigure every time
- **webRequest & webRequestAuthProvider**: Enables automatic authentication with proxies that require username/password
- **<all_urls>**: Required to apply proxy settings across all websites you visit

## Third-Party Services

PulseProxy does not integrate with or send data to any third-party services.

## Security

- All data remains on your device or within Chrome's encrypted sync
- Proxy credentials are stored using Chrome's secure storage APIs
- No external network requests are made by the extension itself

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