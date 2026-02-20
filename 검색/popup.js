const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const container = document.getElementById("buttonContainer");

/* =========================
   🚀 런처 데이터 (폴더 방식)
========================= */
const buttonsData = [
  { name: "Notion", color: "#2d3436", url: "https://www.notion.so/2ea75c9e8802807b8d46d88c03c114a7?v=2ea75c9e880281d79c0d000cb876b5f2" },
  { name: "취업자료", color: "#00b894", url: "http://pkpjs.ipdisk.co.kr:8000/list/HDD1/%EC%B7%A8%EC%97%85%20%EC%9E%90%EB%A3%8C/" },
  { name: "Toss", color: "#0984e3", url: "https://www.tossinvest.com/" },
  { name: "구독", color: "#d63031", url: "https://www.youtube.com/feed/subscriptions" },
  { name: "Naver", color: "#00c73c", url: "https://www.naver.com" },
  { name: "Gmail", color: "#ea4335", url: "https://mail.google.com" },
  { name: "Dirve", color: "#74aa9c", url: "https://drive.google.com/drive/home" },
  { name: "Iptime", color: "#24292e", url: "http://192.168.0.1/ui/" }
];

function renderButtons() {
  container.innerHTML = "";
  buttonsData.forEach(data => {
    const item = document.createElement("div");
    item.className = "launch-item";
    
    // 아이콘 버튼 생성 (이름의 첫 글자 추출)
    const initial = data.name.charAt(0).toUpperCase();
    
    item.innerHTML = `
      <div class="launch-btn" style="background: ${data.color}">${initial}</div>
      <div class="label">${data.name}</div>
    `;
    
    item.onclick = () => chrome.tabs.create({ url: data.url });
    container.appendChild(item);
  });
}

renderButtons();

/* =========================
   🧠 스마트 검색 엔진 (기존 로직 유지)
========================= */
const intentDictionary = {
  shopping: ["가격", "얼마", "최저가", "구매", "비교"],
  news: ["뉴스", "속보", "이슈"],
  video: ["영상", "유튜브", "먹방", "하이라이트"],
  dev: ["error", "오류", "코드", "api", "개발", "stack"]
};

function decideEngine(query) {
  const q = query.toLowerCase();
  
  if (intentDictionary.shopping.some(word => q.includes(word))) 
    return "https://search.shopping.naver.com/search/all?query=";
  
  if (intentDictionary.video.some(word => q.includes(word)))
    return "https://www.youtube.com/results?search_query=";
  
  if (intentDictionary.dev.some(word => q.includes(word)) || /[a-zA-Z]/.test(q))
    return "https://www.google.com/search?q=";
  
  return "https://search.naver.com/search.naver?query=";
}

function performSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

  const base = decideEngine(query);
  chrome.tabs.create({ url: base + encodeURIComponent(query) });
}

searchBtn.onclick = performSearch;
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") performSearch(); });