const DAY_IDS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SETTINGS_KEY = "gheSettings";
const THEME_KEY = "gheTheme";

// each preset is a hue for --accent/--bg/--input-bg; "default" keeps the
// original hardcoded colors instead of a computed shade
const COLOR_THEMES = {
  default: null,
  blue: 207,
  purple: 291,
  orange: 36,
  teal: 187,
};

function applyColorTheme(name) {
  const root = document.documentElement.style;
  const hue = COLOR_THEMES[name];

  if (hue === null || hue === undefined) {
    root.removeProperty("--accent");
    root.removeProperty("--bg");
    root.removeProperty("--input-bg");
  } else {
    root.setProperty("--accent", `hsl(${hue}, 65%, 50%)`);
    root.setProperty("--bg", `hsl(${hue}, 25%, 8%)`);
    root.setProperty("--input-bg", `hsl(${hue}, 18%, 16%)`);
  }

  document.querySelectorAll(".swatch").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.theme === name);
  });
}

function selectColorTheme(name) {
  applyColorTheme(name);
  localStorage.setItem(THEME_KEY, name);
}

document.querySelectorAll(".swatch").forEach(btn => {
  btn.addEventListener("click", () => selectColorTheme(btn.dataset.theme));
});

// apply the cached theme immediately (localStorage is synchronous, so this
// paints before chrome.storage's async load() resolves — no flash of default)
applyColorTheme(localStorage.getItem(THEME_KEY) || "default");

function toMinutes(val) {
  if (!val || !val.includes(":")) return null;
  let [h, m] = val.split(":").map(Number);
  return h * 60 + m;
}

function getTodayKey() {
  const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[new Date().getDay()];
}

function getWorkDays() {
  const n = parseInt(document.getElementById("workDays").value) || 5;
  return Math.min(7, Math.max(1, n));
}

function updateVisibleDays() {
  const workDays = getWorkDays();
  DAY_IDS.forEach((id, i) => {
    document.getElementById(id).closest(".day-row").classList.toggle("hidden", i >= workDays);
  });
}

function formatTimeInput(e) {
  const input = e.target;

  // keep only digits and colon, then keep just the first colon
  let raw = input.value.replace(/[^\d:]/g, "");
  const firstColon = raw.indexOf(":");
  if (firstColon !== -1) {
    raw = raw.slice(0, firstColon + 1) + raw.slice(firstColon + 1).replace(/:/g, "");
  }

  // a colon needs a digit before it, otherwise drop it
  if (raw.startsWith(":")) raw = raw.slice(1);

  const hasColon = raw.includes(":");
  let hh, mm;

  if (hasColon) {
    [hh, mm] = raw.split(":");
    hh = hh.slice(0, 2);
    mm = mm.slice(0, 2);
  } else {
    const digits = raw.slice(0, 4);
    hh = digits.slice(0, 2);
    mm = digits.slice(2);
  }

  if (hh.length === 2 && Number(hh) > 24) hh = "24";
  if (mm.length >= 1 && Number(mm[0]) > 5) mm = "5" + mm.slice(1);
  if (mm.length === 2 && Number(mm) > 59) mm = "59";
  if (hh === "24" && mm.length > 0 && Number(mm) > 0) mm = "00";

  input.value = hasColon || mm ? hh + ":" + mm : hh;
}

function calc(data) {
  const workDays = getWorkDays();
  const avgH = parseInt(document.getElementById("avgH").value) || 0;
  const avgM = parseInt(document.getElementById("avgM").value) || 0;
  const avgPerDay = (avgH * 60) + avgM;
  const weeklyTarget = avgPerDay * workDays;

  const ids = DAY_IDS.slice(0, workDays);

  let total = 0;
  let earlyDays = 0;
  let filledDays = 0;

  ids.forEach(d => {
    const mins = toMinutes(data[d]);
    if (mins !== null) {
      total += mins;
      filledDays++;

      if (mins < avgPerDay) earlyDays++;
    }
  });

  const remaining = weeklyTarget - total;
  const remainingDays = workDays - filledDays;

  let result = `Total: ${Math.floor(total / 60)}h ${total % 60}m\n`;

  let statusClass = "neutral";

  // 🎯 TODAY LOGIC
  const todayId = getTodayKey();
  const todayIdx = ids.indexOf(todayId);
  const todayMinutes = todayIdx !== -1 ? toMinutes(data[todayId]) : null;

  if (remaining <= 0) {
    result += "✅ You can go home now";
    statusClass = "good";
    return { result, statusClass };
  }

  result += `Remaining: ${Math.floor(remaining / 60)}h ${remaining % 60}m\n`;

  if (earlyDays > 2) {
    result += "❌ Early leave limit exceeded";
    statusClass = "bad";
    return { result, statusClass };
  }

  // 🔥 Today decision
  if (todayMinutes !== null && todayMinutes < avgPerDay) {
    result += `\n🟢 You can leave early today`;
    statusClass = "good";
  } else {
    statusClass = "neutral";
  }

  if (remainingDays > 0) {
    const perDay = Math.ceil(remaining / remainingDays);
    result += `\nNeed ${Math.floor(perDay / 60)}h ${perDay % 60}m/day`;
  }

  result += `\nEarly days used: ${earlyDays}/2`;

  return { result, statusClass };
}

