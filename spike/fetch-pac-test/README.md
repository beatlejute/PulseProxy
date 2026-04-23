# PAC Fetch Spike Test

## Purpose

This Chrome MV3 extension verifies whether `fetch()` calls from a service worker are routed through a PAC (Proxy Auto-Config) script set via `chrome.proxy.settings.set()`.

**Why this matters:** The PLAN-012 architecture depends on PAC routing for all extension traffic. If `fetch()` from SW bypasses PAC, the entire plan is not feasible and an alternative approach is needed.

## How to Load

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `spike/fetch-pac-test/` directory

## How to Observe Results

1. After loading, open the **Service Worker** console:
   - In `chrome://extensions/`, find "PAC Fetch Spike Test"
   - Click **"service worker"** link under "Inspect views"
2. The console will show one of two outcomes:

### Outcome A: PAC Applied (Network Error)
```
SPIKE RESULT: fetch failed — PAC applied to SW fetch (network error)
INTERPRETATION: PLAN-012 is FEASIBLE — fetch() from service worker routes through PAC
```
✅ **Good news:** The PLAN-012 approach works. PAC affects `fetch()` from SW.

### Outcome B: PAC NOT Applied (Success)
```
SPIKE RESULT: fetch succeeded — PAC NOT applied to SW fetch
INTERPRETATION: PLAN-012 is NOT feasible with current approach — fetch() bypasses PAC
```
❌ **Bad news:** `fetch()` from SW bypasses PAC. PLAN-012 needs a different approach.

## Cleanup

After testing, **disable or remove** the extension to restore normal proxy settings. The PAC setting persists until the extension is unloaded or `chrome.proxy.settings.clear()` is called.

## Technical Details

- **PAC script**: Routes `example.com` through `127.0.0.1:1` (guaranteed invalid/unreachable proxy)
- **Test URL**: `http://example.com/?_pulse_check=spike-test`
- **Interpretation logic**:
  - `fetch` fails with TypeError/network error → PAC is applied → hypothesis confirmed
  - `fetch` returns successfully → PAC is NOT applied → hypothesis rejected
