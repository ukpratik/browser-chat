const form = document.getElementById("settingsForm");
const providerEl = document.getElementById("provider");
const modelEl = document.getElementById("model");
const apiKeyEl = document.getElementById("apiKey");
const baseUrlEl = document.getElementById("baseUrl");
const statusEl = document.getElementById("status");

const PROVIDER_DEFAULTS = {
  openai: {
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "e.g. gpt-4o-mini"
  },
  gemini: {
    model: "gemini-1.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com",
    modelPlaceholder: "e.g. gemini-1.5-flash"
  },
  deepseek: {
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    modelPlaceholder: "e.g. deepseek-chat"
  }
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "Saving...";

  const provider = providerEl.value;
  const settings = {
    provider,
    model: modelEl.value.trim() || PROVIDER_DEFAULTS[provider].model,
    apiKey: apiKeyEl.value.trim(),
    baseUrl:
      baseUrlEl.value.trim() ||
      PROVIDER_DEFAULTS[provider]?.baseUrl ||
      PROVIDER_DEFAULTS.openai.baseUrl
  };

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
  const defaults = PROVIDER_DEFAULTS[providerEl.value] || PROVIDER_DEFAULTS.openai;

  modelEl.value = settings.model || defaults.model;
  apiKeyEl.value = settings.apiKey || "";
  baseUrlEl.value = settings.baseUrl || defaults.baseUrl;

  updatePlaceholders(providerEl.value);
})();

providerEl.addEventListener("change", () => {
  const provider = providerEl.value;
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai;
  updatePlaceholders(provider);

  if (!modelEl.value.trim()) {
    modelEl.value = defaults.model;
  }
  if (!baseUrlEl.value.trim()) {
    baseUrlEl.value = defaults.baseUrl;
  }
});

function updatePlaceholders(provider) {
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai;
  modelEl.placeholder = defaults.modelPlaceholder;
  baseUrlEl.placeholder = defaults.baseUrl;
}

