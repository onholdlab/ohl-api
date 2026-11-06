/* 把十字路口在 Supabase 的舊成績轉成 D1 可匯入的 SQL。
   用法(在 ohl-api 資料夾):
     node scripts/export-supabase-scores.mjs scores-import.sql
     npx wrangler d1 execute ohl-db --remote --file=scores-import.sql
   只讀公開的 scores 表,不需要任何密碼。 */
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const URL = 'https://zfghylavaxulytlbbxqi.supabase.co';
const KEY = 'sb_publishable_13fkPXai231g3G0JU4mWhA_G_hctIxL';

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
export async function exportScores(fetcher = fetch) {
  const statements = [];
  let offset = 0;
  for (;;) {
    const r = await fetcher(URL + '/rest/v1/scores?select=game,name,score,device,created_at&order=id&limit=1000&offset=' + offset, { headers: { apikey: KEY } });
    if (!r.ok) throw new Error('讀不到 Supabase:http_' + r.status + '(專案若被暫停,先到 Supabase 後台按 Restore)');
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error('Invalid scores response');
    if (!rows.length) break;
    for (const x of rows) {
      const score = Number(x.score), at = Date.parse(x.created_at);
      if (!Number.isFinite(score) || !Number.isFinite(at)) throw new Error('Invalid score or timestamp');
      statements.push(`INSERT INTO scores (game, name, score, device, at) VALUES (${q(x.game)}, ${q(x.name)}, ${score}, ${q(x.device)}, ${at});`);
    }
    offset += rows.length;
  }
  return { sql: statements.join('\n') + '\n', count: offset };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { sql, count } = await exportScores();
    // Write only after all pages succeed; avoid PowerShell's UTF-16 redirection.
    await writeFile(process.argv[2] || 'scores-import.sql', sql, 'utf8');
    console.error('共 ' + count + ' 筆');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
