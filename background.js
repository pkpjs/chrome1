chrome.runtime.onMessage.addListener((request) => {
  if (request.action !== "askBoth") return;

  const nonGPT = [
    { baseUrl: "https://gemini.google.com/", type: "GEMINI" },
    { baseUrl: "https://www.perplexity.ai/", type: "PERPLEXITY" },
  ];

  // Gemini & Perplexity 먼저 전송
  nonGPT.forEach(({ baseUrl, type }) => {
    chrome.tabs.query({ url: baseUrl + "*" }, (tabs) => {
      if (chrome.runtime.lastError) return;

      if (tabs.length > 0) {
        ensureSend(tabs[0].id, request.question, type);
      } else {
        chrome.tabs.create({ url: baseUrl, active: false }, (newTab) => {
          waitForLoad(newTab.id, () => {
            setTimeout(() => ensureSend(newTab.id, request.question, type), 3000);
          });
        });
      }
    });
  });

  // GPT는 마지막 — 500ms 지연, 탭 전환 없음 (팝업 유지)
  setTimeout(() => {
    const gptUrl = "https://chatgpt.com/";
    chrome.tabs.query({ url: gptUrl + "*" }, (tabs) => {
      if (chrome.runtime.lastError) return;

      if (tabs.length > 0) {
        ensureSend(tabs[0].id, request.question, "GPT");
      } else {
        chrome.tabs.create({ url: gptUrl, active: false }, (newTab) => {
          waitForLoad(newTab.id, () => {
            setTimeout(() => ensureSend(newTab.id, request.question, "GPT"), 3000);
          });
        });
      }
    });
  }, 500);
});

function waitForLoad(tabId, callback) {
  const listener = (id, info) => {
    if (id === tabId && info.status === "complete") {
      chrome.tabs.onUpdated.removeListener(listener);
      callback();
    }
  };
  chrome.tabs.onUpdated.addListener(listener);
}

function ensureSend(tabId, question, type, attempt = 0) {
  if (attempt >= 6) return;

  chrome.tabs.sendMessage(
    tabId,
    { action: "send", q: question, type },
    (response) => {
      if (chrome.runtime.lastError || !response) {
        chrome.scripting
          .executeScript({ target: { tabId }, files: ["inject.js"] })
          .then(() => setTimeout(() => ensureSend(tabId, question, type, attempt + 1), 1200))
          .catch(() => setTimeout(() => ensureSend(tabId, question, type, attempt + 1), 1500));
      }
    }
  );
}
