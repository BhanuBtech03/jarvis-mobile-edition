const STORAGE_KEY = "JARVIS_GEMINI_API_KEY";
const GEMINI_MODEL = "gemini-3.5-flash";

let wakeModeEnabled = false;
let recognition = null;
let isRecognizing = false;
let activeTimerId = null;

function appendLog(text, type = "ai") {
  const logBox = document.getElementById("logBox");
  if (!logBox) {
    alert(text);
    return;
  }
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.textContent = text;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

function clearLog() {
  const logBox = document.getElementById("logBox");
  if (logBox) {
    logBox.innerHTML = '<div class="msg sys">Log cleared.</div>';
  }
}

function getApiKey() {
  return (localStorage.getItem(STORAGE_KEY) || "").trim();
}

function syncApiKeyUI() {
  const savedKey = getApiKey();
  const apiSection = document.getElementById("api-key-section");
  const changeBtn = document.getElementById("changeKeyBtn");
  const statusEl = document.getElementById("systemStatus");

  if (savedKey) {
    if (apiSection) apiSection.style.display = "none";
    if (changeBtn) changeBtn.style.display = "inline-block";
    if (statusEl) statusEl.textContent = "KEY READY";
  } else {
    if (apiSection) apiSection.style.display = "flex";
    if (changeBtn) changeBtn.style.display = "none";
    if (statusEl) statusEl.textContent = "NO KEY";
  }
}

function saveApiKey() {
  const input = document.getElementById("apiKeyInput");
  const key = input ? input.value.trim() : "";
  if (!key) {
    appendLog("Please paste your Gemini API key first, then tap Save Key.", "err");
    return;
  }
  localStorage.setItem(STORAGE_KEY, key);
  if (input) input.value = "";
  syncApiKeyUI();
  appendLog("API key saved. Try typing a command or tapping SPEAK.", "sys");
}

function resetApiKey() {
  localStorage.removeItem(STORAGE_KEY);
  syncApiKeyUI();
  appendLog("API key cleared. Enter a new key.", "sys");
}

function speakText(text) {
  if (!("speechSynthesis" in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  } catch (_) {}
}

function setReactorState(label, listening = false) {
  const labelEl = document.getElementById("reactorLabel");
  const coreEl = document.getElementById("reactorCore");
  if (labelEl) labelEl.textContent = label;
  if (coreEl) coreEl.classList.toggle("listening", listening);
}

function handleLocalCommand(rawCmd) {
  const cmd = rawCmd.toLowerCase().trim();

  if (cmd === "time" || cmd.includes("what time") || cmd.includes("current time")) {
    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msg = `Current time is ${nowStr}.`;
    appendLog(`J.A.R.V.I.S.: ${msg}`, "ai");
    speakText(msg);
    return true;
  }

  if (cmd.includes("open youtube")) {
    const query = cmd.replace(/open\s+youtube/i, "").trim();
    const url = query
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      : "https://www.youtube.com";
    appendLog(`J.A.R.V.I.S.: Opening YouTube...`, "ai");
    speakText("Opening YouTube");
    window.open(url, "_blank");
    return true;
  }

  const timerMatch = cmd.match(/(?:set\s+)?timer\s+(?:for\s+)?(\d+)\s*(sec|secs|second|seconds|min|mins|minute|minutes)/i);
  if (timerMatch) {
    const amount = parseInt(timerMatch[1], 10);
    const unit = timerMatch[2].toLowerCase();
    const ms = unit.startsWith("min") ? amount * 60 * 1000 : amount * 1000;
    if (activeTimerId) clearTimeout(activeTimerId);
    const msg = `Timer set for ${amount} ${unit}.`;
    appendLog(`J.A.R.V.I.S.: ${msg}`, "ai");
    speakText(msg);
    activeTimerId = setTimeout(() => {
      appendLog("J.A.R.V.I.S.: Timer completed!", "ai");
      speakText("Sir, your timer is up.");
    }, ms);
    return true;
  }

  return false;
}

function initSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    appendLog("Speech recognition not supported in this browser.", "err");
    return null;
  }

  const rec = new SpeechRec();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.continuous = false;

  rec.onstart = () => {
    isRecognizing = true;
    setReactorState("LISTENING", true);
  };

  rec.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    if (!transcript) return;

    const lower = transcript.toLowerCase();
    if (wakeModeEnabled) {
      if (lower.includes("hey jarvis") || lower.includes("jarvis")) {
        const cleaned = transcript.replace(/hey\s+jarvis|jarvis/gi, "").trim();
        appendLog(`Wake triggered: ${transcript}`, "sys");
        if (cleaned) {
          processUserCommand(cleaned);
        } else {
          speakText("Yes sir, how can I help?");
          appendLog("J.A.R.V.I.S.: Yes sir, how can I help?", "ai");
        }
      }
    } else {
      processUserCommand(transcript);
    }
  };

  rec.onerror = (event) => {
    if (event.error !== "no-speech" && event.error !== "aborted") {
      appendLog(`Mic error: ${event.error}`, "err");
    }
  };

  rec.onend = () => {
    isRecognizing = false;
    setReactorState(wakeModeEnabled ? "WAKE ON" : "STANDBY", false);
    if (wakeModeEnabled) {
      setTimeout(() => {
        if (wakeModeEnabled && !isRecognizing) {
          try {
            rec.start();
          } catch (_) {}
        }
      }, 350);
    }
  };

  return rec;
}

function toggleWakeMode() {
  wakeModeEnabled = !wakeModeEnabled;
  const wakeBtn = document.getElementById("wakeBtn");
  if (wakeBtn) {
    wakeBtn.textContent = wakeModeEnabled ? "WAKE: ON" : "WAKE: OFF";
    wakeBtn.classList.toggle("active", wakeModeEnabled);
  }

  if (!recognition) recognition = initSpeechRecognition();

  if (wakeModeEnabled) {
    appendLog("Wake mode ON. Say 'Hey Jarvis' while this tab is open.", "sys");
    setReactorState("WAKE ON", false);
    if (recognition && !isRecognizing) {
      try {
        recognition.start();
      } catch (_) {}
    }
  } else {
    appendLog("Wake mode OFF.", "sys");
    setReactorState("STANDBY", false);
    if (recognition && isRecognizing) {
      try {
        recognition.stop();
      } catch (_) {}
    }
  }
}

function startManualListen() {
  if (!recognition) recognition = initSpeechRecognition();
  if (!recognition) return;
  if (!isRecognizing) {
    try {
      recognition.start();
    } catch (_) {
      appendLog("Unable to start microphone.", "err");
    }
  }
}

function handleCommandSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("commandInput");
  const cmd = input ? input.value.trim() : "";
  if (!cmd) return;
  if (input) input.value = "";
  processUserCommand(cmd);
}

async function processUserCommand(commandText) {
  appendLog(`You: ${commandText}`, "user");

  if (handleLocalCommand(commandText)) {
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    appendLog("Error: API key missing. Paste key and click Save Key.", "err");
    return;
  }

  setReactorState("THINKING", true);

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: commandText }] }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || `HTTP ${response.status}`;
      appendLog(`Gemini API Error: ${errMsg}`, "err");
      return;
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("")
        .trim() || "No response received.";

    appendLog(`J.A.R.V.I.S.: ${reply}`, "ai");
    speakText(reply.slice(0, 240));
  } catch (err) {
    appendLog(`Network Error: ${err.message}`, "err");
  } finally {
    setReactorState(wakeModeEnabled ? "WAKE ON" : "STANDBY", false);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  syncApiKeyUI();
});
