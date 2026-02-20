document.addEventListener("DOMContentLoaded", () => {
  const input     = document.getElementById("questionInput");
  const btn       = document.getElementById("askBothBtn");
  const status    = document.getElementById("statusText");
  const charCount = document.getElementById("charCount");
  const clearBtn  = document.getElementById("clearBtn");

  /* ── 팝업 열릴 때 기존 저장된 답변 즉시 표시 ── */
  chrome.storage.local.get(
    ["geminiData", "gptData", "perplexityData",
     "geminiAnswer", "gptAnswer", "perplexityAnswer"],
    (data) => {
      if (data.geminiData)            renderContent("geminiResult",     data.geminiData);
      else if (data.geminiAnswer)     renderContent("geminiResult",     { text: data.geminiAnswer,     links: [], codes: [] });

      if (data.gptData)               renderContent("gptResult",        data.gptData);
      else if (data.gptAnswer)        renderContent("gptResult",        { text: data.gptAnswer,        links: [], codes: [] });

      if (data.perplexityData)        renderContent("perplexityResult", data.perplexityData);
      else if (data.perplexityAnswer) renderContent("perplexityResult", { text: data.perplexityAnswer, links: [], codes: [] });
    }
  );

  /* ── storage 변경 실시간 반영 ── */
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.geminiData)            { renderContent("geminiResult",     changes.geminiData.newValue);            updateStatus(); }
    else if (changes.geminiAnswer)     { renderContent("geminiResult",     { text: changes.geminiAnswer.newValue,     links: [], codes: [] }); updateStatus(); }

    if (changes.gptData)               { renderContent("gptResult",        changes.gptData.newValue);               updateStatus(); }
    else if (changes.gptAnswer)        { renderContent("gptResult",        { text: changes.gptAnswer.newValue,        links: [], codes: [] }); updateStatus(); }

    if (changes.perplexityData)        { renderContent("perplexityResult", changes.perplexityData.newValue);        updateStatus(); }
    else if (changes.perplexityAnswer) { renderContent("perplexityResult", { text: changes.perplexityAnswer.newValue, links: [], codes: [] }); updateStatus(); }
  });

  /* ── 글자 수 카운터 ── */
  input.addEventListener("input", () => {
    charCount.textContent = input.value.length + "자";
  });

  /* ── Enter → 전송 (Shift+Enter는 줄바꿈) ── */
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      btn.click();
    }
  });

  /* ── 동시 질문 버튼 ── */
  btn.addEventListener("click", () => {
    const q = input.value.trim();
    if (!q) return;

    const loadingData = { text: "생성 중...", links: [], codes: [] };
    renderContent("geminiResult",     loadingData);
    renderContent("gptResult",        loadingData);
    renderContent("perplexityResult", loadingData);

    chrome.storage.local.set({
      geminiAnswer: "생성 중...", gptAnswer: "생성 중...", perplexityAnswer: "생성 중...",
      geminiData: loadingData, gptData: loadingData, perplexityData: loadingData,
    });

    status.textContent = "⚡ 전송 중...";
    btn.disabled = true;

    chrome.runtime.sendMessage({ action: "askBoth", question: q });
    setTimeout(() => { btn.disabled = false; }, 2000);
  });

  /* ── 초기화 버튼 ── */
  clearBtn.addEventListener("click", () => {
    input.value = "";
    charCount.textContent = "0자";
    const emptyData = { text: "대기 중...", links: [], codes: [] };
    renderContent("geminiResult",     emptyData);
    renderContent("gptResult",        emptyData);
    renderContent("perplexityResult", emptyData);
    chrome.storage.local.remove([
      "geminiAnswer", "gptAnswer", "perplexityAnswer",
      "geminiData", "gptData", "perplexityData",
    ]);
    status.textContent = "실시간 연동 중";
  });

  /* ── 헤더 링크 클릭 → 해당 AI 탭으로 이동 (없으면 새 탭) ── */
  document.querySelectorAll(".header-link").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const url = a.dataset.url;
      chrome.tabs.query({ url: url + "*" }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, { active: true });
          chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
          chrome.tabs.create({ url });
        }
      });
    });
  });

  /* ── 복사 버튼 (답변 텍스트만 복사) ── */
  document.querySelectorAll(".copy-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const el = document.getElementById(b.dataset.target);
      const textEl = el?.querySelector(".answer-text");
      const text   = textEl?.innerText || el?.innerText;
      if (!text || text === "대기 중..." || text === "생성 중...") return;
      navigator.clipboard.writeText(text).then(() => {
        b.textContent = "✓ 완료";
        setTimeout(() => (b.textContent = "복사"), 1500);
      });
    });
  });

  /* ── 코드 복사 버튼 (동적 생성 요소 대응) ── */
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("code-copy-btn")) {
      const code = e.target.dataset.code || "";
      navigator.clipboard.writeText(code).then(() => {
        e.target.textContent = "✓";
        setTimeout(() => (e.target.textContent = "복사"), 1500);
      });
    }
  });

  /* ══════════════════════════════════════════
   * HTML 렌더링 헬퍼들
   * ══════════════════════════════════════════ */

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* 인라인 마크다운 (bold / italic) 변환 — escapeHtml 이후에 적용 */
  function applyInline(str) {
    return str
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,     "<em>$1</em>");
  }

  /* 마크다운 텍스트 → HTML 변환 (줄 단위 파싱) */
  function formatText(text) {
    if (!text) return "";
    if (text === "생성 중..." || text === "대기 중...") {
      return `<span class="status-text">${text}</span>`;
    }

    /* ① 코드 블록 / 인라인 코드 플레이스홀더로 임시 치환 */
    const codeMap = [];
    let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeMap.length;
      codeMap.push({ lang, code: code.trim() });
      return `\n__CODE_BLOCK_${idx}__\n`;
    });
    const inlineMap = [];
    processed = processed.replace(/`([^`\n]+)`/g, (_, code) => {
      const idx = inlineMap.length;
      inlineMap.push(code);
      return `__INLINE_${idx}__`;
    });

    /* ② 줄 단위 파싱 */
    const lines = processed.split("\n");
    let html  = "";
    let inUL  = false; // 현재 <ul> 열려 있는지

    const closeUL = () => { if (inUL) { html += "</ul>"; inUL = false; } };

    for (const raw of lines) {
      const line = raw.trimEnd();

      /* 코드 블록 플레이스홀더 */
      if (/^__CODE_BLOCK_\d+__$/.test(line.trim())) {
        closeUL();
        html += line.trim(); // 나중에 치환
        continue;
      }

      /* 불릿 항목: •, -, * 로 시작 (들여쓰기 무관) */
      const bulletM = line.match(/^(\s*)[•\-\*]\s+(.+)/);
      if (bulletM) {
        const indent = bulletM[1].length;
        const content = applyInline(escapeHtml(bulletM[2]));
        if (!inUL) { html += '<ul class="answer-list">'; inUL = true; }
        html += indent > 0
          ? `<li class="answer-li answer-li--sub"><span class="li-bullet">·</span><span>${content}</span></li>`
          : `<li class="answer-li"><span class="li-bullet">▸</span><span>${content}</span></li>`;
        continue;
      }

      /* 번호 섹션: "1. 제목" */
      const secM = line.match(/^(\d+)\.\s+(.+)/);
      if (secM) {
        closeUL();
        html += `<div class="sec-header"><span class="sec-badge">${escapeHtml(secM[1])}</span><span class="sec-title">${applyInline(escapeHtml(secM[2]))}</span></div>`;
        continue;
      }

      /* 마크다운 헤더 */
      const h3m = line.match(/^### (.+)/);
      const h2m = line.match(/^## (.+)/);
      const h1m = line.match(/^# (.+)/);
      if (h3m) { closeUL(); html += `<h4>${applyInline(escapeHtml(h3m[1]))}</h4>`; continue; }
      if (h2m) { closeUL(); html += `<h3>${applyInline(escapeHtml(h2m[1]))}</h3>`; continue; }
      if (h1m) { closeUL(); html += `<h2>${applyInline(escapeHtml(h1m[1]))}</h2>`; continue; }

      /* 빈 줄 → 간격 */
      if (line.trim() === "") {
        closeUL();
        html += '<div class="para-gap"></div>';
        continue;
      }

      /* 일반 텍스트 */
      closeUL();
      html += `<p class="answer-p">${applyInline(escapeHtml(line))}</p>`;
    }

    closeUL();

    /* ③ 플레이스홀더 복원 */
    inlineMap.forEach((code, idx) => {
      html = html.split(`__INLINE_${idx}__`).join(
        `<code class="inline-code">${escapeHtml(code)}</code>`
      );
    });
    codeMap.forEach(({ lang, code }, idx) => {
      html = html.split(`__CODE_BLOCK_${idx}__`).join(`
        <div class="code-block">
          <div class="code-header">
            <span class="code-lang">${escapeHtml(lang || "code")}</span>
            <button class="code-copy-btn" data-code="${escapeHtml(code)}">복사</button>
          </div>
          <pre class="code-pre"><code>${escapeHtml(code)}</code></pre>
        </div>`);
    });

    return `<div class="answer-text">${html}</div>`;
  }

  /* 메인 렌더링 함수: data = { text, links, codes } */
  function renderContent(id, data) {
    const el = document.getElementById(id);
    if (!el) return;

    if (!data || typeof data !== "object") {
      el.innerHTML = `<span class="status-text">${escapeHtml(String(data || "대기 중..."))}</span>`;
      return;
    }

    const { text = "", links = [], codes = [] } = data;

    let html = formatText(text);

    const domCodes = Array.isArray(codes) ? codes : [];
    if (domCodes.length > 0) {
      html += '<div class="codes-section">';
      domCodes.forEach((c) => {
        html += `<div class="code-block">
          <div class="code-header">
            <span class="code-lang">${escapeHtml(c.lang || "code")}</span>
            <button class="code-copy-btn" data-code="${escapeHtml(c.code)}">복사</button>
          </div>
          <pre class="code-pre"><code>${escapeHtml(c.code)}</code></pre>
        </div>`;
      });
      html += "</div>";
    }

    const domLinks = Array.isArray(links) ? links : [];
    if (domLinks.length > 0) {
      html += '<div class="sources-section"><div class="sources-title">🔗 출처</div>';
      domLinks.slice(0, 6).forEach((l, i) => {
        const displayText = (l.text || l.url || "").slice(0, 55);
        html += `<a class="source-link" href="${escapeHtml(l.url)}" target="_blank">
          <span class="source-num">${i + 1}</span>
          <span class="source-text">${escapeHtml(displayText)}${(l.text || "").length > 55 ? "…" : ""}</span>
        </a>`;
      });
      html += "</div>";
    }

    el.innerHTML = html;
    if (text === "생성 중...") el.scrollTop = 0;
  }

  /* ── 상태 표시 업데이트 ── */
  function updateStatus() {
    const ids = ["geminiResult", "gptResult", "perplexityResult"];
    const loading = ids.some((id) => {
      const el = document.getElementById(id);
      return el?.querySelector(".status-text")?.textContent === "생성 중...";
    });
    status.textContent = loading ? "⏳ 생성 중..." : "✅ 완료";
    if (!loading) setTimeout(() => (status.textContent = "실시간 연동 중"), 3000);
  }
});
