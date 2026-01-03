const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const summarizePageBtn = document.getElementById("summarizePage");
const summarizeSelectionBtn = document.getElementById("summarizeSelection");
const chatSelectionBtn = document.getElementById("chatSelection");
const chatPromptEl = document.getElementById("chatPrompt");
const openOptionsEl = document.getElementById("openOptions");

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

async function runAction({ mode, source, userPrompt }) {
  setStatus("Working...");
  setResult("");

  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      setStatus("Set your API key in Settings.");
      return;
    }

    const text =
      source === "selection"
        ? await getSelectionText()
        : await getPageContent();

    if (!text) {
      setStatus("No text found. Highlight something first.");
      return;
    }

    if (mode === "chat" && !userPrompt?.trim()) {
      setStatus("Enter a question to ask about the selection.");
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
      return;
    }

    setStatus("Done.");
    setResult(result);
  } catch (err) {
    setStatus(err?.message || "Unexpected error");
  }
}

function setStatus(message) {
  statusEl.textContent = message || "";
}

function setResult(text) {
  resultEl.textContent = text || "";
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
  return new Promise((resolve) => {
    chrome.storage.local.get("llmSettings", (data) => {
      resolve(data?.llmSettings || {});
    });
  });
}

async function sendMessageWithRetry(tabId, payload) {
  try {
    return await sendMessage(tabId, payload);
  } catch (err) {
    // Attempt to inject the content script and retry once.
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

