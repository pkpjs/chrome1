(function () {
  if (window._aiDualInjected) return;
  window._aiDualInjected = true;

  /* ────────────────────────────────────────────
   * 확장 컨텍스트 유효성 체크
   * ──────────────────────────────────────────── */
  function isContextValid() {
    try { return !!chrome.runtime?.id; } catch (e) { return false; }
  }

  function safeStorageSet(data) {
    if (!isContextValid()) { window._aiDualInjected = false; return false; }
    try { chrome.storage.local.set(data); return true; }
    catch (e) { window._aiDualInjected = false; return false; }
  }

  /* ────────────────────────────────────────────
   * 입력 요소 찾기
   * ──────────────────────────────────────────── */
  function getInput(type) {
    if (type === 'GPT') {
      return document.querySelector('#prompt-textarea') ||
             document.querySelector('div.ProseMirror[contenteditable="true"]') ||
             document.querySelector('div[contenteditable="true"]');
    }
    if (type === 'GEMINI') {
      return document.querySelector('rich-textarea .ql-editor') ||
             document.querySelector('.ql-editor[contenteditable="true"]') ||
             document.querySelector('rich-textarea [contenteditable="true"]');
    }
    if (type === 'PERPLEXITY') {
      return document.querySelector('#ask-input') ||
             document.querySelector('div[contenteditable="true"][role="textbox"]') ||
             document.querySelector('div[contenteditable="true"]');
    }
    return null;
  }

  /* ────────────────────────────────────────────
   * 텍스트 주입
   *
   * GEMINI:     Quill API (rich-textarea.__quill)
   * GPT:        execCommand selectAll + insertText
   * PERPLEXITY: 기존내용 삭제 후 삽입 (중복 방지)
   * ──────────────────────────────────────────── */
  function injectText(input, text, type) {
    input.focus();

    if (type === 'GEMINI') {
      const quill = document.querySelector('rich-textarea')?.__quill;
      if (quill) {
        quill.setText(text);
        quill.setSelection(quill.getLength(), 0);
        return;
      }
      input.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = text;
      input.appendChild(p);

    } else if (type === 'GPT') {
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        if (input.textContent?.trim()) return;
      } catch (e) { /* 폴백 */ }
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));

    } else if (type === 'PERPLEXITY') {
      // ★ 완전 재작성: 단 하나의 삽입 경로만 실행 (중복 원천 차단)
      //
      // 이전 버그: execCommand('insertText')가 실제로 삽입했어도
      //   false 리턴 가능 → ok 체크 실패 → paste까지 실행 = 2번 삽입
      //
      // 수정: ok 리턴값 무시, 삽입 후 실제 input 내용으로만 판단
      //   + compositionend 제거 (전송 트리거 방지)
      //   + 항상 return (하단 이벤트 블록 실행 방지)
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);

      // 삽입 결과 확인: 비어있으면 paste 폴백 (절대 중복 없음)
      if (!input.textContent?.trim()) {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      }

      // input만 발생 (compositionend 제거)
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return; // 반드시 return — 하단 이벤트 블록 실행 방지
    }

    ['input', 'change', 'compositionend'].forEach((t) =>
      input.dispatchEvent(new Event(t, { bubbles: true, cancelable: true }))
    );
  }

  /* ────────────────────────────────────────────
   * 전송 버튼 클릭
   * ──────────────────────────────────────────── */
  function clickSend(type, input) {
    if (type === 'GPT') {
      const btn = document.querySelector('[data-testid="send-button"]') ||
                  document.querySelector('button[aria-label*="보내기"]') ||
                  document.querySelector('button[aria-label*="Send"]');
      if (btn && !btn.disabled) { btn.click(); return true; }
      const ev = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      input.dispatchEvent(new KeyboardEvent('keydown', ev));
      input.dispatchEvent(new KeyboardEvent('keyup', ev));
      return false;
    }

    if (type === 'GEMINI') {
      // ★ 수정: 더 많은 셀렉터 추가 (전송 실패 방지)
      const btn =
        document.querySelector('button[aria-label="메시지 보내기"]') ||
        document.querySelector('button[aria-label="Send message"]') ||
        document.querySelector('button[aria-label*="보내기"]') ||
        document.querySelector('button[aria-label*="전송"]') ||
        document.querySelector('button[aria-label*="send" i]') ||
        document.querySelector('button[aria-label*="Submit" i]') ||
        document.querySelector('mat-icon[fonticon="send"]')?.closest('button') ||
        document.querySelector('mat-icon[data-mat-icon-name="send"]')?.closest('button') ||
        document.querySelector('.send-button:not([disabled])') ||
        (() => {
          // mat-icon 텍스트로 검색
          for (const btn of document.querySelectorAll('button')) {
            const icon = btn.querySelector('mat-icon');
            if (icon && icon.textContent?.trim() === 'send' && !btn.disabled) return btn;
          }
          return null;
        })();
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    }

    if (type === 'PERPLEXITY') {
      const btn =
        document.querySelector('button[aria-label="제출"]') ||
        document.querySelector('button[aria-label*="Submit"]') ||
        document.querySelector('button[aria-label*="submit"]') ||
        document.querySelector('[data-testid*="send"]') ||
        document.querySelector('button[type="submit"]') ||
        document.querySelector('button svg[data-icon*="arrow"]')?.closest('button');
      if (btn && !btn.disabled) { btn.click(); return true; }
      const ev = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      input.dispatchEvent(new KeyboardEvent('keydown', ev));
      input.dispatchEvent(new KeyboardEvent('keyup', ev));
      return false;
    }
    return false;
  }

  /* ────────────────────────────────────────────
   * HTML → 텍스트 변환 (줄바꿈 보존)
   * ──────────────────────────────────────────── */
  function htmlToText(html) {
    if (!html) return '';
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<h[1-6][^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function getText(el) {
    if (!el) return '';
    const inner = el.innerText?.trim();
    if (inner) return inner;
    return htmlToText(el.innerHTML) || el.textContent?.trim() || '';
  }

  /* ────────────────────────────────────────────
   * 코드·링크 제거된 순수 본문 텍스트 추출
   *
   * ★ 핵심: innerText를 쓰면 <pre> 코드 내용과
   *   링크 텍스트("op", "+1", "YouTube")가 본문에 섞임
   *   → HTML을 가공해서 제거 후 텍스트 변환
   * ──────────────────────────────────────────── */
  function getCleanText(el) {
    if (!el) return '';
    try {
      let html = el.innerHTML || '';

      // <pre> 코드 블록 제거 (별도 코드 섹션에서 표시)
      html = html.replace(/<pre[\s\S]*?<\/pre>/gi, '');

      // <sup> citation 제거 ([1], +1 등 각주)
      html = html.replace(/<sup[\s\S]*?<\/sup>/gi, '');

      // 짧은 인용 링크 텍스트 제거 (25자 이하 — "op", "+1", "YouTube" 등)
      html = html.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, (match, content) => {
        const text = content.replace(/<[^>]+>/g, '').trim();
        if (text.length <= 25) return ''; // citation-style 링크 → 제거
        return text;                       // 긴 링크 텍스트는 유지
      });

      const result = htmlToText(html);
      if (result) return result;
    } catch (e) { /* 폴백으로 */ }

    // 폴백: 기존 innerText (코드·링크 포함될 수 있음)
    return getText(el);
  }

  /* ────────────────────────────────────────────
   * 링크 추출 (출처 표시용)
   * ──────────────────────────────────────────── */
  function extractLinks(el) {
    if (!el) return [];
    const links = [];
    const seen = new Set();
    try {
      el.querySelectorAll('a[href]').forEach((a) => {
        try {
          const url = a.href;
          if (!url || !url.startsWith('http') || seen.has(url)) return;
          // 내부 네비게이션 링크 제외
          if (url.includes('chatgpt.com') || url.includes('gemini.google.com') || url.includes('perplexity.ai')) return;
          seen.add(url);
          const text = (a.textContent?.trim() || a.title || new URL(url).hostname).slice(0, 80);
          links.push({ text, url });
        } catch (e) {}
      });
    } catch (e) {}
    return links;
  }

  /* ────────────────────────────────────────────
   * 코드 블록 추출
   * ──────────────────────────────────────────── */
  function extractCodeBlocks(el) {
    if (!el) return [];
    const codes = [];
    const seen = new Set();
    try {
      el.querySelectorAll('pre code, pre.hljs, .hljs').forEach((code) => {
        const raw = code.textContent?.trim();
        if (!raw || seen.has(raw)) return;
        seen.add(raw);
        const langMatch = code.className?.match(/language-(\w+)/);
        const lang = langMatch?.[1] || '';
        codes.push({ lang, code: raw });
      });
    } catch (e) {}
    return codes;
  }

  /* ────────────────────────────────────────────
   * 최신 응답 추출 → { text, links, codes } 반환
   * ──────────────────────────────────────────── */
  function getLatestResponse(type) {
    let el = null;

    if (type === 'GPT') {
      const blocks = document.querySelectorAll(
        '[data-message-author-role="assistant"] .markdown, .markdown.prose'
      );
      el = blocks[blocks.length - 1] || null;
    }

    if (type === 'GEMINI') {
      const selectors = [
        'model-response-text',
        '.model-response-text',
        'message-content .markdown',
        '.response-content',
        '[class*="markdown"]',
        '.response-container',
        '.formatted-response',
      ];
      for (const sel of selectors) {
        const blocks = document.querySelectorAll(sel);
        if (blocks.length > 0) {
          const candidate = blocks[blocks.length - 1];
          if (getText(candidate)) { el = candidate; break; }
        }
      }
    }

    if (type === 'PERPLEXITY') {
      // ★ 수정: 더 구체적인 셀렉터 우선 사용 (중복 방지)
      const selectors = [
        '[data-testid="answer"] .prose',
        '.answer .prose',
        'section .prose',
        '[class*="answer-content"] .prose',
        '.prose:last-of-type',
        '.prose',
        '[class*="answer"]',
        '[class*="response"]',
      ];
      for (const sel of selectors) {
        const blocks = document.querySelectorAll(sel);
        if (blocks.length > 0) {
          const candidate = blocks[blocks.length - 1];
          const t = getText(candidate);
          if (t) { el = candidate; break; }
        }
      }
    }

    if (!el) return null;
    // ★ getCleanText: 코드 블록·citation 링크 제거된 순수 본문
    const text = getCleanText(el);
    if (!text) return null;

    return {
      text,
      links: extractLinks(el),
      codes: extractCodeBlocks(el),
    };
  }

  /* ────────────────────────────────────────────
   * 생성 중 여부 확인
   * ──────────────────────────────────────────── */
  function isGenerating(type) {
    if (type === 'GPT')
      return !!document.querySelector('[data-testid="stop-button"]');
    if (type === 'GEMINI')
      return !!document.querySelector(
        '[aria-label*="중지"], [aria-label*="Stop"], [aria-label*="Pause"], .loading-indicator, [class*="generating"], vaadin-progress-bar'
      );
    if (type === 'PERPLEXITY')
      return !!document.querySelector(
        '[class*="loading"], [class*="streaming"], button[aria-label*="Stop"], button[aria-label*="중지"]'
      );
    return false;
  }

  /* ────────────────────────────────────────────
   * GPT "계속 생성" 버튼 자동 클릭 (긴 답변 잘림 방지)
   * ──────────────────────────────────────────── */
  function clickContinueIfNeeded() {
    for (const btn of document.querySelectorAll('button')) {
      const txt = btn.textContent?.trim();
      if ((txt === 'Continue generating' || txt === '계속 생성' || txt === '계속하기') && !btn.disabled) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  /* ────────────────────────────────────────────
   * 응답 모니터링
   *
   * ★ 수정: STABLE_MS를 500ms → 타입별 2000~3000ms로 증가
   *   (GPT 짤림, Gemini 조기 종료 방지)
   * ──────────────────────────────────────────── */
  function startMonitoring(type) {
    const storageKey = type.toLowerCase() + 'Answer';
    const dataKey    = type.toLowerCase() + 'Data';
    // ★ 핵심 수정: 500ms → 2000~3000ms (생성 도중 짧은 정지 때 조기 종료 방지)
    const STABLE_MS  = type === 'GEMINI' ? 3000 : 2000;

    let lastText = '';
    let lastChangeTime = Date.now();
    let done = false;
    // ★ GPT stop 버튼 플리커링 대응: 연속으로 몇 번 "비생성" 상태인지 카운트
    let notGeneratingCount = 0;
    // 종료 판정에 필요한 연속 "비생성" 횟수 (1초 폴링 × 2 = 최소 2초 유지)
    const STABLE_COUNT = type === 'GPT' ? 3 : 2;

    function check() {
      if (done) return;
      if (!isContextValid()) { window._aiDualInjected = false; cleanup(); return; }

      // GPT 긴 답변: "계속 생성" 버튼 자동 클릭
      if (type === 'GPT' && !isGenerating(type)) {
        if (clickContinueIfNeeded()) {
          lastChangeTime = Date.now(); // 타이머 리셋
          notGeneratingCount = 0;
          return;
        }
      }

      const result = getLatestResponse(type);
      const text   = result?.text || '';

      if (text && text !== lastText) {
        safeStorageSet({ [storageKey]: text, [dataKey]: result });
        lastText = text;
        lastChangeTime = Date.now();
        notGeneratingCount = 0; // 텍스트 변화 시 카운터 리셋
      }

      // ★ 수정: stop 버튼이 연속 STABLE_COUNT번 없어야 "완료"로 판정
      //   (한 번만 없어지면 종료하던 이전 로직 → 플리커링에 취약)
      if (isGenerating(type)) {
        notGeneratingCount = 0;
      } else {
        notGeneratingCount++;
      }

      // 생성 완료 + 텍스트 있음 + STABLE_MS 동안 변화 없음 + 연속 비생성 → 종료
      if (notGeneratingCount >= STABLE_COUNT && lastText.length > 0 &&
          (Date.now() - lastChangeTime) > STABLE_MS) {
        if (result) safeStorageSet({ [storageKey]: lastText, [dataKey]: result });
        cleanup();
      }
    }

    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });

    const poll    = setInterval(check, 1000);
    const timeout = setTimeout(cleanup, 180000);

    function cleanup() {
      if (done) return;
      done = true;
      obs.disconnect();
      clearInterval(poll);
      clearTimeout(timeout);
    }
  }

  /* ────────────────────────────────────────────
   * 백그라운드 탭 GPT 활성화 트릭
   *
   * GPT의 React 앱은 document.hidden=true 일 때
   * 스트리밍을 제한하거나 입력을 무시할 수 있음.
   * → visibilityState를 'visible'로 속여서 정상 동작 유도
   * ──────────────────────────────────────────── */
  function wakePageIfHidden() {
    if (!document.hidden) return;
    try {
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      Object.defineProperty(document, 'hidden',          { get: () => false,     configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('pageshow'));
    } catch (e) { /* 이미 정의된 경우 무시 */ }
  }

  /* ────────────────────────────────────────────
   * 메인 실행
   * ──────────────────────────────────────────── */
  function run(msg) {
    const type  = msg.type;
    const input = getInput(type);
    if (!input) return false;

    // GPT 백그라운드 탭 활성화 (응답 수신 실패 방지)
    if (type === 'GPT') wakePageIfHidden();

    injectText(input, msg.q, type);

    const delay = type === 'GEMINI' ? 2500 : 700;
    setTimeout(() => {
      if (type === 'GEMINI') {
        if (!clickSend(type, input)) {
          setTimeout(() => { if (!clickSend(type, input)) setTimeout(() => clickSend(type, input), 800); }, 500);
        }
      } else {
        clickSend(type, input);
      }
      const monitorDelay = type === 'GEMINI' ? 1500 : 600;
      setTimeout(() => startMonitoring(type), monitorDelay);
    }, delay);

    return true;
  }

  /* ────────────────────────────────────────────
   * 메시지 리스너
   * ──────────────────────────────────────────── */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isContextValid()) { window._aiDualInjected = false; return; }
    if (msg.action !== 'send') return;
    sendResponse({ status: 'received' });

    if (!run(msg)) {
      let attempts = 0;
      const retry = setInterval(() => {
        if (!isContextValid()) { window._aiDualInjected = false; clearInterval(retry); return; }
        attempts++;
        if (run(msg) || attempts >= 15) clearInterval(retry);
      }, 1000);
    }
  });
})();
