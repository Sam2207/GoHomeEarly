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
  const values = ids.map(d => toMinutes(data[d]));

  // 🎯 TODAY LOGIC
  const todayId = getTodayKey();
  const todayIdx = ids.indexOf(todayId);

  // 0:00 today usually just means "not clocked out yet" — don't count it as a
  // real (early) day. But if a later day already has data, today has clearly
  // already ended, so treat its 0:00 as genuine.
  if (todayIdx !== -1 && values[todayIdx] === 0) {
    const hasLaterData = values.slice(todayIdx + 1).some(v => v !== null);
    if (!hasLaterData) values[todayIdx] = null;
  }

  let total = 0;
  let earlyDays = 0;
  let filledDays = 0;

  values.forEach(mins => {
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

  const todayMinutes = todayIdx !== -1 ? values[todayIdx] : null;

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

// manually flag any day — past, present, or future — as a leave day, filled
// with the configurable Leave Hours setting (not tied to any one person's
// default, since it reads whatever's currently set)
function markLeave(dayId) {
  const leaveH = parseInt(document.getElementById("leaveH").value) || 8;
  const leaveM = parseInt(document.getElementById("leaveM").value) || 0;
  document.getElementById(dayId).value = `${leaveH}:${String(leaveM).padStart(2, "0")}`;
  saveDayData();
  updateCalculation();
}

document.querySelectorAll(".leave-btn").forEach(btn => {
  btn.addEventListener("click", () => markLeave(btn.dataset.target));
});

document.getElementById("leaveToggle").addEventListener("click", () => {
  const row = document.getElementById("leaveRow");
  const arrow = document.getElementById("leaveArrow");
  const isHidden = row.style.display === "none";
  row.style.display = isHidden ? "" : "none";
  arrow.textContent = isHidden ? "▾" : "▸";
});

function saveSettings() {
  chrome.storage.local.set({
    [SETTINGS_KEY]: {
      avgH: document.getElementById("avgH").value,
      avgM: document.getElementById("avgM").value,
      leaveH: document.getElementById("leaveH").value,
      leaveM: document.getElementById("leaveM").value,
      workDays: document.getElementById("workDays").value,
    }
  });
}

function load() {
  chrome.storage.local.get([SETTINGS_KEY, "kekaData"], (result) => {
    const settings = result[SETTINGS_KEY] || {};
    if (settings.avgH !== undefined) document.getElementById("avgH").value = settings.avgH;
    if (settings.avgM !== undefined) document.getElementById("avgM").value = settings.avgM;
    if (settings.leaveH !== undefined) document.getElementById("leaveH").value = settings.leaveH;
    if (settings.leaveM !== undefined) document.getElementById("leaveM").value = settings.leaveM;
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

// leave hours only affect future Keka scrapes, not the current calculation
["leaveH", "leaveM"].forEach(id => {
  document.getElementById(id).addEventListener("input", saveSettings);
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
  "Your plan has 'ambitious' written all over it — and by ambitious, I mean doomed.",
  "Oh, you're an expert now? Must've read the first paragraph of Wikipedia.",
  "I'd call you a genius, but that seems like false advertising.",
  "Sure, let's schedule another meeting about the meeting we just had.",
  "Wow, you actually showed up on time. Should I mark this on a calendar?",
  "I love your confidence. It's almost as impressive as your accuracy.",
  "Oh, you have a plan? Let me guess, it involves winging it.",
  "Take all the time you need. It's not like deadlines exist.",
  "Your typing speed is inspiring. At this rate, we'll finish by next year.",
  "I admire how you turn a five-second task into a philosophical debate.",
  "Sure, I'll just read your mind next time instead of asking questions.",
  "Oh, you multitasked? I didn't realize scrolling your phone counted.",
  "Nice try. Almost as convincing as your last excuse.",
  "I'm sure the Wi-Fi is definitely the reason your work isn't done.",
  "Your organizational skills are truly a masterclass in chaos.",
  "Wow, you found the bug. Right after breaking it, impressive timing.",
  "I love how 'ASAP' means 'whenever I feel like it' to you.",
  "Sure, blame the printer. It's always plotting against you.",
  "Your enthusiasm for doing nothing is honestly inspiring.",
  "I'd explain the plan again, but I already used small words.",
  "Oh, you're 'almost done'? That's cute, so was I an hour ago.",
  "Your ability to avoid responsibility should be a LinkedIn skill.",
  "Nice save. Truly Oscar-worthy improvisation.",
  "I see you've perfected the art of looking busy.",
  "Sure, tell me again how it's not your fault.",
  "Wow, you actually read the instructions? Groundbreaking.",
  "I love a good mystery novel, like your attendance record.",
  "Your ability to procrastinate should come with a warning label.",
  "Oh, you're 'working from home'? Netflix says otherwise.",
  "I'm sure that email will send itself eventually.",
  "Your confidence in being wrong is oddly consistent.",
  "Nice plan. Did you draw that up during the meeting you weren't listening to?",
  "Sure, let's trust the guy who lost the stapler with the budget.",
  "I love how every deadline is a 'suggestion' to you.",
  "Wow, you actually finished something. Frame it.",
  "Your excuses have really evolved. Almost believable now.",
  "I'm sure the dog ate your report too.",
  "Oh, you're 'on it'? That's what you said yesterday too.",
  "Nice work avoiding all the actual work.",
  "Your commitment to mediocrity is genuinely impressive.",
  "Sure, let's ask the guy who can't find his own desk for directions.",
  "I love how confidently you say things that are completely wrong.",
  "Wow, you replied to that email. Only took three weeks.",
  "Your time management skills could use a time machine.",
  "Oh, you're 'multitasking'? Explains why nothing's actually finished.",
  "I'm sure that'll work out great, said no one ever.",
  "Nice try blaming the intern. Very original.",
  "Your ability to complicate simple things is a rare talent.",
  "Sure, take a five-minute break. It's only been three hours.",
  "I love your optimism. Completely detached from reality, but inspiring.",
  "Wow, you actually remembered a deadline. Should we celebrate?",
  "Your logic checks out, if you ignore all the facts.",
  "Oh, you're 'busy'? Must be exhausting doing absolutely nothing.",
  "I'm sure everyone else is definitely the problem here.",
  "Nice job reinventing the wheel, but square this time.",
  "Your consistency in being late is almost impressive.",
  "Sure, let's give the benefit of the doubt for the fifth time.",
  "I love how you call it 'strategic delay' instead of procrastination.",
  "Wow, you actually double-checked your work. New record.",
  "Your creativity in avoiding blame deserves an award.",
  "Oh, you're 'thinking about it'? Take your time, no rush at all.",
  "I'm sure the universe is conspiring against your productivity.",
  "Nice recovery. Almost like you knew what you were doing.",
  "Your ability to nod along without understanding is impressive.",
  "Sure, let's redo it your way. I love a good disaster movie.",
  "I love how you turn 'no' into a three-paragraph explanation.",
  "Wow, you actually asked a good question. Miracles happen.",
  "Your talent for finding the one wrong answer is unmatched.",
  "Oh, you're 'on top of it'? From where, another planet?",
  "I'm sure that typo was intentional, very avant-garde.",
  "Nice hustle. Shame it's all in the wrong direction.",
  "Your dedication to the bare minimum is truly aspirational.",
  "Sure, let's trust the forecast from the guy who's always wrong.",
  "I love how you treat every task like it's optional.",
  "Wow, you actually showed initiative. Who are you and what did you do with the real you?",
  "Your ability to overcomplicate a yes/no question is a gift.",
  "Oh, you're 'in the zone'? Looks a lot like napping from here.",
  "I'm sure the meeting really needed to run an extra hour.",
  "Nice one. Truly a masterclass in missing the point.",
  "Your patience for excuses is only matched by your patience for work.",
  "Sure, let's hear your theory again, it gets funnier every time.",
  "I love how you treat feedback like a personal attack.",
  "Wow, you actually saved your work this time. Growth.",
  "Your talent for making easy things hard is genuinely rare.",
  "Oh, you're 'almost there'? You said that yesterday, and the day before.",
  "I'm sure that deadline was just a gentle suggestion.",
  "Nice effort. Really feels like you tried for at least a minute.",
  "Your ability to disappear right before crunch time is legendary.",
  "Sure, let's give you one more chance. What's the eleventh time, right?",
  "I love how you call chaos 'creative process'.",
  "Wow, you actually listened in that meeting. Historic moment.",
  "Your knack for missing obvious details is truly a specialty.",
  "Oh, you're 'handling it'? Handling it into the ground, maybe.",
  "I'm sure that excuse gets better each time you practice it.",
  "Nice work turning a two-minute task into a whole ordeal.",
  "Your enthusiasm for other people's work is inspiring, shame it's not for yours.",
  "Sure, let's applaud the bare minimum, why not.",
  "I love how you rewrite history every time you're wrong.",
  "Wow, an actual apology. Didn't think you had it in you.",
  "Your gift for finding shortcuts to nowhere is unique.",
  "Oh, you're 'on track'? Which track, because it's not this one."
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
