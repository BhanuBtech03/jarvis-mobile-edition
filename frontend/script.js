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
  row.innerHTML = `<strong>${sender}:</strong> ${String(text).replace(/\n/g, "<br>")}`;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

function getApiKey() {
  const inputVal = ($("geminiApiKey")?.value || "").trim();
  const savedVal = (localStorage.getItem(API_KEY_STORAGE) || "").trim();
  return inputVal || savedVal;
}

function speakText(text) {
  try {
    if ("speechSynthesis" in window && text) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text.replace(/<[^>]*>/g, "").slice(0, 400));
      window.speechSynthesis.speak(utter);
    }
  } catch (_) {}
}

async function callGemini(promptText) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API Key missing! Paina box lo key paste chesi SAVE KEY nokkandi.");
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

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`;

  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] })
    });
    const data = await res.json();

    if (res.ok) {
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response text.";
    }

    const errMsg = data?.error?.message || `HTTP ${res.status}`;
    const busy = res.status === 503 || /high demand|overloaded|unavailable/i.test(errMsg);
    if (busy && attempt < 2) {
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
    logMsg("SYSTEM", "Message rayandi leda DOC attach cheyandi.");
    return;
  }

  logMsg("YOU", text || `[Document: ${attachedDoc.name}]`);
  if (input) input.value = "";

  try {
    logMsg("SYSTEM", "Thinking...");
    const reply = await callGemini(text);
    logMsg("JARVIS", reply);
    speakText(reply);
  } catch (err) {
    logMsg("JARVIS Error", err.message || String(err));
  }
}

function initJarvis() {
  try {
    const savedKey = localStorage.getItem(API_KEY_STORAGE) || "";
    if ($("geminiApiKey") && savedKey) {
      $("geminiApiKey").value = savedKey;
    }

    // SAVE KEY
    $("saveKeyBtn")?.addEventListener("click", () => {
      const k = ($("geminiApiKey")?.value || "").trim();
      if (!k) {
        logMsg("SYSTEM", "Mundhu API Key enter cheyandi.");
        return;
      }
      localStorage.setItem(API_KEY_STORAGE, k);
      logMsg("SYSTEM", "API Key localStorage lo save ayindi.");
    });

    // SEND + Enter key
    $("sendBtn")?.addEventListener("click", handleSend);
    $("userInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSend();
    });

    // DOC upload
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
          attachedDoc = { name: file.name, mimeType: "application/pdf", base64, textContent: null };
          if ($("docStatus")) $("docStatus").textContent = `Attached PDF: ${file.name}`;
          logMsg("SYSTEM", `PDF attached: ${file.name}`);
        };
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
        reader.readAsText(file);
      }
    });

    // MIC (Speech Recognition)
    $("micBtn")?.addEventListener("click", () => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        logMsg("SYSTEM", "Ee browser lo SpeechRecognition support ledu. Chrome vadandi.");
        return;
      }
      recognition = new SR();
      recognition.lang = "en-IN";
      recognition.onstart = () => {
        if ($("voiceStatus")) $("voiceStatus").textContent = "● LISTENING";
        logMsg("SYSTEM", "Mic active — matladandi...");
      };
      recognition.onresult = (event) => {
        const spoken = event.results?.[0]?.[0]?.transcript || "";
        if ($("userInput")) $("userInput").value = spoken;
        handleSend();
      };
      recognition.onerror = (err) => {
        logMsg("MIC Error", err.error || "Mic permission issue");
      };
      recognition.onend = () => {
        if ($("voiceStatus")) $("voiceStatus").textContent = "● READY";
      };
      recognition.start();
    });

    // CAM toggle
    $("camBtn")?.addEventListener("click", async () => {
      try {
        if (camStream) {
          camStream.getTracks().forEach((t) => t.stop());
          camStream = null;
          logMsg("SYSTEM", "Camera off.");
          return;
        }
        camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        logMsg("SYSTEM", "Camera permission granted & active.");
      } catch (err) {
        logMsg("CAM Error", err.message || "Camera access failed.");
      }
    });

    // WAKE toggle
    $("wakeBtn")?.addEventListener("click", () => {
      wakeEnabled = !wakeEnabled;
      if ($("wakeStatus")) {
        $("wakeStatus").textContent = wakeEnabled ? "WAKE ON" : "WAKE OFF";
      }
      logMsg("SYSTEM", wakeEnabled ? "Wake mode ON." : "Wake mode OFF.");
    });

    // CLEAR
    $("clearBtn")?.addEventListener("click", () => {
      if ($("chatLog")) $("chatLog").innerHTML = "";
      attachedDoc = null;
      if ($("docFileInput")) $("docFileInput").value = "";
      if ($("docStatus")) $("docStatus").textContent = "No document attached";
      logMsg("SYSTEM", "Cleared.");
    });

    logMsg("SYSTEM", "J.A.R.V.I.S controls initialized.");
  } catch (err) {
    logMsg("INIT Error", err.message || String(err));
  }
}

document.addEventListener("DOMContentLoaded", initJarvis);
