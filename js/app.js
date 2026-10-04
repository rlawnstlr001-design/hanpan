// 한글한판 — 허브와 묶음 퍼즐
import { chosung } from './hangul.js?v=202610041016';
import {
  kstDate, msToNextPuzzle, puzzleFor, loadGame, saveGame, loadStats, recordFinish,
  seenHelp, markHelpSeen,
} from './store.js?v=202610041016';
import { logEvent, logPlay, todayStats } from './track.js?v=202610041016';

const CFG = window.HANPAN_CONFIG;
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const MAX_INK = 4;
const TIER_EMOJI = { 1: '⬜', 2: '🟫', 3: '🟦', 4: '🟥' };
const TIER_NAME = { 1: '미색', 2: '황토', 3: '쪽빛', 4: '주홍' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 공통: 알림·시트·진동 ----------
let toastTimer;
function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

function buzz(ms) { try { navigator.vibrate?.(ms); } catch { /* 미지원 */ } }

function openSheet(html, { onClose } = {}) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-back" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true">
      <button class="sheet-x" data-close aria-label="닫기">×</button>${html}</section>`;
  root.classList.add('on');
  const close = () => { root.classList.remove('on'); root.innerHTML = ''; onClose?.(); };
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { root, close };
}

// ---------- 날짜 표시 ----------
function prettyDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00+09:00');
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(d);
}

function fmtCountdown(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}

let countdownTimer;
function startCountdown() {
  clearInterval(countdownTimer);
  const tick = () => {
    const ms = msToNextPuzzle();
    document.querySelectorAll('[data-countdown]').forEach((el) => { el.textContent = fmtCountdown(ms); });
    if (ms < 1000) setTimeout(() => location.reload(), 1500); // 자정이 지나면 새 판
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// ---------- 허브 ----------
function renderHub() {
  const p = puzzleFor();
  const today = kstDate();
  if (!p) {
    view.innerHTML = `<section class="hub"><p class="lede">첫 판은 ${esc(prettyDate(CFG.start))}에 짜입니다.</p></section>`;
    return;
  }
  logEvent('visit', p.no);
  const g = loadGame('groups', p.no);
  const st = loadStats('groups');
  let status = '시작하기';
  let mini = '';
  if (g?.done) {
    status = g.win ? `완료 · 실수 ${g.mistakes}` : '다음 판에 다시';
    mini = `<span class="mini-grid">${g.guesses.map((gs) => gs.map((t) => `<i class="t${t}"></i>`).join('')).join('')}</span>`;
  } else if (g?.guesses?.length) {
    status = `이어하기 · ${g.solved.length}묶음 짰음`;
  }

  view.innerHTML = `
    <section class="hub">
      <p class="dateline">${esc(prettyDate(today))}${p.preview ? ' · 미리보기' : ''}</p>
      <h1 class="hub-title">제 <b>${p.no}</b> 판</h1>
      <p class="lede">오늘의 판이 짜였습니다. 모두가 같은 문제를 풉니다.</p>

      <a class="plate plate-on${g?.done ? ' plate-done' : ''}" href="#/groups">
        <span class="plate-mark" aria-hidden="true">묶</span>
        <span class="plate-body">
          <span class="plate-name">묶음</span>
          <span class="plate-desc">열여섯 낱말을 넷씩 묶기</span>
          ${mini}
        </span>
        <span class="plate-go">${esc(status)}</span>
      </a>
      <div class="plate plate-off" aria-disabled="true">
        <span class="plate-mark" aria-hidden="true">십</span>
        <span class="plate-body"><span class="plate-name">미니 십자말</span><span class="plate-desc">다섯 칸 가로세로</span></span>
        <span class="plate-go">곧 엽니다</span>
      </div>
      <div class="plate plate-off" aria-disabled="true">
        <span class="plate-mark" aria-hidden="true">자</span>
        <span class="plate-body"><span class="plate-name">자모 맞히기</span><span class="plate-desc">두 글자 낱말을 자모로</span></span>
        <span class="plate-go">곧 엽니다</span>
      </div>

      <div class="hub-foot">
        <span>연속 <b>${st.streak}</b>일 · 최고 <b>${st.best}</b>일</span>
        <span>다음 판까지 <b data-countdown>--:--:--</b></span>
      </div>
      <p class="fine"><a href="privacy.html">개인정보처리방침</a></p>
    </section>`;
  startCountdown();
}

// ---------- 묶음 퍼즐 ----------
// 같은 판이면 모두에게 같은 첫 배치 (판 id로 시드)
function seededShuffle(arr, seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function newGame(p) {
  const words = p.g.flatMap((g) => g.w);
  return {
    order: seededShuffle(words, p.id),
    guesses: [],   // 각 시도: 단어 4개의 '실제 묶음 난이도' 배열 (공유 격자용)
    tried: [],     // 각 시도: 정렬된 단어 키 (같은 조합 재시도 방지)
    solved: [],    // 맞힌 묶음 index (p.g 기준, 맞힌 순서)
    mistakes: 0,
    hint: null,    // 힌트를 본 묶음 index
    done: false,
    win: false,
  };
}

function renderGroups() {
  const p = puzzleFor();
  if (!p) { location.hash = '#/'; return; }
  let s = loadGame('groups', p.no) ?? newGame(p);
  let picked = new Set();
  let busy = false;
  const tierOf = (w) => p.g.find((g) => g.w.includes(w)).t;
  const groupOf = (w) => p.g.findIndex((g) => g.w.includes(w));
  const save = () => { if (!p.preview) saveGame('groups', p.no, s); };

  view.innerHTML = `
    <section class="game">
      <div class="game-head">
        <a class="back" href="#/">‹ 판 목록</a>
        <span class="game-title">묶음 · 제${p.no}판</span>
      </div>
      <p class="game-guide">넷씩 짝이 맞는 낱말을 골라 <b>묶기</b>를 누르세요.</p>
      <div class="board" id="board"></div>
      <div class="ink-row">
        <span>남은 먹물</span><span class="ink" id="ink"></span>
      </div>
      <div class="hint-line" id="hint-line" hidden></div>
      <div class="actions" id="actions">
        <button class="btn" id="b-shuffle">섞기</button>
        <button class="btn" id="b-clear">비우기</button>
        <button class="btn" id="b-hint">초성 힌트</button>
        <button class="btn btn-ink" id="b-submit" disabled>묶기</button>
      </div>
      <div class="after" id="after" hidden></div>
    </section>`;

  const board = $('#board');

  function drawInk() {
    const left = MAX_INK - s.mistakes;
    $('#ink').innerHTML = Array.from({ length: MAX_INK }, (_, i) =>
      `<svg class="drop${i < left ? '' : ' dry'}" viewBox="0 0 20 26" aria-hidden="true"><path d="M10 1C10 1 2 11 2 16.5a8 8 0 0 0 16 0C18 11 10 1 10 1z"/></svg>`).join('');
    $('#ink').setAttribute('aria-label', `남은 기회 ${left}번`);
  }

  function drawHint() {
    const line = $('#hint-line');
    if (s.hint == null) { line.hidden = true; return; }
    const g = p.g[s.hint];
    line.hidden = false;
    line.innerHTML = `<span class="hint-tag">이런 이름의 묶음이 있어요</span><b>${esc(chosung(g.l))}</b>`;
  }

  function drawBoard(animSolvedIdx = null) {
    const solvedRows = s.solved.map((gi) => {
      const g = p.g[gi];
      const anim = gi === animSolvedIdx ? ' stamp-in' : '';
      return `<div class="band t${g.t}${anim}">
          <span class="band-label">${esc(g.l)}</span>
          <span class="band-words">${g.w.map(esc).join(' · ')}</span>
          ${gi === animSolvedIdx ? '<span class="band-seal" aria-hidden="true">印</span>' : ''}
        </div>`;
    }).join('');
    const solvedWords = new Set(s.solved.flatMap((gi) => p.g[gi].w));
    const rest = s.order.filter((w) => !solvedWords.has(w));
    const tiles = rest.map((w) => {
      const len = [...w].length;
      return `<button class="tile${picked.has(w) ? ' on' : ''} len${Math.min(len, 5)}" data-w="${esc(w)}" aria-pressed="${picked.has(w)}">${esc(w)}</button>`;
    }).join('');
    board.innerHTML = solvedRows + (rest.length ? `<div class="tiles">${tiles}</div>` : '');
    $('#b-submit').disabled = picked.size !== 4 || s.done;
    $('#b-clear').disabled = picked.size === 0;
    $('#b-hint').disabled = s.hint != null || s.done;
    $('#b-hint').textContent = s.hint != null ? '힌트 씀' : '초성 힌트';
  }

  board.addEventListener('click', (e) => {
    const b = e.target.closest('.tile');
    if (!b || busy || s.done) return;
    const w = b.dataset.w;
    if (picked.has(w)) picked.delete(w);
    else if (picked.size < 4) picked.add(w);
    else { toast('네 개까지만 고를 수 있어요'); return; }
    b.classList.toggle('on', picked.has(w));
    b.setAttribute('aria-pressed', picked.has(w));
    $('#b-submit').disabled = picked.size !== 4;
    $('#b-clear').disabled = picked.size === 0;
  });

  $('#b-shuffle').addEventListener('click', () => {
    if (busy) return;
    const solvedWords = new Set(s.solved.flatMap((gi) => p.g[gi].w));
    const rest = shuffle(s.order.filter((w) => !solvedWords.has(w)));
    s.order = [...s.order.filter((w) => solvedWords.has(w)), ...rest];
    save();
    drawBoard();
  });

  $('#b-clear').addEventListener('click', () => { picked = new Set(); drawBoard(); });

  $('#b-hint').addEventListener('click', () => {
    if (s.hint != null || s.done) return;
    // 아직 못 맞힌 묶음 중 가장 쉬운 것의 이름을 초성으로
    const open = p.g.map((g, i) => ({ t: g.t, i })).filter((x) => !s.solved.includes(x.i)).sort((a, b) => a.t - b.t);
    if (!open.length) return;
    s.hint = open[0].i;
    save();
    drawHint();
    drawBoard();
  });

  $('#b-submit').addEventListener('click', () => {
    if (picked.size !== 4 || busy || s.done) return;
    const words = [...picked];
    const key = [...words].sort().join('|');
    if (s.tried.includes(key)) { toast('이미 묶어 본 조합이에요'); return; }
    s.tried.push(key);
    if (!s.startedAt) { s.startedAt = Date.now(); logEvent('start', p.no); }
    s.guesses.push(words.map(tierOf));

    const gis = words.map(groupOf);
    const same = gis.every((g) => g === gis[0]);
    busy = true;

    if (same) {
      const gi = gis[0];
      // 고른 타일이 차례로 튀어 오른 뒤 한 줄로 조판된다
      words.forEach((w, i) => {
        const el = board.querySelector(`.tile[data-w="${CSS.escape(w)}"]`);
        if (el) setTimeout(() => el.classList.add('set'), i * 90);
      });
      setTimeout(() => {
        s.solved.push(gi);
        picked = new Set();
        buzz([30, 40, 60]);
        drawBoard(gi);
        if (s.solved.length === 4) finish(true);
        else save();
        busy = false;
      }, 4 * 90 + 380);
    } else {
      const best = Math.max(...p.g.map((_, i) => gis.filter((g) => g === i).length));
      s.mistakes += 1;
      save();
      buzz(120);
      board.querySelectorAll('.tile.on').forEach((el) => {
        el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      });
      drawInk();
      if (s.mistakes >= MAX_INK) {
        toast('먹물이 다 말랐어요');
        setTimeout(() => { revealRest(); busy = false; }, 700);
      } else {
        toast(best === 3 ? '하나만 바꾸면 돼요!' : '짝이 맞지 않아요');
        setTimeout(() => { busy = false; }, 450);
      }
    }
  });

  // 실패 시 남은 묶음을 쉬운 것부터 하나씩 펼쳐 보인다
  function revealRest() {
    picked = new Set();
    const rest = p.g.map((g, i) => ({ t: g.t, i })).filter((x) => !s.solved.includes(x.i)).sort((a, b) => a.t - b.t);
    s.missed = rest.map((x) => x.t);
    rest.forEach((x, k) => setTimeout(() => {
      s.solved.push(x.i);
      drawBoard(x.i);
      if (k === rest.length - 1) finish(false);
    }, k * 650));
  }

  function finish(win) {
    s.done = true;
    s.win = win;
    save();
    if (!p.preview) {
      recordFinish('groups', { date: p.date, win, mistakes: s.mistakes });
      const duration = s.startedAt ? Math.round((Date.now() - s.startedAt) / 1000) : null;
      logPlay({ no: p.no, date: p.date, solved: win, mistakes: s.mistakes, hint: s.hint != null, missTiers: s.missed ?? [], duration });
    }
    $('#actions').hidden = true;
    const after = $('#after');
    after.hidden = false;
    after.innerHTML = `<button class="btn btn-ink btn-wide" id="b-result">${win ? '결과 보기' : '정답과 결과 보기'}</button>`;
    $('#b-result').addEventListener('click', () => showResult(p, s));
    setTimeout(() => showResult(p, s), win ? 900 : 500);
  }

  drawInk();
  drawHint();
  drawBoard();
  if (s.done) {
    $('#actions').hidden = true;
    const after = $('#after');
    after.hidden = false;
    after.innerHTML = '<button class="btn btn-ink btn-wide" id="b-result">결과 보기</button>';
    $('#b-result').addEventListener('click', () => showResult(p, s));
  }
}

// ---------- 결과 ----------
function shareText(p, s, today) {
  const grid = s.guesses.map((row) => row.map((t) => TIER_EMOJI[t]).join('')).join('\n');
  const tail = s.win
    ? (s.mistakes === 0 && s.hint == null ? '🔴 실수 없이 완판' : `실수 ${s.mistakes} · 힌트 ${s.hint == null ? 0 : 1}`)
    : '이번 판은 먹물이 모자랐어요';
  const hook = today ? `\n${today}` : '';
  return `한글한판 제${p.no}판 · 묶음\n${grid}\n${tail}${hook}\n${CFG.site}`;
}

function sealWord(s) {
  if (!s.win) return '다음판';
  if (s.mistakes === 0 && s.hint == null) return '완판';
  return '판완성';
}

function showResult(p, s) {
  const st = loadStats('groups');
  const rate = st.played ? Math.round((st.wins / st.played) * 100) : 0;
  const maxDist = Math.max(1, ...st.dist);
  let text = shareText(p, s);
  const { root } = openSheet(`
    <div class="result">
      <div class="big-seal${s.win ? '' : ' muted'}" aria-hidden="true">${esc(sealWord(s))}</div>
      <h2 class="result-title">${s.win ? (s.mistakes === 0 ? '한 방울도 흘리지 않았어요' : `실수 ${s.mistakes}번 만에 짰어요`) : '오늘 판은 여기까지'}</h2>
      <div class="result-grid" aria-label="시도 기록">
        ${s.guesses.map((row) => `<div>${row.map((t) => `<i class="t${t}" title="${TIER_NAME[t]}"></i>`).join('')}</div>`).join('')}
      </div>
      <p class="today" id="r-today" hidden></p>
      <div class="share-row">
        <button class="btn btn-ink" id="r-share">결과 보내기</button>
        <button class="btn" id="r-copy">복사</button>
      </div>
      <dl class="stats">
        <div><dt>푼 판</dt><dd>${st.played}</dd></div>
        <div><dt>성공률</dt><dd>${rate}%</dd></div>
        <div><dt>연속</dt><dd>${st.streak}</dd></div>
        <div><dt>최고</dt><dd>${st.best}</dd></div>
      </dl>
      <div class="dist" aria-label="실수 횟수별 성공">
        ${st.dist.map((n, i) => `<div class="dist-row${s.win && s.mistakes === i ? ' me' : ''}"><span>실수 ${i}</span><span class="bar" style="--w:${Math.max(6, (n / maxDist) * 100)}%">${n}</span></div>`).join('')}
      </div>
      <p class="next">다음 판까지 <b data-countdown>--:--:--</b></p>
    </div>`);
  startCountdown();

  // 오늘 다른 사람들 결과 (서버 연결 시) — 가장 많이 놓친 묶음을 한 줄로
  todayStats(p.no).then((t) => {
    if (!t || t.plays < 5) return;
    const worst = [4, 3, 2, 1].map((k) => ({ k, v: t.miss[k] ?? 0 })).sort((a, b) => b.v - a.v)[0];
    const line = worst.v > 0
      ? `오늘 ${t.plays}명 중 ${worst.v}%가 ${TIER_NAME[worst.k]} 묶음을 못 찾았어요`
      : `오늘 ${t.plays}명이 풀었고 ${t.solved}%가 완성했어요`;
    const el = root.querySelector('#r-today');
    if (el) { el.textContent = line; el.hidden = false; }
    text = shareText(p, s, line);
  });

  root.querySelector('#r-share').addEventListener('click', async () => {
    logEvent('share', p.no);
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    copy(text);
  });
  root.querySelector('#r-copy').addEventListener('click', () => { logEvent('copy', p.no); copy(text); });
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('복사했어요. 단톡방에 붙여 넣어 보세요'); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast('복사했어요'); } catch { toast('복사하지 못했어요'); }
    ta.remove();
  }
}

// ---------- 도움말·기록 ----------
function showHelp() {
  openSheet(`
    <div class="help">
      <h2>묶음 하는 법</h2>
      <ol>
        <li>열여섯 낱말 가운데 <b>공통점이 있는 넷</b>을 골라 <b>묶기</b>를 누릅니다.</li>
        <li>네 묶음을 모두 찾으면 한 판이 완성됩니다.</li>
        <li>틀릴 때마다 <b>먹물</b>이 한 방울씩 마릅니다. 네 방울이 다 마르면 끝.</li>
        <li>막히면 <b>초성 힌트</b>로 묶음 이름의 초성을 하루 한 번 볼 수 있어요.</li>
      </ol>
      <div class="tier-key">
        ${[1, 2, 3, 4].map((t) => `<span><i class="t${t}"></i>${TIER_NAME[t]}</span>`).join('')}
      </div>
      <p class="help-sub">미색이 가장 쉽고 주홍은 말장난입니다. 매일 한국 시간 자정에 새 판이 짜입니다.</p>
      <button class="btn btn-ink btn-wide" data-close>시작하기</button>
    </div>`, { onClose: markHelpSeen });
}

function showStats() {
  const st = loadStats('groups');
  const rate = st.played ? Math.round((st.wins / st.played) * 100) : 0;
  openSheet(`
    <div class="result">
      <h2 class="result-title">내 기록 · 묶음</h2>
      <dl class="stats">
        <div><dt>푼 판</dt><dd>${st.played}</dd></div>
        <div><dt>성공률</dt><dd>${rate}%</dd></div>
        <div><dt>연속</dt><dd>${st.streak}</dd></div>
        <div><dt>최고</dt><dd>${st.best}</dd></div>
      </dl>
      <p class="next">다음 판까지 <b data-countdown>--:--:--</b></p>
    </div>`);
  startCountdown();
}

$('#btn-help').addEventListener('click', showHelp);
$('#btn-stats').addEventListener('click', showStats);

// ---------- 라우터 ----------
function route() {
  clearInterval(countdownTimer);
  const h = location.hash || '#/';
  if (h.startsWith('#/groups')) renderGroups();
  else renderHub();
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
if (!seenHelp()) showHelp();
