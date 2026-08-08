# VirusTotal 검사기 (크롬 확장 프로그램)

URL, 현재 탭, IP 주소를 VirusTotal로 검사하는 팝업형 크롬 확장 프로그램입니다.

## 설치 방법 (개발자 모드)
1. 크롬 주소창에 `chrome://extensions` 입력
2. 우측 상단 "개발자 모드" 켜기
3. "압축해제된 확장 프로그램을 로드합니다" 클릭 후 **이 폴더(바이러스 토탈)** 를 선택 — `manifest.json`이 이 폴더 바로 안에 있어야 합니다. (하위의 `vt-extension` 폴더는 이전 초안이라 무시하셔도 됩니다.)
4. API 키 설정 (아래 참고) 후 확장 프로그램 아이콘 클릭

## API 키 설정 — 두 가지 방법
VirusTotal 조회는 공식 API 없이는 불가능합니다. 별도 서버 없이 브라우저가 직접 VirusTotal 무료 API를 호출하므로, 아래 둘 중 하나로 키를 넣어주세요.

**방법 A. 옵션 화면에서 입력 (권장)**
확장 프로그램 아이콘 우클릭 → "옵션" → 키 붙여넣고 저장

**방법 B. 코드에 직접 박아넣기**
`js/popup.js` 최상단의 다음 줄을 수정:
```js
const LOCAL_API_KEY = "";
```
따옴표 안에 키를 넣으면 (`const LOCAL_API_KEY = "abcdef123...";`) 옵션 설정 없이 바로 동작하고, API 키 경고 배너도 뜨지 않습니다.

무료 키 발급: https://www.virustotal.com/gui/join-us → 로그인 → 프로필 → API Key
무료 키 제한: 분당 4회, 하루 500회 요청.

## 기능
- URL 직접 입력 검사 / 현재 탭 URL 즉시 검사
- IP 주소 조회 (국가·소유자 정보 포함)
- 악성 탐지 시 빨간색, 의심 시 주황색, 안전하면 초록색 게이지로 표시
- 검사 중 로딩 애니메이션
- 다크모드 토글 (설정 저장됨)
- 최근 검사 5건 기록 → 클릭 시 재검사

## 폴더 구조
```
바이러스 토탈/            ← 이 폴더를 chrome://extensions 에서 선택
  manifest.json
  popup.html
  options.html
  css/popup.css
  js/popup.js
  js/options.js
  icons/icon16.png, icon48.png, icon128.png
```
