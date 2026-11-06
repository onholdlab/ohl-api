# ohl-api

onholdlab 所有網站與遊戲共用的後端：Cloudflare Worker + D1 資料庫（免費方案）。

| 路徑 | 用途 | 誰在用 |
|---|---|---|
| `POST /feedback` | 玩家回饋 | 作品集首頁、期中考模擬（透過 `onholdlab.github.io/js/feedback.js`） |
| `POST /scores`、`GET /leaderboard?game=` | 排行榜 | 十字路口（求生 `survive`、撞人賽 `bump`） |
| `POST /event`、`GET /count?game=&kind=` | 匿名計數 | 許願神燈、混亂甲骨文 |

- 只接受 `https://onholdlab.github.io` 和本機（localhost）的瀏覽器請求。
- 不存 IP、不用 cookie。
- 每天台灣時間 11:17 會呼叫一次 8棒接力的 Supabase，讓它不會因閒置一週被暫停。8棒接力仍留在 Supabase。
- 新增遊戲：改 `src/worker.js` 最上面的 `SCORE_RULES`、`EVENT_GAMES`、`EVENT_KINDS`，再部署一次。

## 免費額度

每天 10 萬次請求、D1 每天寫入 10 萬列、讀取 500 萬列，台灣時間每天早上 8:00 重置。超過時當天的請求會失敗，網頁會顯示「連不上」，遊戲本身照常能玩。

## 第一次部署（Windows）

需要 Node.js。在這個資料夾開 PowerShell（檔案總管進到資料夾 → 網址列輸入 `powershell` → Enter）：

```
npx wrangler login
npx wrangler d1 create ohl-db
```

把第二行印出來的 `database_id` 貼進 `wrangler.toml` 的 `database_id = ""`，再執行：

```
npx wrangler d1 execute ohl-db --remote --file=schema.sql
npx wrangler deploy
```

最後一行會印出網址，例如 `https://ohl-api.xxxx.workers.dev`。把它填進：

- onholdlab.github.io 的 `js/feedback.js` → `CFG.api`
- crossroad 的 `js/board.js` → `CFG.api`
- 許願神燈、混亂甲骨文的 `API` 常數

## 搬十字路口的舊成績

```
node scripts/export-supabase-scores.mjs > scores-import.sql
npx wrangler d1 execute ohl-db --remote --file=scores-import.sql
```

## 看資料

Cloudflare 後台 → Storage & Databases → D1 → `ohl-db` → Console，例如：

```sql
SELECT * FROM feedback ORDER BY at DESC LIMIT 50;
SELECT kind, COUNT(*) FROM events WHERE game = 'wish-lamp' GROUP BY kind;
```
