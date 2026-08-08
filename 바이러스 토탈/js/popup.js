const VT_BASE = "https://www.virustotal.com/api/v3";
const MAX_HISTORY = 5;

// 옵션 화면을 거치지 않고 API 키를 코드에 직접 넣고 싶다면 아래 따옴표 안에 붙여넣으세요.
// 예: const LOCAL_API_KEY = "abcdef1234567890";
// 값이 채워져 있으면 저장된 키/경고 배너보다 이 값이 우선 사용됩니다.
const LOCAL_API_KEY = "";

const els = {
  darkToggle: document.getElementById("darkToggle"),
  iconMoon: document.getElementById("iconMoon"),
  iconSun: document.getElementById("iconSun"),
  segmented: document.getElementById("segmented"),
  segIndicator: document.getElementById("segIndicator"),
  segBtns: document.querySelectorAll(".seg-btn"),
  panels: document.querySelectorAll(".panel"),
  urlInput: document.getElementById("urlInput"),
  scanUrlBtn: document.getElementById("scanUrlBtn"),
  scanCurrentTabBtn: document.getElementById("scanCurrentTabBtn"),
  ipInput: document.getElementById("ipInput"),
  scanIpBtn: document.getElementById("scanIpBtn"),
  apiKeyWarning: document.getElementById("apiKeyWarning"),
  openOptions: document.getElementById("openOptions"),
  idleState: document.getElementById("idleState"),
  historyWrap: document.getElementById("historyWrap"),
  historyList: document.getElementById("historyList"),
  loading: document.getElementById("loading"),
  loadingText: document.getElementById("loadingText"),
  result: document.getElementById("result"),
};

init();

async function init() {
  const { darkMode } = await chrome.storage.local.get("darkMode");
  setDarkMode(!!darkMode);

  const { vtApiKey } = await chrome.storage.local.get("vtApiKey");
  els.apiKeyWarning.classList.toggle("hidden", !!LOCAL_API_KEY || !!vtApiKey);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /^https?:\/\//i.test(tab.url)) {
      els.urlInput.value = tab.url;
    }
  } catch (e) { /* ignore */ }

  renderHistory();
}

// ---------- dark mode ----------
els.darkToggle.addEventListener("click", async () => {
  const isDark = document.body.classList.contains("dark");
  setDarkMode(!isDark);
  await chrome.storage.local.set({ darkMode: !isDark });
});

function setDarkMode(on) {
  document.body.classList.toggle("dark", on);
  els.iconMoon.classList.toggle("hidden", on);
  els.iconSun.classList.toggle("hidden", !on);
}

// ---------- segmented tabs ----------
els.segBtns.forEach((btn, idx) => {
  btn.addEventListener("click", () => {
    els.segBtns.forEach((b) => b.classList.remove("active"));
    els.panels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    els.segIndicator.style.transform = `translateX(${idx * 100}%)`;
    showIdle();
  });
});

els.openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// ---------- actions ----------
els.scanUrlBtn.addEventListener("click", () => runUrlScan(els.urlInput.value.trim()));
els.urlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runUrlScan(els.urlInput.value.trim()); });

els.scanCurrentTabBtn.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !/^https?:\/\//i.test(tab.url)) {
      showError("현재 탭의 URL을 가져올 수 없습니다.");
      return;
    }
    els.urlInput.value = tab.url;
    runUrlScan(tab.url);
  } catch (e) {
    showError("현재 탭 정보를 가져오지 못했습니다.");
  }
});

els.scanIpBtn.addEventListener("click", () => runIpScan(els.ipInput.value.trim()));
els.ipInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runIpScan(els.ipInput.value.trim()); });

// ---------- core scan logic ----------
async function runUrlScan(rawUrl) {
  if (!rawUrl) return showError("URL을 입력해 주세요.");

  const apiKey = await getApiKey();
  if (!apiKey) return;

  let url = rawUrl;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  try {
    new URL(url);
  } catch (e) {
    return showError("올바른 URL 형식이 아닙니다.");
  }

  setLoading(true, "URL 검사 중...");
  try {
    const urlId = toUrlId(url);
    let data = await vtGet(`/urls/${urlId}`, apiKey);
    let stats, results;

    if (!data) {
      setLoading(true, "VirusTotal에 제출 중...");
      const submitRes = await vtPost("/urls", apiKey, `url=${encodeURIComponent(url)}`);
      const analysisId = submitRes.data.id;
      ({ stats, results } = await pollAnalysis(analysisId, apiKey));
    } else {
      stats = data.data.attributes.last_analysis_stats;
      results = data.data.attributes.last_analysis_results;
    }

    const payload = {
      kind: "url",
      target: url,
      stats,
      threats: extractThreatTags(results),
      reportUrl: `https://www.virustotal.com/gui/url/${urlId}`,
    };
    renderResult(payload);
    await pushHistory(payload);
  } catch (err) {
    showError(friendlyError(err));
  } finally {
    setLoading(false);
  }
}

