document.addEventListener('DOMContentLoaded', async () => {
  const ipDisplay = document.getElementById('ip-display');
  const copyBtn = document.getElementById('copy-btn');

  try {
    // 공개 IP 주소 가져오기
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    const ip = data.ip;

    ipDisplay.textContent = ip;

    // 복사 버튼 기능
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(ip);
      alert('IP 주소가 복사되었습니다!');
    });

  } catch (error) {
    ipDisplay.textContent = '조회 실패';
    console.error('Error fetching IP:', error);
  }
});