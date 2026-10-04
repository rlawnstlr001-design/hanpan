// 서버 기록 (판정 지표·오늘 통계). 설정이 비어 있거나 실패해도 게임은 그대로 돈다.
import { deviceId } from './store.js?v=202610041016';

const CFG = window.HANPAN_CONFIG;
const on = () => !!(CFG.supabaseUrl && CFG.supabaseKey) && !new URLSearchParams(location.search).has('p');

async function rpc(fn, args) {
  if (!on()) return null;
  try {
    const r = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      keepalive: true,
    });
    if (!r.ok) return null;
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  } catch { return null; }
}

export const logEvent = (name, no = null) => rpc('hp_event', { p_device: deviceId(), p_name: name, p_no: no });

export const logPlay = ({ no, date, solved, mistakes, hint, missTiers, duration }) => rpc('hp_log_play', {
  p_device: deviceId(), p_kind: 'groups', p_no: no, p_date: date, p_solved: solved,
  p_mistakes: mistakes, p_hint: hint, p_miss_tiers: missTiers, p_duration: duration,
});

export const todayStats = (no) => rpc('hp_stats', { p_kind: 'groups', p_no: no });
