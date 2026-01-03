const PROVIDER_DEFAULTS = {
  openai: {
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1"
  },
  gemini: {
    model: "gemini-1.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com"
  },
  deepseek: {
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1"
  }
};

const DEFAULT_SETTINGS = {
  provider: "openai",
  apiKey: "",
  model: PROVIDER_DEFAULTS.openai.model,
  baseUrl: PROVIDER_DEFAULTS.openai.baseUrl
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== "llmRequest") {
    return;
  }

  handleLLMRequest(request)
    .then((data) => sendResponse({ result: data }))
    .catch((err) => sendResponse({ error: err?.message || "Unknown error" }));

  return true; // keep the message channel open for async response
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "llmStream") return;

  port.onMessage.addListener((msg) => {
    if (msg?.type === "llmStreamRequest") {
      handleLLMStream(port, msg).catch((err) => {
        port.postMessage({ type: "error", message: err?.message || "Unknown error" });
        try {
          port.disconnect();
        } catch (_) {
          // ignore
        }
      });
    }
  });
});

async function handleLLMRequest(request) {
  const settings = await getSettings();
  validateSettings(settings);

  const { mode, text, userPrompt } = request;
  if (!text || !text.trim()) {
    throw new Error("No text found to send to the model.");
  }

  const messages = buildMessages({ mode, text, userPrompt });

  if (settings.provider === "gemini") {
    return callGemini({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      messages
    });
  }

  // default to OpenAI-compatible
  return callOpenAI({
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    messages
  });
}

async function handleLLMStream(port, request) {
  const settings = await getSettings();
  validateSettings(settings);

  const { mode, text, userPrompt } = request;
  if (!text || !text.trim()) {
    throw new Error("No text found to send to the model.");
  }

  const messages = buildMessages({ mode, text, userPrompt });
  const supportsStreaming = ["openai", "deepseek"].includes(settings.provider);

  // If provider cannot stream, fall back to one-shot and send once.
  if (!supportsStreaming) {
    const result = await handleLLMRequest(request);
    port.postMessage({ type: "chunk", content: result });
    port.postMessage({ type: "done" });
    return;
  }

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  await streamOpenAICompatible({
    port,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    messages,
    signal: controller.signal
  });
}

async function getSettings() {
  const stored = await chrome.storage.local.get("llmSettings");
  const merged = { ...DEFAULT_SETTINGS, ...(stored?.llmSettings || {}) };
  const providerDefaults = PROVIDER_DEFAULTS[merged.provider] || PROVIDER_DEFAULTS.openai;

  return {
    ...merged,
    baseUrl: merged.baseUrl || providerDefaults.baseUrl,
    model: merged.model || providerDefaults.model
  };
}

function validateSettings(settings) {
  if (!settings.apiKey) {
    throw new Error("API key is missing. Set it in the options page.");
  }
  if (!settings.model) {
    throw new Error("Model is missing. Set it in the options page.");
  }
}

function buildMessages({ mode, text, userPrompt }) {
  if (mode === "chat") {
    return [
      {
        role: "system",
        content:
          "You are a helpful assistant. Use the provided context to answer concisely. If the answer is uncertain, say you are unsure."
      },
      {
        role: "user",
        content: `Context:\n${text}\n\nQuestion: ${userPrompt || "Explain this."}`
      }
    ];
  }

  // default to summary
  return [
    {
      role: "system",
      content:
        "You are a concise summarizer. Return the main ideas in 4-6 bullet points. Keep it short and factual."
    },
    {
      role: "user",
      content: `Summarize the following content:\n${text}`
    }
  ];
}

async function callOpenAI({ apiKey, baseUrl, model, messages }) {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = {
    model,
    messages,
    temperature: 0.3
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Model request failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No content returned from the model.");
  }
  return content.trim();
}

async function streamOpenAICompatible({ port, apiKey, baseUrl, model, messages, signal }) {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = {
    model,
    messages,
    temperature: 0.3,
    stream: true
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Model request failed: ${resp.status} ${text}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) {
    throw new Error("Streaming not supported by response body.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;

      const payload = line.replace(/^data:\s*/, "");
      if (payload === "[DONE]") {
        port.postMessage({ type: "done" });
        return;
      }

      try {
        const json = JSON.parse(payload);
        const deltaText = extractDeltaText(json);
        if (deltaText) {
          port.postMessage({ type: "chunk", content: deltaText });
        }
      } catch (err) {
        port.postMessage({ type: "error", message: err?.message || "Stream parse error" });
      }
    }
  }

  if (buffer.trim()) {
    try {
      const json = JSON.parse(buffer.trim().replace(/^data:\s*/, ""));
      const deltaText = extractDeltaText(json);
      if (deltaText) {
        port.postMessage({ type: "chunk", content: deltaText });
      }
    } catch (_) {
      // ignore trailing parse errors
    }
  }

  port.postMessage({ type: "done" });
}

function extractDeltaText(json) {
  // OpenAI-compatible stream: choices[0].delta.content can be string or array
  const delta = json?.choices?.[0]?.delta;
  if (!delta) return "";
  if (typeof delta.content === "string") return delta.content;
  if (Array.isArray(delta.content)) {
    return delta.content
      .map((c) => (typeof c?.text === "string" ? c.text : c?.content || ""))
      .filter(Boolean)
      .join("");
  }
  return "";
}

async function callGemini({ apiKey, baseUrl, model, messages }) {
  const urlBase = baseUrl.replace(/\/+$/, "");
  const promptText = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const body = {
    contents: [
      {
        parts: [{ text: promptText }]
      }
    ],
    generationConfig: {
      temperature: 0.3
    }
  };

  const url = `${urlBase}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Model request failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const combined =
    parts
      ?.map((p) => p.text)
      ?.filter(Boolean)
      ?.join(" ")
      ?.trim() || "";

  if (!combined) {
    throw new Error("No content returned from the model.");
  }

  return combined;
}