function updateCalculation() {
  let data = {};
  DAY_IDS.forEach(id => {
    data[id] = document.getElementById(id).value;
  });

  const { result, statusClass } = calc(data);

  const statusEl = document.getElementById("status");
  statusEl.innerText = result;
  statusEl.className = "status " + statusClass;
}

function saveDayData() {
  const data = {};
  DAY_IDS.forEach(id => { data[id] = document.getElementById(id).value; });
  chrome.storage.local.set({ kekaData: data });
}

function clearTimes() {
  DAY_IDS.forEach(id => { document.getElementById(id).value = ""; });
  saveDayData();
  updateCalculation();
}

function saveSettings() {
  chrome.storage.local.set({
    [SETTINGS_KEY]: {
      avgH: document.getElementById("avgH").value,
      avgM: document.getElementById("avgM").value,
      workDays: document.getElementById("workDays").value,
    }
  });
}

function load() {
  chrome.storage.local.get([SETTINGS_KEY, "kekaData"], (result) => {
    const settings = result[SETTINGS_KEY] || {};
    if (settings.avgH !== undefined) document.getElementById("avgH").value = settings.avgH;
    if (settings.avgM !== undefined) document.getElementById("avgM").value = settings.avgM;
    if (settings.workDays !== undefined) document.getElementById("workDays").value = settings.workDays;
    updateVisibleDays();

    const data = result.kekaData || {};

    if (!Object.keys(data).length) {
      document.getElementById("status").innerText = "Open Keka first";
      return;
    }

    DAY_IDS.forEach(id => {
      document.getElementById(id).value = data[id] || "";
    });

    updateCalculation();
  });
}

// 🚀 Auto run
load();

// ⚡ Live update
DAY_IDS.forEach(id => {
  const input = document.getElementById(id);
  input.addEventListener("input", formatTimeInput);
  input.addEventListener("input", updateCalculation);
  input.addEventListener("input", saveDayData);
});

// 🗑 Clear button
document.getElementById("clearBtn").addEventListener("click", clearTimes);

["avgH", "avgM"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    saveSettings();
    updateCalculation();
  });
});

document.getElementById("workDays").addEventListener("input", () => {
  updateVisibleDays();
  saveSettings();
  updateCalculation();
});

// 🔄 Fetch from Keka button
document.getElementById("load").addEventListener("click", () => {
  const statusEl = document.getElementById("status");
  statusEl.innerText = "Fetching...";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes("keka.com")) {
      statusEl.innerText = "Open a Keka tab first";
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: "fetchNow" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        statusEl.innerText = "Couldn't read hours from this page. Try reloading Keka.";
        return;
      }

      Object.keys(response.data).forEach(id => {
        document.getElementById(id).value = response.data[id];
      });
      // content.js only scrapes Mon-Fri and overwrites all of kekaData, so
      // re-save here to fold in Sat/Sun values still sitting in the fields
      saveDayData();
      updateCalculation();
    });
  });
});

// 🎉 Fun tab: wisdom quotes + sarcastic jokes
let funLoaded = false;
let funMode = "quote";

function switchPanel(name) {
  document.getElementById("hoursPanel").style.display = name === "hours" ? "" : "none";
  document.getElementById("funPanel").style.display = name === "fun" ? "" : "none";
  document.getElementById("hoursTabBtn").classList.toggle("active", name === "hours");
  document.getElementById("funTabBtn").classList.toggle("active", name === "fun");

  if (name === "fun" && !funLoaded) {
    funLoaded = true;
    fetchFun();
  }
}

function switchFun(mode) {
  funMode = mode;
  document.getElementById("quoteTab").classList.toggle("active", mode === "quote");
  document.getElementById("jokeTab").classList.toggle("active", mode === "joke");
  fetchFun();
}

