# Summarizer & Chat Extension

Chrome MV3 extension to summarize pages or selections and chat with the selected context using your chosen LLM (OpenAI-compatible, Gemini, Deepseek). Supports streaming responses for OpenAI-compatible and Deepseek, customizable output font/size, and a built-in settings page to store API keys and model details.

## Features
- Summarize full page or highlighted selection.
- Chat about the highlighted selection (context-aware).
- Provider switcher: OpenAI-compatible, Gemini, Deepseek; custom base URL and model.
- Streaming responses (OpenAI-compatible, Deepseek) with cancel; Gemini falls back to one-shot.
- Content extraction that prefers article/main regions.
- Customizable output font (system/serif/mono) and text size.
- Options page for API key, model, base URL, font, and size.

## Setup
1. Open Chrome → `chrome://extensions`.
2. Enable Developer Mode.
3. Click “Load unpacked” and select this folder.
4. Optional: replace icons in `icons/` then click “Reload” in the extensions page.

## Configure
1. Click the extension icon → “Settings”.
2. Choose provider:
   - OpenAI-compatible: model (e.g., `gpt-4o-mini`), base URL `https://api.openai.com/v1`, API key `sk-...`.
   - Gemini: model (e.g., `gemini-1.5-flash`), base URL `https://generativelanguage.googleapis.com`, API key from Google AI Studio.
   - Deepseek: model (e.g., `deepseek-chat`), base URL `https://api.deepseek.com/v1`, API key from Deepseek.
3. Set output font (System/Serif/Monospace) and text size (px).
4. Save.

## Usage
- Summarize Page: summarizes extracted page text.
- Summarize Selection: highlights text first, then summarize.
- Chat with Selection: highlight text, enter a prompt, and stream/receive an answer.
- Cancel streaming with the “Cancel” button when available.

## Notes
- Content script auto-injects if messaging fails, but Chrome cannot inject into restricted pages (`chrome://*`, Web Store). Test on normal http/https pages.
- Streaming is only enabled for OpenAI-compatible and Deepseek. Gemini uses single-shot responses.
- API keys are stored in `chrome.storage.local`; keep them private and rotate as needed.
