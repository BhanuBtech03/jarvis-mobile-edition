const MODEL_NAME = "gemini-3.5-flash";
// రాత్రి ల్యాప్‌టాప్ హాట్‌స్పాట్/లోకల్ IP వచ్చాక ఇక్కడ అప్‌డేట్ చేయండి (ఉదా: "http://192.168.1.36:5000")
const PC_BRIDGE_URL = "";

const apiKeyInput = document.getElementById("apiKeyInput");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const arcReactor = document.getElementById("arcReactor");
const stateLabel = document.getElementById("stateLabel");
const wakeHint = document.getElementById("wakeHint");
const outputBox = document.getElementById("outputBox");
const wakeToggleBtn = document.getElementById("wakeToggleBtn");
const micBtn = document.getElementById("micBtn");
const cmdInput = document.getElementById("cmdInput");
const sendCmdBtn = document.getElementById("sendCmdBtn");
const pcStatusBadge = document.getElementById("pcStatusBadge");

let wakeEnabled = true;
let isAwakeForCommand = false;
let recognition = null;

function getApiKey() {
  return localStorage.getItem("JARVIS_GEMINI_KEY") || apiKeyInput.value.trim();
}

apiKeyInput.value = localStorage.getItem("JARVIS_GEMINI_KEY") || "";

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    addMessage("warn", "Please enter a valid Gemini API key first.");
    return;
  }
  localStorage.setItem("JARVIS_GEMINI_KEY", key);
  addMessage("system", "Gemini API key saved in browser storage.");
});

function setHudState(mode, labelText) {
  arcReactor.classList.remove("idle", "listening", "thinking");
  arcReactor.classList.add(mode);
  stateLabel.textContent = labelText;
}

function addMessage(type, text) {
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.textContent = text;
  outputBox.appendChild(div);
  outputBox.scrollTop = outputBox.scrollHeight;
}

function speak(text) {
  addMessage("jarvis", text);
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  }
}

async function checkPcBridgeStatus() {
  if (!PC_BRIDGE_URL) {
    pcStatusBadge.textContent = "PC BRIDGE: NOT CONFIGURED";
    pcStatusBadge.className = "status-badge offline";
    return false;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${PC_BRIDGE_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      pcStatusBadge.textContent = "PC BRIDGE: ONLINE";
      pcStatusBadge.className = "status-badge online";
      return true;
    }
  } catch (_) {}
  pcStatusBadge.textContent = "PC BRIDGE: OFFLINE";
  pcStatusBadge.className = "status-badge offline";
  return false;
}

function playActivationBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(680, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1120, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch (_) {}
}