// CSP on extension pages blocks inline onclick="", so wire these up here instead
document.getElementById("hoursTabBtn").addEventListener("click", () => switchPanel("hours"));
document.getElementById("funTabBtn").addEventListener("click", () => switchPanel("fun"));
document.getElementById("quoteTab").addEventListener("click", () => switchFun("quote"));
document.getElementById("jokeTab").addEventListener("click", () => switchFun("joke"));
document.getElementById("refreshFunBtn").addEventListener("click", fetchFun);

const SARCASTIC_JOKES = [
  "I'm not saying I hate you, but I'd unplug your life support to charge my phone.",
  "You bring everyone so much joy... when you leave the room.",
  "I'd explain it to you, but I left my crayons at home.",
  "Wow, you did that all by yourself? Did it hurt?",
  "I'm jealous of people who don't know you.",
  "Sure, I'll get right on that — said no one after you asked.",
  "Oh, you're leaving early? What a shocking, never-before-seen turn of events.",
  "I love how confident you are in being completely wrong.",
  "Keep talking, I love yawning.",
  "Sure, blame the WiFi. It's always the WiFi's fault.",
  "You're proof that even evolution takes a day off sometimes.",
  "Wow, another meeting that could've been an email. Groundbreaking.",
  "I'd agree with you, but then we'd both be wrong.",
  "Don't worry, I forgot your name too.",
  "Nice plan. Very ambitious of you to think it'll work.",
  "Oh, you have an opinion? How refreshing.",
  "I'm not arguing, I'm just explaining why I'm right.",
  "You're entitled to your wrong opinion.",
  "Please, continue. I always yawn when I'm interested.",
  "Nice job. I especially loved the part where it didn't work at all.",
  "Oh sure, because that plan has never failed before... every single time.",
  "Take your time. It's not like anyone else is waiting.",
  "Wow, I didn't know silence could be this loud.",
  "Thanks for explaining that to me like I'm five. I'm actually six.",
  "I'm sure that made sense in your head.",
  "Let me guess, it's everyone else's fault again.",
  "I'd love to stay and chat, but I'd rather not.",
  "Your confidence is inspiring, considering how wrong you are.",
  "Sure, let's do it your way. I love watching disasters unfold.",
  "You must be exhausted from jumping to conclusions all day.",
  "I'm not saying I'm always right, but I don't remember ever being wrong.",
  "Oh look, you found the one way to make this worse.",
  "I'd agree with you, but I actually thought about it.",
  "Please, enlighten me with more things I already know.",
  "Ah yes, because 'winging it' has worked so well for you so far.",
  "I admire your commitment to being consistently late.",
  "Don't worry, mediocrity looks great on you.",
  "You have the right to remain silent. Please consider using it.",
  "I see you've mastered the art of doing the bare minimum.",
  "Oh good, another brilliant idea from the guy who lost the stapler.",
  "I love a good mystery, like how you still have a job.",
  "Relax, it's not like your plan could've gone any worse. Oh wait.",
  "I'm sure the deadline was just a suggestion, right?",
  "Impressive. You turned a five-minute task into a three-day project.",
  "Oh, you're 'multitasking'? Is that what we're calling doing nothing twice?",
  "Sure, tell me more about how busy you are doing absolutely nothing.",
  "Your logic is truly a unique work of fiction.",
  "Congratulations, you played yourself.",
  "Oh, is it 'someone else's problem' o'clock again?",
  "I love how you make every small task look like a five-act tragedy.",
  "Please, keep talking. I need something to fall asleep to.",
  "It's cute that you think that's a good excuse.",
  "Ah, the classic 'it worked on my machine' defense.",
  "I'm sure you'll get it right eventually. Ish.",
  "You're not lazy, you're just extremely conservative with your effort.",
  "Wow, a fresh new way to be wrong. Impressive creativity.",
  "Your plan has 'ambitious' written all over it — and by ambitious, I mean doomed."
];

async function fetchFun() {
  const el = document.getElementById("funText");
  el.textContent = "Loading…";

  try {
    if (funMode === "quote") {
      const res = await fetch("https://www.stoic-quotes.com/api/quote");
      const data = await res.json();
      el.textContent = `"${data.text}" — ${data.author}`;
    } else {
      const joke = SARCASTIC_JOKES[Math.floor(Math.random() * SARCASTIC_JOKES.length)];
      el.textContent = joke;
    }
  } catch (err) {
    el.textContent = "Couldn't fetch right now — try again.";
  }
}
