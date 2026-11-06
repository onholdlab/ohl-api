/* 把十字路口在 Supabase 的舊成績轉成 D1 可匯入的 SQL。
   用法(在 ohl-api 資料夾):
     node scripts/export-supabase-scores.mjs > scores-import.sql
     npx wrangler d1 execute ohl-db --remote --file=scores-import.sql
   只讀公開的 scores 表,不需要任何密碼。 */
const URL = 'https://zfghylavaxulytlbbxqi.supabase.co';
const KEY = 'sb_publishable_13fkPXai231g3G0JU4mWhA_G_hctIxL';

const r = await fetch(URL + '/rest/v1/scores?select=game,name,score,device,created_at&order=id', { headers: { apikey: KEY } });
if (!r.ok) { console.error('讀不到 Supabase:http_' + r.status + '(專案若被暫停,先到 Supabase 後台按 Restore)'); process.exit(1); }
const rows = await r.json();
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
for (const x of rows) {
  console.log(`INSERT INTO scores (game, name, score, device, at) VALUES (${q(x.game)}, ${q(x.name)}, ${Number(x.score)}, ${q(x.device)}, ${Date.parse(x.created_at)});`);
}
console.error('共 ' + rows.length + ' 筆');
