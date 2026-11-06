import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
import { exportScores } from '../scripts/export-supabase-scores.mjs';

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  return { DB: { prepare(sql) {
    const statement = sqlite.prepare(sql);
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return statement.get(...args) || null; },
      async all() { return { results: statement.all(...args) }; },
      async run() { return { meta: { changes: statement.run(...args).changes } }; }
    };
  } } };
}
function request(path, data, origin = 'https://onholdlab.github.io') {
  const headers = { 'Content-Type': 'text/plain' };
  if (origin !== null) headers.Origin = origin;
  return new Request('https://api.example' + path, {
    method: data === undefined ? 'GET' : 'POST', headers,
    body: data === undefined ? undefined : JSON.stringify(data)
  });
}
const score = { game: 'survive', name: '玩家', score: 10, device: 'device-123' };

test('unapproved simple POSTs and preflights are rejected before accessing DB', async () => {
  for (const origin of ['https://evil.example', 'null', 'http://localhost.evil.example']) {
    for (const [path, data] of [['/feedback', { message: 'spam' }], ['/scores', score], ['/event', { game: 'wish-lamp', kind: 'finish' }]]) {
      assert.equal((await worker.fetch(request(path, data, origin), {})).status, 403);
    }
    const req = new Request('https://api.example/event', { method: 'OPTIONS', headers: { Origin: origin } });
    assert.equal((await worker.fetch(req, {})).status, 403);
  }
  for (const origin of ['https://onholdlab.github.io', 'http://localhost:3000', 'http://127.0.0.1:8080']) {
    const req = new Request('https://api.example/event', { method: 'OPTIONS', headers: { Origin: origin } });
    const response = await worker.fetch(req, {});
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  }
  assert.equal((await worker.fetch(request('/', undefined, null), {})).status, 200);
});

test('concurrent scores enforce cooldown, then accept after expiry', async t => {
  const env = database(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => worker.fetch(request('/scores', score), env)));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 429).length, 7);
  await env.DB.prepare('UPDATE scores SET at = ?').bind(Date.now() - 6000).run();
  assert.equal((await worker.fetch(request('/scores', score), env)).status, 201);
});

test('concurrent feedback respects global 20 per minute cap and expiry', async t => {
  const env = database(t);
  const results = await Promise.all(Array.from({ length: 25 }, () => worker.fetch(request('/feedback', { message: 'hello' }), env)));
  assert.equal(results.filter(r => r.status === 201).length, 20);
  assert.equal(results.filter(r => r.status === 429).length, 5);
  await env.DB.prepare('UPDATE feedback SET at = ?').bind(Date.now() - 61000).run();
  assert.equal((await worker.fetch(request('/feedback', { message: 'again' }), env)).status, 201);
});

test('leaderboard deduplicates devices, breaks ties by time, and handles fractional limits', async t => {
  const env = database(t);
  for (const [name, points, device, at] of [['old', 5, 'a', 1], ['best', 20, 'a', 3], ['first', 20, 'b', 2], ['low', 1, 'c', 4]]) {
    await env.DB.prepare('INSERT INTO scores (game,name,score,device,at) VALUES (?,?,?,?,?)').bind('survive', name, points, device, at).run();
  }
  const response = await worker.fetch(request('/leaderboard?game=survive&limit=2.5'), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).map(r => r.name), ['first', 'best']);
  for (const game of ['constructor', '__proto__', 'unknown'])
    assert.equal((await worker.fetch(request('/leaderboard?game=' + game), env)).status, 400);
  assert.equal((await worker.fetch(request('/scores', { ...score, game: 'bump', score: 501 }), env)).status, 400);
  assert.equal((await worker.fetch(request('/scores', { ...score, game: 'bump', score: 500 }), env)).status, 201);
});

test('events can be submitted and counted', async t => {
  const env = database(t);
  assert.equal((await worker.fetch(request('/event', { game: 'wish-lamp', kind: 'finish' }), env)).status, 201);
  assert.deepEqual(await (await worker.fetch(request('/count?game=wish-lamp&kind=finish'), env)).json(), { n: 1 });
});

test('export follows capped pages until empty and produces executable Unicode SQL', async t => {
  const env = database(t);
  const offsets = [];
  const { sql, count } = await exportScores(async url => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    offsets.push(offset);
    return Response.json(offset < 3 ? [{ ...score, name: "玩家 O'Brien", created_at: '2026-01-01T00:00:00Z' }] : []);
  });
  assert.deepEqual(offsets, [0, 1, 2, 3]);
  assert.equal(count, 3);
  for (const line of sql.trim().split('\n')) await env.DB.prepare(line).run();
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first()).n, 3);
  assert.equal((await env.DB.prepare('SELECT name FROM scores LIMIT 1').first()).name, "玩家 O'Brien");
});

test('export fails if a later page fails instead of returning a partial migration', async () => {
  let calls = 0;
  await assert.rejects(exportScores(async () => ++calls === 1
    ? Response.json([{ ...score, created_at: '2026-01-01T00:00:00Z' }])
    : new Response('', { status: 503 })), /http_503/);
});
