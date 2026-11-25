const API_KEY_STORAGE = "jarvis_gemini_api_key";
const MODEL_ID = "gemini-3.5-flash";

let attachedDoc = null; // { name, mimeType, base64, textContent }
let wakeEnabled = false;
let recognition = null;
let camStream = null;

function $(id) {
  return document.getElementById(id);
}

function logMsg(sender, text) {
  const box = $("chatLog");
  if (!box) return;
  const row = document.createElement("div");
  row.style.margin = "6px 0";
  row.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(String(text)).replace(/\n/g, "<br>")}`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getApiKey() {
  const fromInput = ($("geminiApiKey")?.value || "").trim();
  const fromStorage = (localStorage.getItem(API_KEY_STORAGE) || "").trim();
  return fromInput || fromStorage;
}

function speakText(text) {
  try {
    if ("speechSynthesis" in window && text) {
      window.speechSynthesis.cancel();
      const plain = String(text).replace(/[*#`_]/g, "").slice(0, 400);
      if (plain) {
        const utter = new SpeechSynthesisUtterance(plain);
        window.speechSynthesis.speak(utter);
      }
    }
  } catch (_) {}
}

async function callGemini(promptText) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API Key missing. Enter your Gemini API key and tap SAVE KEY.");
  }

  const parts = [];
  const cleanPrompt = (promptText || "").trim();

  if (cleanPrompt) {
    parts.push({ text: cleanPrompt });
  } else if (attachedDoc) {
    parts.push({ text: `Analyze and summarize this document: ${attachedDoc.name}` });
  }

  if (attachedDoc) {
    if (attachedDoc.base64) {
      parts.push({
        inlineData: {
          mimeType: attachedDoc.mimeType,
          data: attachedDoc.base64
        }
      });
    } else if (attachedDoc.textContent) {
      parts.push({
        text: `\n\n--- Attached File: ${attachedDoc.name} ---\n${attachedDoc.textContent}`
      });
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`;

  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
    }

    const errMsg = data?.error?.message || `HTTP ${res.status}`;
    const isBusy = res.status === 503 || /high demand|overloaded|unavailable/i.test(errMsg);

    if (isBusy && attempt < 2) {
      logMsg("SYSTEM", `Model busy, retrying (${attempt + 1}/2)...`);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }

    throw new Error(errMsg);
  }
}

async function handleSend() {
  const input = $("userInput");
  const text = (input?.value || "").trim();

  if (!text && !attachedDoc) {
    logMsg("SYSTEM", "Type a message or attach a document first.");
    return;
  }

  logMsg("YOU", text || `[Document: ${attachedDoc.name}]`);
  if (input) input.value = "";

  try {
    logMsg("SYSTEM", "Processing...");
    const reply = await callGemini(text);
    logMsg("JARVIS", reply);
    speakText(reply);
  } catch (err) {
    logMsg("JARVIS Error", err?.message || String(err));
  }
}

window.addEventListener("error", (ev) => {
  logMsg("JS Error", `${ev.message || "Error"} (line ${ev.lineno || "?"})`);
});

window.addEventListener("unhandledrejection", (ev) => {
  const reason = ev?.reason?.message || String(ev?.reason || "Promise rejected");
  logMsg("Async Error", reason);
});

document.addEventListener("DOMContentLoaded", () => {
  const savedKey = localStorage.getItem(API_KEY_STORAGE) || "";
  if ($("geminiApiKey") && savedKey) {
    $("geminiApiKey").value = savedKey;
  }

  $("saveKeyBtn")?.addEventListener("click", () => {
    const key = ($("geminiApiKey")?.value || "").trim();
    if (!key) {
      logMsg("SYSTEM", "Please paste a Gemini API key first.");
      return;
    }
    localStorage.setItem(API_KEY_STORAGE, key);
    logMsg("SYSTEM", "Gemini API key saved.");
  });

  $("sendBtn")?.addEventListener("click", handleSend);

  $("userInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  });

  $("docUploadBtn")?.addEventListener("click", () => {
    $("docFileInput")?.click();
  });

  $("docFileInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const reader = new FileReader();

    if (isPdf) {
      reader.onload = () => {
        const base64 = String(reader.result || "").split(",")[1] || "";
        attachedDoc = {
          name: file.name,
          mimeType: "application/pdf",
          base64,
          textContent: null
        };
        if ($("docStatus")) $("docStatus").textContent = `Attached PDF: ${file.name}`;
        logMsg("SYSTEM", `PDF attached: ${file.name}`);
      };
      reader.onerror = () => logMsg("DOC Error", "Failed to read PDF file.");
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => {
        attachedDoc = {
          name: file.name,
          mimeType: file.type || "text/plain",
          base64: null,
          textContent: String(reader.result || "").slice(0, 30000)
        };
        if ($("docStatus")) $("docStatus").textContent = `Attached: ${file.name}`;
        logMsg("SYSTEM", `Document attached: ${file.name}`);
      };
      reader.onerror = () => logMsg("DOC Error", "Failed to read document.");
      reader.readAsText(file);
    }
  });

  $("micBtn")?.addEventListener("click", () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      logMsg("SYSTEM", "Speech recognition not supported in this browser.");
      return;
    }
    try {
      recognition = new SR();
      recognition.lang = "en-IN";
      recognition.onstart = () => {
        if ($("voiceStatus")) {
          $("voiceStatus").textContent = "● LISTENING";
          $("voiceStatus").className = "status-online";
        }
        logMsg("SYSTEM", "Listening...");
      };
      recognition.onresult = (event) => {
        const spoken = event.results?.[0]?.[0]?.transcript || "";
        if ($("userInput")) $("userInput").value = spoken;
        handleSend();
      };
      recognition.onerror = (err) => {
        logMsg("MIC Error", err?.error || "Microphone error");
      };
      recognition.onend = () => {
        if ($("voiceStatus")) {
          $("voiceStatus").textContent = "● READY";
          $("voiceStatus").className = "status-ready";
        }
      };
      recognition.start();
    } catch (err) {
      logMsg("MIC Error", err?.message || String(err));
    }
  });

  $("camBtn")?.addEventListener("click", async () => {
    try {
      if (camStream) {
        camStream.getTracks().forEach((t) => t.stop());
        camStream = null;
        logMsg("SYSTEM", "Camera stopped.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        logMsg("SYSTEM", "Camera API not available in this browser.");
        return;
      }
      camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      logMsg("SYSTEM", "Camera enabled.");
    } catch (err) {
      logMsg("CAM Error", err?.message || String(err));
    }
  });

  $("wakeBtn")?.addEventListener("click", () => {
    wakeEnabled = !wakeEnabled;
    if ($("wakeStatus")) {
      $("wakeStatus").textContent = wakeEnabled ? "WAKE ON" : "WAKE OFF";
      $("wakeStatus").className = wakeEnabled ? "status-online" : "status-off";
    }
    logMsg("SYSTEM", wakeEnabled ? "Wake mode enabled." : "Wake mode disabled.");
  });

  $("clearBtn")?.addEventListener("click", () => {
    if ($("chatLog")) $("chatLog").innerHTML = "";
    attachedDoc = null;
    if ($("docFileInput")) $("docFileInput").value = "";
    if ($("docStatus")) $("docStatus").textContent = "No document attached";
    logMsg("SYSTEM", "Cleared.");
  });

  logMsg("SYSTEM", "J.A.R.V.I.S Mobile Edition ready.");
});
