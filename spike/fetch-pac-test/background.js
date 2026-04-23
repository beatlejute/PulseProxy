// PAC script that routes example.com through an invalid proxy (127.0.0.1:1)
// If fetch() from SW goes through PAC, it will fail with network error
const pac = `
function FindProxyForURL(url, host) {
  if (host === "example.com") return "PROXY 127.0.0.1:1";
  return "DIRECT";
}
`;

// Set PAC proxy and then test fetch
chrome.proxy.settings.set(
  {
    value: { mode: "pac_script", pacScript: { data: pac } },
    scope: "regular"
  },
  () => {
    if (chrome.runtime.lastError) {
      console.error("SPIKE ERROR: Failed to set PAC proxy:", chrome.runtime.lastError.message);
      return;
    }

    console.log("SPIKE: PAC proxy set, now testing fetch...");

    fetch("http://example.com/?_pulse_check=spike-test")
      .then((r) => {
        console.log(
          "SPIKE RESULT: fetch succeeded — PAC NOT applied to SW fetch",
          "Status:",
          r.status
        );
        console.log(
          "INTERPRETATION: PLAN-012 is NOT feasible with current approach — fetch() bypasses PAC"
        );
      })
      .catch((e) => {
        console.log(
          "SPIKE RESULT: fetch failed — PAC applied to SW fetch (network error)",
          "Error:",
          e.message
        );
        console.log(
          "INTERPRETATION: PLAN-012 is FEASIBLE — fetch() from service worker routes through PAC"
        );
      });
  }
);
