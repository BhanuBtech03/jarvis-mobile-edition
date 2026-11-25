// ===== 1. API KEY & MODELS =====
let API_KEY = localStorage.getItem('jarvis_key');
if (!API_KEY) {
  API_KEY = prompt('Enter your Gemini API Key:');
  if (API_KEY) localStorage.setItem('jarvis_key', API_KEY.trim());
}
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];

// ===== 2. MEMORY =====
let MEMORY = [];
try {
  const storedMemory = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
  if (Array.isArray(storedMemory)) {
    MEMORY = storedMemory.filter(
      m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string'
    );
  }
} catch (e) {
  localStorage.removeItem('jarvis_memory');
}

function saveMemory() {
  localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY.slice(-30)));
}

// ===== DOM ELEMENTS =====
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const wakeBtn = document.getElementById('wake-btn');
const imgInput = document.getElementById('img-input');
const wakeStatusEl = document.getElementById('wake-status');

function add(text, sender = 'ai') {
  if (!chat) return;
  const div = document.createElement('div');
  div.className = 'msg' + (sender === 'user' ? ' user' : '');
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

MEMORY.forEach(m => {
  add((m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text, m.role === 'user' ? 'user' : 'ai');
});

// ===== VOICE (SPEECH SYNTHESIS & RECOGNITION) =====
function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(String(text).replace(/[*#`_]/g, ''));
  utter.rate = 1;
  utter.pitch = 1;
  window.speechSynthesis.speak(utter);
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const rec = SpeechRecognition ? new SpeechRecognition() : null;
if (rec) {
  rec.lang = 'en-IN';
  rec.interimResults = false;
  rec.continuous = false;
}

// ===== 3. TOOLS & FAST COMMANDS =====
async function fetchToolJson(url, options = {}, timeoutMs = 10000) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function handleTools(commandText) {
  const text = String(commandText || '').trim();
  const lower = text.toLowerCase();

  if (/\b(time|current time)\b/i.test(lower)) {
    return 'Current time is ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', Boss.';
  }

  const timerMatch = lower.match(/timer\s+(?:for\s+)?(\d+)\s*(second|seconds|sec|minute|minutes|min)/i);
  if (timerMatch) {
    const amount = parseInt(timerMatch[1], 10);
    const unit = timerMatch[2];
    const ms = /^min/i.test(unit) ? amount * 60000 : amount * 1000;
    setTimeout(() => {
      const doneMsg = 'Timer done. ' + amount + ' ' + unit + ' completed, Boss.';
      add('J.A.R.V.I.S: ' + doneMsg, 'ai');
      speak(doneMsg);
    }, ms);
    return 'Timer set for ' + amount + ' ' + unit + ', Boss.';
  }

  if (/\b(weather|temperature)\b/i.test(lower)) {
    try {
      const weatherData = await fetchToolJson('https://wttr.in/?format=j1');
      const current = weatherData?.current_condition?.[0];
      const area = weatherData?.nearest_area?.[0]?.areaName?.[0]?.value || 'your area';
      if (current) {
        return 'Weather in ' + area + ': ' + current.temp_C + '°C, ' + current.weatherDesc[0].value + '.';
      }
    } catch (e) {
      return 'Unable to fetch live weather right now, Boss.';
    }
  }

  if (/\b(bitcoin|crypto|btc)\b/i.test(lower)) {
    try {
      const data = await fetchToolJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,inr');
      if (data?.bitcoin) {
        return 'Bitcoin price: $' + data.bitcoin.usd + ' / ₹' + data.bitcoin.inr + '.';
      }
    } catch (e) {
      return 'Crypto price lookup failed, Boss.';
    }
  }

  return null;
}

async function handleFast(text) {
  const toolReply = await handleTools(text);
  if (toolReply) return toolReply;

  if (/^\s*(?:please\s+)?(?:open\s+youtube|youtube)(?:\s+please)?[\s.!?]*$/i.test(text)) {
    window.open('https://youtube.com', '_blank', 'noopener,noreferrer');
    return 'Opening YouTube, Boss.';
  }

  if (/^\s*(?:please\s+)?(?:open\s+google|google)(?:\s+please)?[\s.!?]*$/i.test(text)) {
    window.open('https://google.com', '_blank', 'noopener,noreferrer');
    return 'Opening Google, Boss.';
  }

  const googleSearch = text.match(/^\s*(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s+(.+?)$/i);
  if (googleSearch) {
    const query = googleSearch[1].trim();
    window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank', 'noopener,noreferrer');
    return 'Searching Google for ' + query + ', Boss.';
  }

  const playMatch = text.match(/^\s*(?:play|youtube(?:\s+search)?(?:\s+for)?|search\s+(?:on\s+)?youtube(?:\s+for)?)\s+(.+?)\s*$/i);
  if (playMatch) {
    const query = playMatch[1].trim();
    window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), '_blank', 'noopener,noreferrer');
    return 'Searching YouTube for ' + query + ', Boss.';
  }

  const wikiMatch = text.match(/^\s*(?:search|look\s+up)\s+(?:for\s+)?(.+?)\s*$/i);
  if (wikiMatch) {
    const query = wikiMatch[1].trim();
    try {
      const url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&srsearch=' + encodeURIComponent(query) + '&format=json&origin=*';
      const data = await fetchToolJson(url);
      const result = data?.query?.search?.[0];
      if (result) {
        const snippet = String(result.snippet || '').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        return result.title + ': ' + snippet;
      }
    } catch (e) {
      // Fall through to Gemini if wiki fails
    }
  }

  return null;
}

// ===== 3.5. AGENT MODE ENGINE =====
const AGENT_TOOLS = Object.freeze({
  time: async () => handleTools('current time'),
  weather: async () => handleTools('weather'),
  crypto: async () => handleTools('bitcoin')
});

function isAgentModeRequest(text) {
  const value = String(text || '');
  if (/\b(?:agent(?:\s+mode)?|run\s+(?:a|the)\s+agent|use\s+(?:a|the)\s+agent)\b/i.test(value)) return true;
  if (/\b(?:briefing|research|analyze|analysis)\b/i.test(value)) return true;
  return /\bplan\b/i.test(value) && /\b(?:time|weather|crypto|bitcoin|btc)\b/i.test(value);
}

function fallbackAgentToolPlan(goal) {
  const g = String(goal || '').toLowerCase();
  const plan = ['time'];
  if (/weather|rain|temp|trip|goa/i.test(g)) plan.push('weather');
  if (/crypto|bitcoin|btc/i.test(g)) plan.push('crypto');
  return plan;
}

function parseAgentToolPlan(responseText) {
  const text = String(responseText || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('Agent plan format incorrect.');
  const parsed = JSON.parse(text.slice(start, end + 1));
  const allowed = new Set(Object.keys(AGENT_TOOLS));
  return [...new Set(parsed.filter(item => typeof item === 'string').map(item => item.trim().toLowerCase()).filter(item => allowed.has(item)))];
}

async function callGeminiRaw(promptText) {
  if (!API_KEY) throw new Error('Gemini API key is missing.');
  let lastErr;
  for (const model of MODELS) {
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(API_KEY),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: promptText }] }]
          })
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || ('HTTP ' + res.status));
      const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (out) return out;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Gemini request failed.');
}

