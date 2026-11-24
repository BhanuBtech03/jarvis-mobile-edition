// ==== 1. API KEY & MODELS ====
let API_KEY = localStorage.getItem('jarvis_key');
if (!API_KEY) {
  API_KEY = prompt('Enter your Gemini API Key:');
  if (API_KEY) localStorage.setItem('jarvis_key', API_KEY.trim());
}

const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"];

// ==== 2. MEMORY & UI ELEMENTS ====
let MEMORY = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
function saveMemory() {
  localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
}

const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const execBtn = document.getElementById('exec-btn');
const micBtn = document.getElementById('mic-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');
const clearBtn = document.getElementById('clear-btn');
const sysLabel = document.getElementById('system-label');
const statusConn = document.getElementById('status-conn');

function updateNetworkStatus() {
  if (!statusConn) return;
  if (navigator.onLine) {
    statusConn.textContent = '• ONLINE';
    statusConn.className = 'status-val online';
  } else {
    statusConn.textContent = '• OFFLINE';
    statusConn.className = 'status-val warn';
  }
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();

MEMORY.forEach(m => {
  add(m.role === 'user' ? 'YOU: ' + m.text : 'J.A.R.V.I.S: ' + m.text, m.role === 'user' ? 'user' : 'ai');
});

// ==== 3. TOOLS (THE HANDS) ====
async function handleTools(text) {
  const t = text.toLowerCase();

  // 1. Time
  if (/\btime\b/.test(t) || t.includes('టైమ్') || t.includes('సమయం')) {
    return 'The time is ' + new Date().toLocaleTimeString() + ', Boss.';
  }

  // 2. Weather
  if (t.includes('weather') || t.includes('వాతావరణం')) {
    return await new Promise(res => {
      navigator.geolocation.getCurrentPosition(async p => {
        try {
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current_weather=true`);
          const d = await r.json();
          res(`It is ${d.current_weather.temperature} degrees Celsius now, Boss.`);
        } catch (e) {
          res('Weather service error, Boss.');
        }
      }, () => res('I need location permission for weather, Boss.'));
    });
  }

  // 3. Timer
  const m = t.match(/(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i);
  if ((t.includes('timer') || t.includes('టైమర్')) && m) {
    const amount = parseInt(m[1]);
    const unit = m[2].toLowerCase();
    const factor = /^h(ours?|rs?)/.test(unit) ? 3600000 : (/^s(econds?|ecs?)/.test(unit) ? 1000 : 60000);
    const duration = amount * factor;
    setTimeout(() => speak(`టైమర్ పూర్తయింది! ${amount} ${unit} అయ్యాయి.`), duration);
    return `Timer set for ${amount} ${unit}.`;
  }

  // 4. Translate
  if (t.includes('translate')) {
    const q = text.replace(/translate (this )?/i, '').trim() || 'hello';
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|te`);
      const d = await r.json();
      return `In Telugu: "${d.responseData.translatedText}"`;
    } catch (e) {
      return 'Translate error, Boss.';
    }
  }

  // 5. YouTube Play
  if (t.includes('play ') || t.includes('youtube ')) {
    const q = text.replace(/play (youtube )?(search )?/i, '').trim();
    if (q) {
      window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q));
      return `Searching YouTube for '${q}', Boss.`;
    }
  }

  return null; // Tool match కాకపోతే Gemini Brain కి వెళ్తుంది
}

// ==== 4. GEMINI TEXT BRAIN ====
async function callGemini(promptText) {
  if (!API_KEY) {
    throw new Error('Gemini API Key missing. Refresh to enter key.');
  }
  const contents = MEMORY.slice(-12).map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));
  contents.push({ role: 'user', parts: [{ text: promptText }] });

  let lastErr;
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents })
        }
      );
      const data = await res.json();
      if (data.error) {
        lastErr = new Error(data.error.message);
        if (/high demand|temporary|quota|rate|unavailable|deprecated|not found/i.test(data.error.message)) {
          continue;
        }
        throw lastErr;
      }
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) throw new Error('Empty response from model');
      return reply;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All models failed');
}

