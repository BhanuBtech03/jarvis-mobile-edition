const MODEL_NAME = "gemini-3.5-flash";
const STORAGE_KEY = "JARVIS_GEMINI_API_KEY";

const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const apiKeyStatus = document.getElementById("apiKeyStatus");

const docBtn = document.getElementById("docBtn");
const docInput = document.getElementById("docInput");
const docStatus = document.getElementById("docStatus");

const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const chatLog = document.getElementById("chatLog");

let attachedDocName = "";
let attachedDocContent = "";

function appendMessage(sender, text) {
  const div = document.createElement("div");
  div.style.margin = "6px 0";
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// 1. Load & Save API Key in localStorage
function getApiKey() {
  return (localStorage.getItem(STORAGE_KEY) || "").trim();
}

function refreshApiKeyUI() {
  const key = getApiKey();
  if (key) {
    apiKeyInput.value = key;
    apiKeyStatus.textContent = "KEY SAVED";
  } else {
    apiKeyStatus.textContent = "KEY MISSING";
  }
}

saveApiKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiKeyStatus.textContent = "ENTER KEY";
    return;
  }
  localStorage.setItem(STORAGE_KEY, key);
  apiKeyStatus.textContent = "SAVED";
  appendMessage("SYSTEM", "Gemini API key saved locally.");
});

// 2. Document Upload & Reading
docBtn.addEventListener("click", () => {
  docInput.click();
});

docInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  attachedDocName = file.name;
  docStatus.textContent = `Reading ${file.name}...`;

  try {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      // Basic readable text extraction attempt for text-based PDFs
      const buffer = await file.arrayBuffer();
      const rawText = new TextDecoder("latin1").decode(buffer);
      const textMatches = rawText.match(/\(([^()]{2,})\)/g) || [];
      const extracted = textMatches
        .map((s) => s.slice(1, -1))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      attachedDocContent = extracted
        ? extracted.slice(0, 15000)
        : `[PDF file "${file.name}" attached, but no plain text stream could be extracted directly in browser.]`;
    } else {
      const text = await file.text();
      attachedDocContent = text.slice(0, 15000);
    }

    docStatus.textContent = `Attached: ${file.name} (${attachedDocContent.length} chars)`;
    appendMessage("SYSTEM", `Document attached: ${file.name}`);
  } catch (err) {
    attachedDocName = "";
    attachedDocContent = "";
    docStatus.textContent = "Failed to read document";
    appendMessage("JARVIS Error", `Could not read file: ${err.message}`);
  }
});

// 3. Call Gemini API with Retry for High Demand (503)
async function callGeminiWithRetry(promptText, retries = 2) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API Key not set. Please enter your Gemini API key and click SAVE KEY.");
  }

  const finalPrompt = attachedDocContent
    ? `Document Name: ${attachedDocName}\nDocument Content:\n"""\n${attachedDocContent}\n"""\n\nUser Instruction:\n${promptText || "Summarize and analyze this document."}`
    : promptText;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${encodeURIComponent(apiKey)}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }]
      })
    });

    const data = await res.json();

    if (res.ok) {
      const reply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
      return reply;
    }

    const msg = data?.error?.message || `HTTP ${res.status}`;
    const isHighDemand = res.status === 503 || /high demand|overloaded|unavailable/i.test(msg);

    if (isHighDemand && attempt < retries) {
      appendMessage("SYSTEM", `Model busy, retrying (${attempt + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }

    throw new Error(msg);
  }
}

async function handleSend() {
  const text = userInput.value.trim();
  if (!text && !attachedDocContent) return;

  appendMessage("YOU", text || `[Sent document: ${attachedDocName}]`);
  userInput.value = "";

  try {
    const reply = await callGeminiWithRetry(text);
    appendMessage("JARVIS", reply.replace(/\n/g, "<br>"));
  } catch (err) {
    appendMessage("JARVIS Error", err.message);
  }
}

sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

clearBtn.addEventListener("click", () => {
  chatLog.innerHTML = "";
  attachedDocName = "";
  attachedDocContent = "";
  docInput.value = "";
  docStatus.textContent = "No document attached";
});

refreshApiKeyUI();