async function executeToolAction(plan) {
  const action = plan.action || "reply_only";

  if (action === "set_timer") {
    const seconds = Number(plan.seconds || 60);
    speak(`Setting a timer for ${seconds} seconds.`);
    setTimeout(() => {
      playActivationBeep();
      speak(`Time is up! Your ${seconds} second timer has finished.`);
    }, seconds * 1000);
    return;
  }

  if (action === "open_youtube") {
    const query = encodeURIComponent(plan.query || "");
    speak(plan.reply || `Opening YouTube for ${plan.query || "trending videos"}.`);
    const url = query
      ? `https://www.youtube.com/results?search_query=${query}`
      : "https://www.youtube.com";
    window.open(url, "_blank");
    return;
  }

  if (action === "google_search") {
    const query = encodeURIComponent(plan.query || "");
    speak(plan.reply || `Searching Google for ${plan.query}.`);
    window.open(`https://www.google.com/search?q=${query}`, "_blank");
    return;
  }

  if (action === "pc_command") {
    const online = await checkPcBridgeStatus();
    if (!online) {
      const warning =
        "Warning: PC Bridge is currently offline or not connected. Please connect your Windows laptop tonight before running laptop tasks.";
      addMessage("warn", warning);
      speak(warning);
      return;
    }
    try {
      const res = await fetch(`${PC_BRIDGE_URL}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: plan.pc_command || plan.raw_text })
      });
      const data = await res.json();
      speak(data.message || "Command executed on PC.");
    } catch (err) {
      const errMsg = `PC execution failed: ${err.message}`;
      addMessage("warn", errMsg);
      speak(errMsg);
    }
    return;
  }

  speak(plan.reply || "Done.");
}

async function processCommand(rawText) {
  const text = (rawText || "").trim();
  if (!text) return;

  addMessage("user", text);
  const apiKey = getApiKey();
  if (!apiKey) {
    const msg = "Please save your Gemini API key first to use Gemini 3.5 Flash.";
    addMessage("warn", msg);
    speak(msg);
    return;
  }

  setHudState("thinking", "THINKING");

  const systemPrompt = `
You are J.A.R.V.I.S. Analyze the user's command and respond ONLY with a single valid JSON object (no markdown fences).
Allowed actions:
- "set_timer": requires "seconds" (number) and "reply" (string)
- "open_youtube": requires "query" (string) and "reply" (string)
- "google_search": requires "query" (string) and "reply" (string)
- "pc_command": use when command asks to open/control apps, files, or tasks on laptop/PC; requires "pc_command" (string) and "reply" (string)
- "reply_only": general answer or question; requires "reply" (string)

User command: ${text}
`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      const apiErr = data?.error?.message || `HTTP ${response.status}`;
      addMessage("warn", `Gemini API error: ${apiErr}`);
      speak("There was an issue reaching Gemini 3.5 Flash.");
      setHudState("idle", "STANDBY");
      return;
    }

    const rawReply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawReply.replace(/```json|```/gi, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (_) {
      parsed = { action: "reply_only", reply: rawReply || "I processed your request." };
    }
    parsed.raw_text = text;
    await executeToolAction(parsed);
  } catch (err) {
    addMessage("warn", `Network or model error: ${err.message}`);
    speak("Network issue detected while contacting Gemini.");
  } finally {
    setHudState("idle", "STANDBY");
  }
}

// Text input + Send button
sendCmdBtn.addEventListener("click", () => {
  const val = cmdInput.value;
  cmdInput.value = "";
  processCommand(val);
});

cmdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const val = cmdInput.value;
    cmdInput.value = "";
    processCommand(val);
  }
});

// Speech Recognition ("Hey Jarvis" + Direct Speak)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function setupSpeech() {
  if (!SpeechRecognition) {
    wakeHint.textContent = "Speech API unsupported in this browser. Use the text box below.";
    wakeToggleBtn.disabled = true;
    micBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const transcript = event.results[event.results.length - 1][0].transcript.trim();
    const lower = transcript.toLowerCase();

    if (isAwakeForCommand) {
      isAwakeForCommand = false;
      processCommand(transcript);
      return;
    }

    const wakeMatch = lower.match(/\b(hey jarvis|hi jarvis|jarvis)\b(.*)/);
    if (wakeMatch) {
      playActivationBeep();
      const trailingCmd = (wakeMatch[2] || "").trim();
      setHudState("listening", "LISTENING");
      if (trailingCmd.length > 1) {
        processCommand(trailingCmd);
      } else {
        isAwakeForCommand = true;
        speak("Yes sir, listening.");
      }
    }
  };

  recognition.onend = () => {
    if (!arcReactor.classList.contains("thinking") && !isAwakeForCommand) {
      setHudState("idle", "STANDBY");
    }
    if (wakeEnabled) {
      setTimeout(() => {
        try { recognition.start(); } catch (_) {}
      }, 300);
    }
  };
}

wakeToggleBtn.addEventListener("click", () => {
  wakeEnabled = !wakeEnabled;
  wakeToggleBtn.textContent = wakeEnabled ? "Wake: ON" : "Wake: OFF";
  if (wakeEnabled && recognition) {
    try { recognition.start(); } catch (_) {}
  } else if (recognition) {
    try { recognition.stop(); } catch (_) {}
    setHudState("idle", "STANDBY");
  }
});

micBtn.addEventListener("click", () => {
  if (!recognition) return;
  playActivationBeep();
  isAwakeForCommand = true;
  setHudState("listening", "LISTENING");
  speak("Listening for your command.");
  try { recognition.start(); } catch (_) {}
});

setupSpeech();
checkPcBridgeStatus();
if (wakeEnabled && recognition) {
  try { recognition.start(); } catch (_) {}
}

function syncApiKeyUI() {
  const savedKey = localStorage.getItem("GEMINI_API_KEY");
  const apiSection = document.getElementById("api-key-section");
  const changeBtn = document.getElementById("changeKeyBtn");

  if (savedKey && savedKey.trim() !== "") {
    if (apiSection) apiSection.style.display = "none";
    if (changeBtn) changeBtn.style.display = "inline-block";
  } else {
    if (apiSection) apiSection.style.display = "flex";
    if (changeBtn) changeBtn.style.display = "none";
  }
}

function saveApiKey() {
  const input = document.getElementById("apiKeyInput");
  const key = input ? input.value.trim() : "";
  if (!key) return;
  localStorage.setItem("GEMINI_API_KEY", key);
  syncApiKeyUI();
}

function resetApiKey() {
  localStorage.removeItem("GEMINI_API_KEY");
  syncApiKeyUI();
}

window.addEventListener("DOMContentLoaded", syncApiKeyUI);
