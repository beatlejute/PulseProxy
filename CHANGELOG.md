# Changelog

All notable changes to PulseProxy VPN will be documented in this file.

## [Unreleased]

### Fixed
- Fixed proxy health check incorrectly reporting dead proxies as `ok`. Root cause: PAC script generated for the check phase was syntactically invalid when an active proxy was already connected, causing Chrome to fall back to DIRECT connection and receive 200 from the test endpoint regardless of actual proxy availability. Check now uses `cache: 'no-store'` for defense-in-depth against HTTP caching.
- Fixed silent failure when toggling proxy without a default selected. Now auto-selects the only proxy if just one exists, or opens a "Select default proxy" modal if there are several.

## [1.1.3] - 2026-02-19

### Fixed
- Fixed proxy authentication

## [1.1.2] - 2026-02-04

### Changed
- Bumped version to 1.1.2
- Updated localizations for all languages
- Updated Chrome Web Store descriptions

## [1.1.1] - 2026-02-03

### Fixed
- Fixed popup window width

### Changed
- Tests refactoring

## [1.1.0] - 2026-01-29

### Added
- Settings sync enabled by default
- Presets enabled by default
- Dialog alerts/notifications
- Improved modal overlay

## [1.0.1] - 2026-01-24

### Added
- Comprehensive test coverage (unit tests, integration tests)

## [1.0.0] - 2026-01-23

### Initial Release
- Chrome Web Store publishing materials (Privacy Policy, screenshots, descriptions)
- Public proxy selection with filters
- Preset templates from GitHub
- Settings import/export functionality
- "Proxy by Default" mode with Ignore List
- IDN/Punycode support and improved wildcard domain matching
- Multi-proxy server management
- Animated SVG shield icon
- Improved project structure and build scripts

#### Features
- **Multiple Proxy Types** - Support for HTTP, HTTPS, SOCKS4, and SOCKS5 proxies
- **Proxy Authentication** - Built-in support for username/password authentication
- **Smart Presets** - Create and manage proxy presets with domain-specific rules
- **Domain Matching** - Exact domain matching and wildcard subdomain support (*.example.com)
- **Ignore List** - Define domains that should bypass the proxy
- **Proxy All Sites** - Option to route all traffic through proxy
- **Settings Sync** - Synchronize your settings across devices using browser sync
- **Multi-language Support** - Available in 8 languages:
  - English
  - Deutsch (German)
  - Español (Spanish)
  - Français (French)
  - 日本語 (Japanese)
  - Português (Portuguese)
  - Русский (Russian)
  - 中文 (Chinese)

#### Privacy
- No data collection or tracking
- All settings stored locally on your device
- Open source - review the code yourself
- No external network requests