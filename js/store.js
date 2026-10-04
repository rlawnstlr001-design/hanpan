// 날짜(KST)·오늘의 판·기기 저장. 서버가 없어도 혼자 완결된다.
import { PUZZLE_COUNT, PUZZLE_DATA } from './puzzles.js?v=202610041007';

const CFG = window.HANPAN_CONFIG;
const KEY = 'hanpan';
const DAY = 86400000;

// 'YYYY-MM-DD' (한국 시간). 어느 나라에서 열어도 같은 날 같은 판이 나오게 한다.
export function kstDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}

function dayIndex(dateStr) {
  return Math.round((Date.parse(dateStr + 'T00:00:00Z') - Date.parse(CFG.start + 'T00:00:00Z')) / DAY);
}

// 다음 판(한국 자정)까지 남은 밀리초
export function msToNextPuzzle(now = Date.now()) {
  const today = kstDate(new Date(now));
  const nextMidnightKst = Date.parse(today + 'T00:00:00+09:00') + DAY;
  return Math.max(0, nextMidnightKst - now);
}

let decoded = null;
function allPuzzles() {
  if (decoded) return decoded;
  const bin = atob(PUZZLE_DATA);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length);
  decoded = JSON.parse(new TextDecoder().decode(bytes));
  return decoded;
}

// 오늘(또는 ?p=번호 미리보기)의 묶음 퍼즐. no = 제N판(1부터)
export function puzzleFor(dateStr = kstDate()) {
  const preview = new URLSearchParams(location.search).get('p');
  const no = preview ? Number(preview) : dayIndex(dateStr) + 1;
  if (!(no >= 1)) return null; // 첫 판 전
  // 판이 바닥나면 처음부터 다시 돈다 (빈 화면보다 낫다). 빌드 때 남은 일수를 경고한다.
  const p = allPuzzles()[(no - 1) % PUZZLE_COUNT];
  return { no, date: dateStr, preview: !!preview, ...p };
}

// ---- 기기 저장 ----
function read(k, fallback) {
  try { const v = localStorage.getItem(`${KEY}:${k}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function write(k, v) {
  try { localStorage.setItem(`${KEY}:${k}`, JSON.stringify(v)); } catch { /* 저장 공간 없음·사생활 보호 모드 */ }
}

export const loadGame = (kind, no) => read(`${kind}:${no}`, null);
export const saveGame = (kind, no, state) => write(`${kind}:${no}`, state);

const EMPTY_STATS = { played: 0, wins: 0, streak: 0, best: 0, last: null, dist: [0, 0, 0, 0] };
export const loadStats = (kind) => ({ ...EMPTY_STATS, ...read(`stats:${kind}`, {}) });

// 한 판이 끝났을 때 한 번만 부른다. 연속 기록은 '어제도 끝냈는지'로 잇는다.
export function recordFinish(kind, { date, win, mistakes }) {
  const s = loadStats(kind);
  if (s.last === date) return s; // 같은 날 두 번 집계 방지
  const yesterday = kstDate(new Date(Date.parse(date + 'T12:00:00+09:00') - DAY));
  s.played += 1;
  if (win) {
    s.wins += 1;
    s.streak = s.last === yesterday ? s.streak + 1 : 1;
    s.best = Math.max(s.best, s.streak);
    s.dist[Math.min(mistakes, 3)] += 1; // 실수 4번이면 실패라 0~3만 있다
  } else {
    s.streak = 0;
  }
  s.last = date;
  write(`stats:${kind}`, s);
  return s;
}

export const seenHelp = () => read('help', false);
export const markHelpSeen = () => write('help', true);

// 판정 지표용 익명 기기 id (서버 연결 시에만 쓰인다)
export function deviceId() {
  let id = read('device', null);
  if (!id) { id = crypto.randomUUID?.() ?? String(Math.random()).slice(2); write('device', id); }
  return id;
}
