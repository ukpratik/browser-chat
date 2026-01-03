const form = document.getElementById("settingsForm");
const providerEl = document.getElementById("provider");
const modelSelectEl = document.getElementById("modelSelect");
const customModelEl = document.getElementById("customModel");
const customProviderNameEl = document.getElementById("customProviderName");
const customProviderNameWrap = document.getElementById("customProviderNameWrap");
const apiKeyEl = document.getElementById("apiKey");
const baseUrlEl = document.getElementById("baseUrl");
const statusEl = document.getElementById("status");
const outputFontEl = document.getElementById("outputFont");
const outputTextSizeEl = document.getElementById("outputTextSize");

const PROVIDER_DEFAULTS = {
  openai: {
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"]
  },
  gemini: {
    model: "gemini-1.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com",
    models: ["gemini-1.5-flash", "gemini-1.5-pro"]
  },
  deepseek: {
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"]
  },
  custom: {
    model: "",
    baseUrl: "",
    models: []
  }
};

const OUTPUT_DEFAULTS = {
  font: "system",
  textSize: 14
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "Saving...";

  const provider = providerEl.value;
  const providerDefaults = PROVIDER_DEFAULTS[provider] || {};
  const selectedModel = modelSelectEl.value;
  const model =
    provider === "custom" || selectedModel === "__custom"
      ? customModelEl.value.trim()
      : selectedModel || providerDefaults.model;

  const settings = {
    provider,
    providerName:
      provider === "custom"
        ? customProviderNameEl.value.trim() || "custom"
        : provider,
    model,
    apiKey: apiKeyEl.value.trim(),
    baseUrl:
      baseUrlEl.value.trim() ||
      providerDefaults.baseUrl ||
      "",
    outputFont: outputFontEl.value || OUTPUT_DEFAULTS.font,
    outputTextSize:
      Number(outputTextSizeEl.value) ||
      OUTPUT_DEFAULTS.textSize
  };

  if (!settings.model) {
    statusEl.textContent = "Model is required.";
    return;
  }
  if (provider === "custom" && !settings.baseUrl) {
    statusEl.textContent = "Base URL is required for custom provider.";
    return;
  }

  try {
    await chrome.storage.local.set({ llmSettings: settings });
    statusEl.textContent = "Saved.";
  } catch (err) {
    statusEl.textContent = err?.message || "Failed to save settings.";
  }
});

(async function bootstrap() {
  const stored = await chrome.storage.local.get("llmSettings");
  const settings = stored?.llmSettings || {};

  providerEl.value = settings.provider || "openai";
  syncProviderUI(providerEl.value, settings);
  apiKeyEl.value = settings.apiKey || "";
  baseUrlEl.value =
    settings.baseUrl ||
    (PROVIDER_DEFAULTS[providerEl.value] || {}).baseUrl ||
    "";
  outputFontEl.value = settings.outputFont || OUTPUT_DEFAULTS.font;
  outputTextSizeEl.value = settings.outputTextSize || OUTPUT_DEFAULTS.textSize;
})();

providerEl.addEventListener("change", () => {
  syncProviderUI(providerEl.value, {});
});

modelSelectEl.addEventListener("change", () => {
  const v = modelSelectEl.value;
  if (v === "__custom") {
    customModelEl.style.display = "block";
  } else {
    customModelEl.style.display = "none";
    customModelEl.value = "";
  }
});

function syncProviderUI(provider, settings) {
  const defaults = PROVIDER_DEFAULTS[provider] || {};
  const modelValue = settings.model;

  const baseUrlFromSettings = settings.baseUrl;
  if (provider === "custom") {
    baseUrlEl.value = baseUrlFromSettings || "";
  } else {
    baseUrlEl.value = baseUrlFromSettings || defaults.baseUrl || "";
  }
  baseUrlEl.placeholder = defaults.baseUrl || "https://api.example.com/v1";

  if (provider === "custom") {
    customProviderNameWrap.style.display = "block";
    customProviderNameEl.value = settings.providerName || "custom";
  } else {
    customProviderNameWrap.style.display = "none";
    customProviderNameEl.value = "";
  }

  populateModels(provider, modelValue);
}

function populateModels(provider, currentModel) {
  const defaults = PROVIDER_DEFAULTS[provider] || {};
  modelSelectEl.innerHTML = "";

  if (provider === "custom") {
    modelSelectEl.style.display = "none";
    customModelEl.style.display = "block";
    customModelEl.value = currentModel || "";
    return;
  }

  modelSelectEl.style.display = "block";
  customModelEl.style.display = "none";
  customModelEl.value = "";

  const models = defaults.models || [];
  models.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    modelSelectEl.appendChild(opt);
  });

  const customOpt = document.createElement("option");
  customOpt.value = "__custom";
  customOpt.textContent = "Custom model...";
  modelSelectEl.appendChild(customOpt);

  if (currentModel) {
    const found = models.includes(currentModel);
    modelSelectEl.value = found ? currentModel : "__custom";
    if (!found) {
      customModelEl.style.display = "block";
      customModelEl.value = currentModel;
    }
  } else {
    modelSelectEl.value = defaults.model || models[0] || "__custom";
    if (modelSelectEl.value === "__custom") {
      customModelEl.style.display = "block";
    }
  }
}
