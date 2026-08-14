# Changelog

All notable changes to PulseProxy VPN will be documented in this file.

## [Unreleased]

### Changed
- Maintainer tooling: the public proxy list refresh now verifies liveness before publishing, so `sources/proxys.json` contains only proxies that responded to a check

## [1.4.0] - 2026-07-28

### Added
- **Onboarding**: welcome page on install with three ways to start — step-by-step setup wizard, enabling sync, or importing a settings file
- **Setup wizard**: spotlight walkthrough (add proxy → choose routing mode → presets → connect → pin the icon) that advances automatically as you complete each step
- **Full-page view**: the popup can be opened in a browser tab with a 3-column layout, from the header button or the extension's Options page
- **System theme**: theme resolver that follows the OS `prefers-color-scheme` setting when no theme is chosen explicitly
- **Background liveness check for public proxies**: batch checking with subnet-aware interleaving, sorting by status, and a 24-hour result cache
- **"Select default proxy" modal**: shown when the proxy is toggled on with several proxies and no default selected; a single proxy is now selected automatically
- Per-key storage locking to prevent race conditions in concurrent read-modify-write operations
- New AI-service presets (OpenRouter, Kilo Code, Poe, Groq, Together AI, Fireworks AI, DeepInfra, Novita AI, NanoGPT, AI/ML API, Requesty, GitHub Copilot, Windsurf, Cline, v0) and expanded Discord, Twitch, ChatGPT, Claude, Cursor domain lists

### Changed
- Settings sync is now **opt-in** (off by default) with a merge algorithm for local and cloud data to prevent data loss
- Reworked proxy authentication handling so it no longer interferes with regular website authentication
- Standardized localization handling and completed the Russian translation
- Significantly expanded test coverage (unit, integration, E2E including visual regression)

### Fixed
- Proxy health check no longer reports dead proxies as `ok`. The PAC script generated for the check phase was syntactically invalid when a proxy was already connected, so Chrome fell back to DIRECT and got a 200 from the test endpoint regardless of the proxy's real state. The check now also uses `cache: 'no-store'`
- Silent failure when toggling the proxy without a default selected
- Popup collapsing to ~25 px height in the extension popup context
- Missing i18n keys rendering as raw key names — English messages are now used as a fallback for partially translated locales

## [1.3.1] - 2026-04-14

### Added
- Public proxies modal with filters and an in-app catalog of free proxies
- E2E test suite (Playwright) covering smoke, CRUD, settings, i18n, and edge-case stress scenarios

### Changed
- **Breaking (internal)**: `ProxyManager.toggle()` now respects `targetState` when the current state is `ERROR` and the proxy ID changed, instead of always re-enabling
- Theme label localization updated for all 8 locales

### Fixed
- Proxy toggle state issues: stale-callback guard with a generation counter, `resetCache()` / `deleteProxy()` state handlers
- Host and port are now validated **before** the cache check, keeping the state consistent

## [1.3.0] - 2026-03-24

### Added
- Per-tab proxy status badge: shows a country flag from the proxy name (or a checkmark), uses the proxy's color marker, `ALL` for "proxy all sites" mode, and an error indicator on failure
- Welcome screen shown on install
- Anonymous usage analytics (Google Analytics 4)
- Search by `IP:Port` in the public proxies list

## [1.2.2] - 2026-03-13

### Added
- 30 technology company presets with domain lists
- PAC script caching with configuration hashing to avoid redundant regeneration
- `validateProxyHost()` / `validateProxyPort()` validation

### Changed
- Storage layer restructured around the repository pattern (`PresetRepository`, `ProxyRepository`, `MigrationService`, `ImportExportService`)
- Popup split into modules (modal dialogs, drag & drop, proxy form, public proxies); punycode, domain matching, and proxy validation extracted into dedicated modules
- Public proxies modal fully localized

### Security
- `innerHTML` replaced with safe alternatives (`textContent`, `setSafeHTML`) to prevent XSS

## [1.2.1] - 2026-03-10

### Added
- Remote configuration for referral links, hosted on GitHub with a jsDelivr fallback — links can be updated without a new release

## [1.2.0] - 2026-03-10

### Added
- `CONNECTING` state with its own toolbar icon
- Extension version displayed in Settings
- Auto-recovery from the error state on a successful proxied request
- Fallback source for fetching preset templates

### Changed
- Proxy check now uses the `webNavigation` API instead of `webRequest` for better reliability
- Proxy check timeout increased to 15 seconds
- Cache-busting added to preset template and proxy list requests

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
