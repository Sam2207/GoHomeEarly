const SETTINGS_KEY = "gheSettings";

// leave/holiday days don't show an "Xh Ym" line on Keka, so we can't just
// skip them — reads the popup's configurable "Leave Hours" (default 8:00)
// to use as their value instead.
function getLeaveDefault(callback) {
  chrome.storage.local.get(SETTINGS_KEY, (result) => {
    const settings = result[SETTINGS_KEY] || {};
    const h = parseInt(settings.leaveH);
    const m = parseInt(settings.leaveM);
    const leaveH = Number.isNaN(h) ? 8 : h;
    const leaveM = Number.isNaN(m) ? 0 : m;
    callback(`${leaveH}:${String(leaveM).padStart(2, "0")}`);
  });
}

function extractData(defaultTime) {
  const text = document.body.innerText;
  const lines = text.split("\n");

  let data = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      (line.includes("Mon") ||
       line.includes("Tue") ||
       line.includes("Wed") ||
       line.includes("Thu") ||
       line.includes("Fri"))
    ) {
      const nextLine = lines[i + 1];
      const match = nextLine ? nextLine.match(/(\d+)h\s*(\d+)m/) : null;

      // no parseable hours under this day (e.g. on leave) — resolve it to
      // the leave default right away instead of skipping it, otherwise the
      // backward scan keeps going and eventually matches last week's row
      // for the same weekday, leaking stale data into this week's slot.
      const formatted = match
        ? `${match[1]}:${match[2].padStart(2, "0")}`
        : defaultTime;

      if (line.includes("Mon") && !data.mon) data.mon = formatted;
      if (line.includes("Tue") && !data.tue) data.tue = formatted;
      if (line.includes("Wed") && !data.wed) data.wed = formatted;
      if (line.includes("Thu") && !data.thu) data.thu = formatted;
      if (line.includes("Fri") && !data.fri) data.fri = formatted;

      // Keka lists days most-recent-first with no week boundary, so once we
      // reach this week's Monday we must stop — anything further back is
      // last week's Wed/Thu/Fri, not a blank day still coming up this week.
      if (data.mon) break;
    }
  }

  return data;
}

function extractAndStore(defaultTime) {
  const data = extractData(defaultTime);
  console.log("✅ Latest Week:", data);

  if (Object.values(data).some(v => v)) {
    chrome.storage.local.set({ kekaData: data });
  }

  return data;
}

function runExtraction(callback) {
  getLeaveDefault((defaultTime) => {
    const data = extractAndStore(defaultTime);
    if (callback) callback(data);
  });
}

// Keka is a SPA — the hours table renders asynchronously, so wait for it to
// actually appear instead of guessing a fixed delay (too short misses it on
// a slow load, too long wastes time on a fast one).
function hasRenderedData() {
  return /(Mon|Tue|Wed|Thu|Fri)[\s\S]{0,80}\d+h\s*\d+m/.test(document.body.innerText);
}

if (hasRenderedData()) {
  runExtraction();
} else {
  const observer = new MutationObserver(() => {
    if (hasRenderedData()) {
      observer.disconnect();
      runExtraction();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // give up watching after 15s so we don't run forever on a page that never renders it
  setTimeout(() => observer.disconnect(), 15000);
}

// let the popup ask for a fresh scrape on demand (the "Fetch from Keka" button)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "fetchNow") {
    runExtraction((data) => {
      sendResponse({ ok: Object.values(data).some(v => v), data });
    });
    return true; // keep the message channel open for the async sendResponse
  }
});
