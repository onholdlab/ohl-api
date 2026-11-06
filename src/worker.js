/* onholdlab 共用後端：玩家回饋、排行榜、計數事件。
   所有網站與遊戲共用一個 Worker + 一個 D1 資料庫。
   每天一次的排程會呼叫 Supabase，讓 8棒接力 用的 Supabase 專案不會因閒置被暫停。 */

const ORIGINS = ['https://onholdlab.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/* 允許的遊戲與事件。新增遊戲時只要改這裡。 */
const SCORE_RULES = { survive: [1, 3600], bump: [1, 500] };
const EVENT_GAMES = ['wish-lamp', 'chaos-oracle'];
const EVENT_KINDS = ['finish', 'genie_vote'];
const FEEDBACK_KINDS = ['message', 'bug', 'idea', 'question'];

function cors(req) {
  const o = req.headers.get('Origin') || '';
  const ok = ORIGINS.includes(o) || LOCAL.test(o);
  return {
    'Access-Control-Allow-Origin': ok ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
const json = (req, data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

async function body(req) {
  try { return await req.json(); } catch (e) { return null; }
}

/* ---------- 回饋 ---------- */
async function feedback(req, env) {
  const b = await body(req);
  if (!b) return json(req, { error: 'invalid' }, 400);
  const message = str(b.message, 2000);
  if (!message) return json(req, { error: 'invalid' }, 400);
  const now = Date.now();
  /* 全站每分鐘最多 20 則，擋灌爆；不記 IP */
  const result = await env.DB.prepare(`INSERT INTO feedback (source, kind, message, contact, page, ua, at)
    SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM feedback WHERE at > ?) < 20`)
    .bind(str(b.source, 40) || 'home', FEEDBACK_KINDS.includes(b.kind) ? b.kind : 'message', message,
      str(b.contact, 200) || null, str(b.page, 300), str(b.ua, 200), now, now - 60000).run();
  if (!result.meta.changes) return json(req, { error: 'rate_limited' }, 429);
  return json(req, { ok: true }, 201);
}

/* ---------- 排行榜 ---------- */
async function submitScore(req, env) {
  const b = await body(req);
  if (!b) return json(req, { error: 'invalid' }, 400);
  const game = str(b.game, 20), rule = SCORE_RULES[game];
  const name = str(b.name, 12), device = str(b.device, 40), score = Number(b.score);
  if (!rule || !name || device.length < 8 || !(score >= rule[0] && score <= rule[1]))
    return json(req, { error: 'invalid' }, 400);
  const now = Date.now();
  /* 同一台裝置 5 秒內只能送一筆 */
  const result = await env.DB.prepare(`INSERT INTO scores (game, name, score, device, at)
    SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM scores WHERE device = ? AND at > ?)`)
    .bind(game, name, score, device, now, device, now - 5000).run();
  if (!result.meta.changes) return json(req, { error: 'rate_limited' }, 429);
  return json(req, { ok: true }, 201);
}

async function leaderboard(req, env, url) {
  const game = url.searchParams.get('game');
  if (!Object.hasOwn(SCORE_RULES, game)) return json(req, { error: 'invalid' }, 400);
  const limit = Math.min(50, Math.max(1, Math.trunc(Number(url.searchParams.get('limit')) || 11)));
  /* 每台裝置只取最好的一筆；同分時先到先排 */
  const { results } = await env.DB.prepare(
    `SELECT name, score, device FROM (
       SELECT name, score, device, at,
              ROW_NUMBER() OVER (PARTITION BY device ORDER BY score DESC, at ASC) AS rn
       FROM scores WHERE game = ?)
     WHERE rn = 1 ORDER BY score DESC, at ASC LIMIT ?`).bind(game, limit).all();
  return json(req, results || []);
}

/* ---------- 計數 ---------- */
async function event(req, env) {
  const b = await body(req);
  if (!b || !EVENT_GAMES.includes(b.game) || !EVENT_KINDS.includes(b.kind)) return json(req, { error: 'invalid' }, 400);
  await env.DB.prepare('INSERT INTO events (game, kind, at) VALUES (?,?,?)').bind(b.game, b.kind, Date.now()).run();
  return json(req, { ok: true }, 201);
}

async function count(req, env, url) {
  const game = url.searchParams.get('game'), kind = url.searchParams.get('kind');
  if (!EVENT_GAMES.includes(game) || !EVENT_KINDS.includes(kind)) return json(req, { error: 'invalid' }, 400);
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM events WHERE game = ? AND kind = ?').bind(game, kind).first();
  return json(req, { n: r ? r.n : 0 });
}

export default {
  async fetch(req, env) {
    // CORS headers alone do not prevent simple cross-origin POSTs from writing.
    const origin = req.headers.get('Origin');
    if (origin !== null && !ORIGINS.includes(origin) && !LOCAL.test(origin))
      return json(req, { error: 'forbidden' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url), route = req.method + ' ' + url.pathname;
    try {
      switch (route) {
        case 'POST /feedback': return await feedback(req, env);
        case 'POST /scores': return await submitScore(req, env);
        case 'GET /leaderboard': return await leaderboard(req, env, url);
        case 'POST /event': return await event(req, env);
        case 'GET /count': return await count(req, env, url);
        case 'GET /': return json(req, { ok: true });
        default: return json(req, { error: 'not_found' }, 404);
      }
    } catch (e) {
      /* 超過 D1 每日免費額度時也會走到這裡 */
      return json(req, { error: 'server' }, 503);
    }
  },

  /* 每天一次：碰一下 8棒接力 的 Supabase，避免閒置一週被暫停 */
  async scheduled(evt, env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return;
    try {
      /* 用網頁本來就會呼叫的 relay_state，順便觸發「畫完 24 小時自動揭曉」 */
      await fetch(env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/relay_state', {
        method: 'POST',
        headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_device: 'ohl-keepalive' })
      });
    } catch (e) {}
  }
};
