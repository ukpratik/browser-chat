const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const summarizePageBtn = document.getElementById("summarizePage");
const summarizeSelectionBtn = document.getElementById("summarizeSelection");
const chatSelectionBtn = document.getElementById("chatSelection");
const chatPromptEl = document.getElementById("chatPrompt");
const openOptionsEl = document.getElementById("openOptions");
const cancelStreamBtn = document.getElementById("cancelStream");

if (!cancelStreamBtn) {
  throw new Error("Missing cancelStream button in popup.html");
}

let activePort = null;
let cachedSettings = null;

summarizePageBtn.addEventListener("click", () =>
  runAction({ mode: "summary", source: "page" })
);
summarizeSelectionBtn.addEventListener("click", () =>
  runAction({ mode: "summary", source: "selection" })
);
chatSelectionBtn.addEventListener("click", () =>
  runAction({ mode: "chat", source: "selection", userPrompt: chatPromptEl.value })
);
openOptionsEl.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
cancelStreamBtn.addEventListener("click", cancelStreaming);

async function runAction({ mode, source, userPrompt }) {
  setStatus("Working...");
  setResult("");
  toggleCancel(true);

  try {
    const settings = await getSettings();
    applyOutputStyle(settings);
    if (!settings.apiKey) {
      setStatus("Set your API key in Settings.");
      toggleCancel(false);
      return;
    }

    const text =
      source === "selection"
        ? await getSelectionText()
        : await getPageContent();

    if (!text) {
      setStatus("No text found. Highlight something first.");
      toggleCancel(false);
      return;
    }

    if (mode === "chat" && !userPrompt?.trim()) {
      setStatus("Enter a question to ask about the selection.");
      toggleCancel(false);
      return;
    }

    if (supportsStreaming(settings.provider)) {
      await streamRequest({ mode, text, userPrompt });
      return;
    }

    const { result, error } = await sendToBackground({
      type: "llmRequest",
      mode,
      text,
      userPrompt
    });

    if (error) {
      setStatus(error);
      toggleCancel(false);
      return;
    }

    setStatus("Done.");
    setResult(result);
  } catch (err) {
    setStatus(err?.message || "Unexpected error");
  } finally {
    if (!activePort) {
      toggleCancel(false);
    }
  }
}

function setStatus(message) {
  statusEl.textContent = message || "";
}

function setResult(text) {
  resultEl.textContent = text || "";
}

function appendResult(text) {
  resultEl.textContent = (resultEl.textContent || "") + text;
}

function getCurrentTabId() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      if (!tab?.id) {
        reject(new Error("No active tab."));
      } else {
        resolve(tab.id);
      }
    });
  });
}

async function getSelectionText() {
  const tabId = await getCurrentTabId();
  const response = await sendMessageWithRetry(tabId, { type: "getSelectionText" });
  return response?.text;
}

async function getPageContent() {
  const tabId = await getCurrentTabId();
  const response = await sendMessageWithRetry(tabId, { type: "getPageContent" });
  return response?.text;
}

function getSettings() {
  if (cachedSettings) return Promise.resolve(cachedSettings);
  return new Promise((resolve) => {
    chrome.storage.local.get("llmSettings", (data) => {
      cachedSettings = data?.llmSettings || {};
      resolve(cachedSettings);
    });
  });
}

function supportsStreaming(provider) {
  return provider === "openai" || provider === "deepseek" || provider === "custom";
}

async function streamRequest({ mode, text, userPrompt }) {
  if (activePort) {
    activePort.disconnect();
    activePort = null;
  }

  activePort = chrome.runtime.connect({ name: "llmStream" });
  activePort.onDisconnect.addListener(() => {
    activePort = null;
    toggleCancel(false);
  });

  activePort.onMessage.addListener((msg) => {
    if (msg?.type === "chunk" && msg.content) {
      appendResult(msg.content);
    } else if (msg?.type === "done") {
      setStatus("Done.");
      activePort?.disconnect();
    } else if (msg?.type === "error") {
      setStatus(msg.message || "Stream error");
      activePort?.disconnect();
    }
  });

  activePort.postMessage({
    type: "llmStreamRequest",
    mode,
    text,
    userPrompt
  });

  setStatus("Streaming...");
}

function cancelStreaming() {
  if (activePort) {
    activePort.disconnect();
    activePort = null;
    setStatus("Cancelled.");
    toggleCancel(false);
  }
}

function toggleCancel(show) {
  cancelStreamBtn.style.display = show ? "block" : "none";
}

function applyOutputStyle(settings) {
  const font = settings.outputFont || "system";
  const textSize = Number(settings.outputTextSize) || 14;

  let fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  if (font === "serif") fontFamily = 'Georgia, "Times New Roman", serif';
  if (font === "mono") fontFamily = 'SFMono-Regular, Menlo, Consolas, "Courier New", monospace';

  resultEl.style.fontFamily = fontFamily;
  resultEl.style.fontSize = `${textSize}px`;
}

// Apply style on load
(async () => {
  const settings = await getSettings();
  applyOutputStyle(settings);
})();

async function sendMessageWithRetry(tabId, payload) {
  try {
    return await sendMessage(tabId, payload);
  } catch (err) {
    await injectContentScript(tabId);
    return sendMessage(tabId, payload);
  }
}

function sendMessage(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(response || {});
    });
  });
}

function sendToBackground(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      resolve(response || {});
    });
  });
}

function injectContentScript(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

function applyOutputStyle(settings) {
  const font = settings.outputFont || "system";
  const textSize = Number(settings.outputTextSize) || 14;

  let fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  if (font === "serif") fontFamily = 'Georgia, "Times New Roman", serif';
  if (font === "mono") fontFamily = 'SFMono-Regular, Menlo, Consolas, "Courier New", monospace';

  resultEl.style.fontFamily = fontFamily;
  resultEl.style.fontSize = `${textSize}px`;
}

(async () => {
  const settings = await getSettings();
  applyOutputStyle(settings);
})();