async function runIpScan(ip) {
  if (!ip) return showError("IP 주소를 입력해 주세요.");
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return showError("올바른 IPv4 주소 형식이 아닙니다.");

  const apiKey = await getApiKey();
  if (!apiKey) return;

  setLoading(true, "IP 조회 중...");
  try {
    const data = await vtGet(`/ip_addresses/${ip}`, apiKey);
    if (!data) return showError("조회 결과가 없습니다.");
    const stats = data.data.attributes.last_analysis_stats;
    const results = data.data.attributes.last_analysis_results;
    const payload = {
      kind: "ip",
      target: ip,
      stats,
      threats: extractThreatTags(results),
      reportUrl: `https://www.virustotal.com/gui/ip-address/${ip}`,
      extra: {
        country: data.data.attributes.country,
        owner: data.data.attributes.as_owner,
      },
    };
    renderResult(payload);
    await pushHistory(payload);
  } catch (err) {
    showError(friendlyError(err));
  } finally {
    setLoading(false);
  }
}

async function pollAnalysis(analysisId, apiKey, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    setLoading(true, `분석 결과 대기 중... (${i + 1}/${attempts})`);
    const res = await vtGet(`/analyses/${analysisId}`, apiKey, true);
    const attrs = res.data.attributes;
    if (attrs.status === "completed") return { stats: attrs.stats, results: attrs.results };
    await sleep(2000);
  }
  throw new Error("TIMEOUT");
}

// 각 백신 엔진의 판정 결과(예: "malware site", "phishing", "spam")를 모아
// 가장 많이 언급된 위협 유형 태그로 요약합니다.
function extractThreatTags(results) {
  if (!results) return [];
  const counts = {};
  for (const key in results) {
    const r = results[key];
    if (!r) continue;
    const category = r.category;
    if (category !== "malicious" && category !== "suspicious") continue;
    let label = (r.result || category || "").toString().trim().toLowerCase();
    if (!label || label === "clean" || label === "unrated") continue;
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));
}

// ---------- VT API helpers ----------
async function vtGet(path, apiKey, raw = false) {
  const res = await fetch(VT_BASE + path, { headers: { "x-apikey": apiKey } });
  if (res.status === 404) return raw ? Promise.reject(new Error("NOT_FOUND")) : null;
  if (!res.ok) throw new Error("HTTP_" + res.status);
  return res.json();
}

