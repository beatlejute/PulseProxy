# Chrome Web Store Marketing Materials

This folder contains marketing materials for the Chrome Web Store listing.

## Structure

```
store/
├── README.md           # This file
├── descriptions/       # Store descriptions in different languages
│   ├── en.md          # English description
│   └── ru.md          # Russian description
├── screenshots/        # Extension screenshots (1280x800 or 640x400)
│   └── .gitkeep
└── promo/             # Promotional images
    └── .gitkeep
```

## Screenshots Requirements

**Chrome Web Store requires:**
- Minimum: 1 screenshot
- Maximum: 5 screenshots
- Size: 1280x800 or 640x400 pixels
- Format: PNG or JPEG
- No transparency

**Recommended screenshots:**
1. `01-main-screen.png` - Main popup with connection button
2. `02-proxy-tab.png` - Proxy tab with server list
3. `03-presets-tab.png` - Presets tab with configured presets
4. `04-settings-tab.png` - Settings tab
5. `05-connected.png` - Extension in active/connected state

## Promotional Images

| Type | Size | Required |
|------|------|----------|
| Small promo tile | 440x280 px | Recommended |
| Large promo tile | 1400x560 px | Optional |
| Marquee | 1400x560 px | Optional |

**Naming convention:**
- `promo-small-440x280.png`
- `promo-large-1400x560.png`
- `promo-marquee-1400x560.png`

## Creating Screenshots

### Manual Method
1. Install the extension in Chrome
2. Open the popup
3. Use Chrome DevTools to set exact dimensions
4. Take screenshots using OS tools or browser extensions

### Tips
- Use a clean browser profile
- Ensure consistent styling across all screenshots
- Show realistic but not sensitive data
- Highlight key features in each screenshot

## Store Listing Checklist

- [ ] At least 1 screenshot uploaded
- [ ] Short description (max 132 characters)
- [ ] Full description
- [ ] Category selected (Productivity)
- [ ] Language set (English primary)
- [ ] Privacy policy URL added
- [ ] All permissions justified