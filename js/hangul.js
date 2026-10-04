// 한글 처리 — 초성 뽑기 (힌트용). 자모 맞히기 게임이 붙으면 여기에 분해·조합을 더한다.
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const BASE = 0xac00;
const LAST = 0xd7a3;

// '겨울 간식' → 'ㄱㅇ ㄱㅅ'. 한글 음절이 아닌 글자(따옴표·영문·숫자)는 그대로 둔다.
export function chosung(text) {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    out += c >= BASE && c <= LAST ? CHO[Math.floor((c - BASE) / 588)] : ch;
  }
  return out;
}