async function vtPost(path, apiKey, body) {
  const res = await fetch(VT_BASE + path, {
    method: "POST",
    headers: { "x-apikey": apiKey, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("HTTP_" + res.status);
  return res.json();
}

function toUrlId(url) {
  const b64 = btoa(unescape(encodeURIComponent(url)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getApiKey() {
  if (LOCAL_API_KEY) {
    els.apiKeyWarning.classList.add("hidden");
    return LOCAL_API_KEY;
  }
  const { vtApiKey } = await chrome.storage.local.get("vtApiKey");
  if (!vtApiKey) {
    flashApiKeyWarning();
    return null;
  }
  els.apiKeyWarning.classList.add("hidden");
  return vtApiKey;
}

function flashApiKeyWarning() {
  els.apiKeyWarning.classList.remove("hidden");
  els.apiKeyWarning.scrollIntoView({ behavior: "smooth", block: "nearest" });
  els.apiKeyWarning.classList.remove("shake");
  // restart animation
  void els.apiKeyWarning.offsetWidth;
  els.apiKeyWarning.classList.add("shake");
}

function friendlyError(err) {
  const msg = err && err.message ? err.message : String(err);
  if (msg === "TIMEOUT") return "분석이 아직 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.";
  if (msg === "HTTP_401") return "API 키가 유효하지 않습니다. 옵션에서 확인해 주세요.";
  if (msg === "HTTP_429") return "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";
  if (msg.startsWith("HTTP_")) return "VirusTotal 요청 실패 (" + msg.replace("HTTP_", "") + ")";
  return "오류가 발생했습니다: " + msg;
}

// ---------- verdict ----------
function computeVerdict(stats) {
  const malicious = stats.malicious || 0;
  const suspicious = stats.suspicious || 0;
  if (malicious > 0) return "danger";
  if (suspicious > 0) return "unknown";
  return "safe";
}

// ---------- state management ----------
function setLoading(on, text) {
  if (on) {
    // 로딩을 시작할 때만 idle/result를 감추고 스피너를 보여줍니다.
    // 로딩을 끝낼 때는(on=false) renderResult/showError가 이미 결과 화면을
    // 세팅해 두었으므로 여기서 다시 감추지 않습니다.
    els.idleState.classList.add("hidden");
    els.result.classList.add("hidden");
    els.loading.classList.remove("hidden");
  } else {
    els.loading.classList.add("hidden");
  }
  if (text) els.loadingText.textContent = text;
  els.scanUrlBtn.disabled = on;
  els.scanCurrentTabBtn.disabled = on;
  els.scanIpBtn.disabled = on;
}

function showIdle() {
  els.loading.classList.add("hidden");
  els.result.classList.add("hidden");
  els.result.innerHTML = "";
  els.idleState.classList.remove("hidden");
}

function showError(msg) {
  els.idleState.classList.add("hidden");
  els.loading.classList.add("hidden");
  els.result.classList.remove("hidden");
  els.result.innerHTML = `
    <div class="error-box">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>${escapeHtml(msg)}</span>
    </div>`;
}

// ---------- rendering ----------
function renderResult({ kind, target, stats, reportUrl, extra, threats }) {
  const malicious = stats.malicious || 0;
  const suspicious = stats.suspicious || 0;
  const harmless = stats.harmless || 0;
  const undetected = stats.undetected || 0;
  const total = malicious + suspicious + harmless + undetected;

  const level = computeVerdict(stats);
  const ICONS = {
    safe: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    danger: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>',
    unknown: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2 2-2.3 3.5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>',
  };
  const labels = { safe: "안전", danger: "위험 감지", unknown: "의심스러움" };
  const flagged = malicious + suspicious;
  const rawPct = total > 0 ? Math.round((flagged / total) * 100) : 0;

  let pct, ringColor, gaugeInner;
  if (level === "safe") {
    pct = 100;
    ringColor = "var(--safe)";
    gaugeInner = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--safe)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  } else if (level === "danger") {
    pct = Math.max(rawPct, 8);
    ringColor = "var(--danger)";
    gaugeInner = String(malicious);
  } else {
    pct = Math.max(rawPct, 8);
    ringColor = "var(--warn)";
    gaugeInner = String(suspicious);
  }

  const extraLine = extra
    ? `<div class="extra-line"><span>국가 <b>${escapeHtml(extra.country || "-")}</b></span><span>소유자 <b>${escapeHtml(extra.owner || "-")}</b></span></div>`
    : "";

  const threatTagsHtml = threats && threats.length
    ? `<div class="threat-tags">
        <div class="threat-tags-title">탐지된 위협 유형</div>
        <div class="threat-tags-row">
          ${threats.map((t) => `<span class="threat-tag">${escapeHtml(t.label)}<b>${t.count}</b></span>`).join("")}
        </div>
      </div>`
    : "";

  els.idleState.classList.add("hidden");
  els.loading.classList.add("hidden");
  els.result.classList.remove("hidden");
  els.result.innerHTML = `
    <div class="result-card">
      <div class="result-banner ${level}">
        <div class="gauge" style="--pct:${pct}; --ring-color:${ringColor};">
          <div class="gauge-inner">${gaugeInner}</div>
        </div>
        <div class="result-banner-text">
          <div class="result-verdict ${level}">${ICONS[level]} ${labels[level]}</div>
          <div class="result-target">${kind === "url" ? "URL" : "IP"} · ${escapeHtml(target)}</div>
        </div>
      </div>
      <div class="result-body">
        ${extraLine}
        ${threatTagsHtml}
        <div class="stat-grid">
          <div class="stat malicious"><span class="num">${malicious}</span><span class="label">악성</span></div>
          <div class="stat suspicious"><span class="num">${suspicious}</span><span class="label">의심</span></div>
          <div class="stat harmless"><span class="num">${harmless}</span><span class="label">안전</span></div>
          <div class="stat"><span class="num">${undetected}</span><span class="label">미탐지</span></div>
        </div>
        <div class="result-actions">
          <button class="rescan-btn" id="rescanBtn">새 검사</button>
          <a class="result-link" href="${reportUrl}" target="_blank" rel="noopener">
            전체 보고서
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
          </a>
        </div>
      </div>
    </div>
  `;
  document.getElementById("rescanBtn").addEventListener("click", () => {
    showIdle();
    (kind === "url" ? els.urlInput : els.ipInput).focus();
  });
}

// ---------- history ----------
async function pushHistory(payload) {
  const level = computeVerdict(payload.stats);
  const entry = { kind: payload.kind, target: payload.target, level, ts: Date.now() };
  const { history = [] } = await chrome.storage.local.get("history");
  const filtered = history.filter((h) => !(h.kind === entry.kind && h.target === entry.target));
  filtered.unshift(entry);
  const trimmed = filtered.slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ history: trimmed });
  renderHistory(trimmed);
}

async function renderHistory(preloaded) {
  const history = preloaded || (await chrome.storage.local.get("history")).history || [];
  if (!history.length) {
    els.historyWrap.classList.add("hidden");
    return;
  }
  els.historyWrap.classList.remove("hidden");
  els.historyList.innerHTML = history
    .map(
      (h, i) => `
      <div class="history-item" data-idx="${i}">
        <span class="history-dot ${h.level}"></span>
        <span class="history-target">${escapeHtml(h.target)}</span>
        <span class="history-kind">${h.kind === "url" ? "URL" : "IP"}</span>
      </div>`
    )
    .join("");

  els.historyList.querySelectorAll(".history-item").forEach((item) => {
    item.addEventListener("click", () => {
      const h = history[Number(item.dataset.idx)];
      if (h.kind === "url") {
        document.querySelector('.seg-btn[data-tab="url"]').click();
        els.urlInput.value = h.target;
        runUrlScan(h.target);
      } else {
        document.querySelector('.seg-btn[data-tab="ip"]').click();
        els.ipInput.value = h.target;
        runIpScan(h.target);
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