async function askGemini(promptText) {
  if (sysLabel) sysLabel.textContent = 'PROCESSING REQUEST';
  add('J.A.R.V.I.S: Thinking...', 'ai');
  try {
    const toolReply = await handleTools(promptText);
    const reply = toolReply !== null ? toolReply : await callGemini(promptText);

    MEMORY.push({ role: 'user', text: promptText });
    MEMORY.push({ role: 'model', text: reply });
    saveMemory();
    chat.lastChild.innerText = 'J.A.R.V.I.S: ' + reply;
    speak(reply);
  } catch (e) {
    chat.lastChild.innerText = 'J.A.R.V.I.S: ERROR - ' + e.message;
  } finally {
    if (sysLabel) sysLabel.textContent = 'SYSTEM READY';
  }
}

// ==== 5. VISION ENGINE ====
if (camBtn && imgInput) {
  camBtn.onclick = () => imgInput.click();
  imgInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const q = input.value.trim() || 'What do you see? Describe briefly.';
      add('YOU: [IMAGE] ' + q, 'user');
      input.value = '';
      askVision(base64, file.type, q);
    };
    reader.readAsDataURL(file);
    imgInput.value = '';
  };
}

async function askVision(base64, mimeType, question) {
  if (!API_KEY) {
    add('J.A.R.V.I.S: ERROR - Gemini API Key missing.', 'ai');
    return;
  }
  if (sysLabel) sysLabel.textContent = 'ANALYZING IMAGE';
  add('J.A.R.V.I.S: Analyzing image...', 'ai');

  let lastErr;
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: question },
                { inline_data: { mime_type: mimeType, data: base64 } }
              ]
            }]
          })
        }
      );
      const data = await res.json();
      if (data.error) {
        lastErr = new Error(data.error.message);
        if (/high demand|temporary|quota|rate|unavailable|deprecated|not found/i.test(data.error.message)) {
          continue;
        }
        throw lastErr;
      }
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) throw new Error('Empty vision response');
      chat.lastChild.innerText = 'J.A.R.V.I.S: ' + reply;
      speak(reply);
      if (sysLabel) sysLabel.textContent = 'SYSTEM READY';
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  chat.lastChild.innerText = 'J.A.R.V.I.S: ERROR - ' + (lastErr ? lastErr.message : 'Vision failed');
  if (sysLabel) sysLabel.textContent = 'SYSTEM READY';
}

// ==== 6. VOICE & CONTROLS ====
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRec && micBtn) {
  const rec = new SpeechRec();
  rec.lang = 'en-US';
  rec.onresult = e => {
    const transcript = e.results[0][0].transcript;
    add('YOU: ' + transcript, 'user');
    askGemini(transcript);
  };
  rec.onerror = () => {
    micBtn.innerText = '🎤';
    if (sysLabel) sysLabel.textContent = 'SYSTEM READY';
  };
  rec.onend = () => {
    micBtn.innerText = '🎤';
  };
  micBtn.onclick = () => {
    try {
      rec.start();
      micBtn.innerText = '🎙️';
      if (sysLabel) sysLabel.textContent = 'LISTENING';
    } catch (_) {}
  };
}

let voices = [];
function loadVoices() {
  if ('speechSynthesis' in window) {
    voices = window.speechSynthesis.getVoices();
  }
}
loadVoices();
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.05;
  utter.pitch = 0.9;
  const preferred = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}

function triggerSend() {
  const text = input.value.trim();
  if (!text) return;
  add('YOU: ' + text, 'user');
  input.value = '';
  askGemini(text);
}

if (execBtn) execBtn.onclick = triggerSend;
if (input) {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') triggerSend();
  });
}

if (clearBtn) {
  clearBtn.onclick = () => {
    MEMORY = [];
    saveMemory();
    chat.innerHTML = '';
    add('SYSTEM: Memory cleared.', 'ai');
  };
}

function add(text, who) {
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.innerText = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
