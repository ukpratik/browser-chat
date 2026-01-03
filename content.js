function getSelectionText() {
  const selection = window.getSelection();
  return selection && selection.toString().trim();
}

function extractMainText() {
  // Prefer semantic containers if present.
  const main = document.querySelector("article, main");
  const target = main || document.body;

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      const text = node.textContent;
      if (!text || !text.trim()) return NodeFilter.FILTER_REJECT;
      const tag = node.parentElement.tagName.toLowerCase();
      if (["script", "style", "noscript"].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const parts = [];
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.trim();
    if (text) parts.push(text);
    if (parts.length > 4000) break; // avoid runaway size
  }

  return parts.join(" ");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "getSelectionText") {
    sendResponse({ text: getSelectionText() || "" });
    return;
  }

  if (message?.type === "getPageContent") {
    sendResponse({ text: extractMainText() });
    return;
  }
});