async function runAgent(goal) {
  add('J.A.R.V.I.S: Agent mode active.', 'ai');
  const planPrompt = 'Return ONLY a JSON array of tool names from ["time","weather","crypto"] for goal: ' + JSON.stringify(String(goal));
  let toolsToRun;
  try {
    toolsToRun = parseAgentToolPlan(await callGeminiRaw(planPrompt));
    if (!toolsToRun.length) toolsToRun = fallbackAgentToolPlan(goal);
  } catch (e) {
    toolsToRun = fallbackAgentToolPlan(goal);
  }

  const results = {};
  for (let i = 0; i < toolsToRun.length; i++) {
    const tool = toolsToRun[i];
    add('J.A.R.V.I.S: [' + (i + 1) + '/' + toolsToRun.length + '] Running ' + tool + '...', 'ai');
    try {
      results[tool] = await AGENT_TOOLS[tool]();
    } catch (e) {
      results[tool] = 'Tool error';
    }
  }

  const summaryPrompt = 'Goal: ' + JSON.stringify(String(goal)) + '. Tool results: ' + JSON.stringify(results) + '. Give a clear, concise response.';
  return await callGemini(summaryPrompt);
}

// ===== 4. GEMINI BRAIN & VISION =====
async function callGemini(promptText, base64Image = null, mimeType = 'image/jpeg') {
  if (!API_KEY) throw new Error('Gemini API key is missing.');

  const contents = MEMORY.slice(-12).map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  const userParts = [{ text: promptText }];
  if (base64Image) {
    userParts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Image
      }
    });
  }
  contents.push({ role: 'user', parts: userParts });

  let lastError;
  for (const model of MODELS) {
    try {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(API_KEY),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents })
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || ('HTTP ' + response.status));
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) {
        MEMORY.push({ role: 'user', text: promptText });
        MEMORY.push({ role: 'model', text: reply });
        saveMemory();
        return reply;
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All Gemini models failed.');
}

