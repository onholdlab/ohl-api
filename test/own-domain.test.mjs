// 規格（README，2026-11-16）：作品搬到 onholdlab.com 之後，
// https://onholdlab.com 與 https://www.onholdlab.com 的請求要能寫入；
// 只差一點點的網域（http、子網域假冒、後綴假冒）仍然一律 403。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

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
const post = (path, data, origin) => new Request('https://api.example' + path, {
  method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: origin }, body: JSON.stringify(data)
});

test('未提供 Origin 的請求保留原本的 CORS 預設值', async () => {
  const res = await worker.fetch(new Request('https://api.example/'), {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://onholdlab.github.io');
  assert.equal(res.headers.get('Vary'), 'Origin');
});

for (const origin of ['https://onholdlab.com', 'https://www.onholdlab.com']) {
  test(`${origin} 可以送事件、回饋、分數`, async t => {
    const env = database(t);
    assert.equal((await worker.fetch(post('/event', { game: 'wish-lamp', kind: 'finish' }, origin), env)).status < 300, true);
    assert.equal((await worker.fetch(post('/feedback', { message: 'hi', source: 'midterm-sim' }, origin), env)).status, 201);
    assert.equal((await worker.fetch(post('/scores', { game: 'bump', name: '玩家', score: 10, device: 'device-' + origin.length }, origin), env)).status, 201);
  });
  test(`${origin} 的預檢回傳自己的 Origin`, async () => {
    const res = await worker.fetch(new Request('https://api.example/event', { method: 'OPTIONS', headers: { Origin: origin } }), {});
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin);
  });
}

test('相似但不同的網域仍然拒絕', async () => {
  for (const origin of ['http://onholdlab.com', 'https://onholdlab.com.evil.example', 'https://evil-onholdlab.com', 'https://x.onholdlab.com']) {
    assert.equal((await worker.fetch(post('/event', { game: 'wish-lamp', kind: 'finish' }, origin), {})).status, 403, origin);
  }
});
