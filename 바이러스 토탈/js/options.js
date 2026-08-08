const input = document.getElementById("apiKeyInput");
const saveBtn = document.getElementById("saveBtn");
const status = document.getElementById("status");

init();

async function init() {
  const { vtApiKey } = await chrome.storage.local.get("vtApiKey");
  if (vtApiKey) input.value = vtApiKey;
}

saveBtn.addEventListener("click", async () => {
  const key = input.value.trim();
  await chrome.storage.local.set({ vtApiKey: key });
  status.textContent = key ? "✓ 저장되었습니다" : "✓ API 키가 삭제되었습니다";
  status.classList.add("show");
  setTimeout(() => status.classList.remove("show"), 2500);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});