async function processCommand(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return;

  add('YOU: ' + text, 'user');
  if (input) input.value = '';

  try {
    let reply = await handleFast(text);
    if (!reply && isAgentModeRequest(text)) {
      reply = await runAgent(text);
    }
    if (!reply) {
      reply = await callGemini(text);
    }
    add('J.A.R.V.I.S: ' + reply, 'ai');
    speak(reply);
  } catch (err) {
    const errMsg = 'Error: ' + (err?.message || 'Something went wrong');
    add('J.A.R.V.I.S: ' + errMsg, 'ai');
    speak(errMsg);
  }
}

// ===== EVENT LISTENERS =====
if (sendBtn && input) {
  sendBtn.addEventListener('click', () => processCommand(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') processCommand(input.value);
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    MEMORY = [];
    localStorage.removeItem('jarvis_memory');
    if (chat) chat.innerHTML = '';
    const msg = 'Memory cleared, Boss.';
    add('J.A.R.V.I.S: ' + msg, 'ai');
    speak(msg);
  });
}

if (micBtn && rec) {
  micBtn.addEventListener('click', () => {
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = event => {
      const spoken = event.results?.[0]?.[0]?.transcript || '';
      if (spoken) processCommand(spoken);
    };
    rec.start();
  });
}

if (camBtn && imgInput) {
  camBtn.addEventListener('click', () => imgInput.click());
  imgInput.addEventListener('change', async () => {
    const file = imgInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.split(',')[1];
      if (!base64) return;
      add('YOU: [Sent an image]', 'user');
      try {
        const prompt = input?.value?.trim() || 'Analyze this image concisely in a helpful assistant tone.';
        const reply = await callGemini(prompt, base64, file.type || 'image/jpeg');
        add('J.A.R.V.I.S: ' + reply, 'ai');
        speak(reply);
      } catch (err) {
        add('J.A.R.V.I.S: Vision error - ' + (err?.message || ''), 'ai');
      }
      imgInput.value = '';
    };
    reader.readAsDataURL(file);
  });
}

// ===== WAKE WORD ENGINE =====
let wakeWordEnabled = false;
const WAKE_WORD = 'hey jarvis';

function stopContinuousListening() {
  if (!rec) return;
  try {
    rec.stop();
  } catch (e) {
    // Ignore already stopped state
  }
}

function startContinuousListening() {
  if (!rec) return;
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = event => {
    const last = event.results.length - 1;
    const transcript = String(event.results[last]?.[0]?.transcript || '').toLowerCase();
    if (transcript.includes(WAKE_WORD)) {
      speak('Yes Boss?');
      wakeWordEnabled = false;
      if (wakeBtn) wakeBtn.classList.remove('active');
      if (wakeStatusEl) {
        wakeStatusEl.textContent = 'WAKE: OFF';
        wakeStatusEl.className = 'off';
      }
      stopContinuousListening();
      setTimeout(() => {
        if (micBtn) micBtn.click();
      }, 600);
    }
  };

  try {
    rec.start();
  } catch (e) {
    // Ignore if already listening
  }
}

function toggleWakeWord() {
  if (!rec) {
    add('J.A.R.V.I.S: Speech recognition not supported in this browser.', 'ai');
    return;
  }
  wakeWordEnabled = !wakeWordEnabled;
  if (wakeWordEnabled) {
    if (wakeBtn) wakeBtn.classList.add('active');
    if (wakeStatusEl) {
      wakeStatusEl.textContent = "LISTENING FOR 'HEY JARVIS'...";
      wakeStatusEl.className = 'on';
    }
    startContinuousListening();
  } else {
    if (wakeBtn) wakeBtn.classList.remove('active');
    if (wakeStatusEl) {
      wakeStatusEl.textContent = 'WAKE: OFF';
      wakeStatusEl.className = 'off';
    }
    stopContinuousListening();
  }
}

if (wakeBtn) {
  wakeBtn.addEventListener('click', toggleWakeWord);
}
