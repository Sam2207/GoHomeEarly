function extractData() {
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
      if (!nextLine) continue;

      const match = nextLine.match(/(\d+)h\s*(\d+)m/);
      if (!match) continue;

      const formatted = `${match[1]}:${match[2].padStart(2, "0")}`;

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

function extractAndStore() {
  const data = extractData();
  console.log("✅ Latest Week:", data);

  if (Object.values(data).some(v => v)) {
    chrome.storage.local.set({ kekaData: data });
  }

  return data;
}

// Keka is a SPA — the hours table renders asynchronously, so wait for it to
// actually appear instead of guessing a fixed delay (too short misses it on
// a slow load, too long wastes time on a fast one).
function hasRenderedData() {
  return /(Mon|Tue|Wed|Thu|Fri)[\s\S]{0,80}\d+h\s*\d+m/.test(document.body.innerText);
}

if (hasRenderedData()) {
  extractAndStore();
} else {
  const observer = new MutationObserver(() => {
    if (hasRenderedData()) {
      observer.disconnect();
      extractAndStore();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // give up watching after 15s so we don't run forever on a page that never renders it
  setTimeout(() => observer.disconnect(), 15000);
}

// let the popup ask for a fresh scrape on demand (the "Fetch from Keka" button)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "fetchNow") {
    const data = extractAndStore();
    sendResponse({ ok: Object.values(data).some(v => v), data });
  }
});
