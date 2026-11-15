# ohl-api

onholdlab 所有網站與遊戲共用的後端：Cloudflare Worker + D1 資料庫（免費方案）。

| 路徑 | 用途 | 誰在用 |
|---|---|---|
| `POST /feedback` | 玩家回饋 | 作品集首頁、期中考模擬（透過 `onholdlab.github.io/js/feedback.js`） |
| `POST /scores`、`GET /leaderboard?game=` | 排行榜 | 十字路口（求生 `survive`、撞人賽 `bump`） |
| `POST /event`、`GET /count?game=&kind=` | 匿名計數 | 許願神燈、混亂甲骨文 |

- 有 `Origin` 的請求只接受 `https://onholdlab.com`、`https://www.onholdlab.com`、`https://onholdlab.github.io`，以及本機 HTTP（`localhost` 或 `127.0.0.1`，可帶埠號）。正式網址須完全相同，例如 `http://onholdlab.com`、`https://onholdlab.com.evil.example` 都會被拒絕。未帶 `Origin` 的請求仍可使用 API，回應沿用 `https://onholdlab.github.io` 作為預設 CORS 來源。
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
node scripts/export-supabase-scores.mjs scores-import.sql
npx wrangler d1 execute ohl-db --remote --file=scores-import.sql
```

匯出完成且顯示筆數後才執行匯入；匯出檔直接以 UTF-8 寫入，不需 PowerShell 重新導向。搬移期間先停止送出舊成績，避免分頁讀取時資料變動。

## 本機測試

需要 Node.js 22.13 以上，執行 `node --test`。測試使用記憶體 SQLite，不會連線或修改正式資料。

GitHub Actions 會在 PR 上跑 `test`，並在每次推送到 `main` 後重跑。`test-guard` 上線後會比對 PR 與目標分支的共同祖先，並將結果回報到 PR 最新的 commit。它允許新增測試檔或在既有測試純粹插入新行。改寫、刪除或搬移既有測試，以及新增或修改任何 harness 檔案，都需要維護者加上 `harness-reviewed` 標籤。分支保護需另外在 GitHub 設定，才能把檢查列為合併條件。開發規則見 `AGENTS.md`。

## 看資料

Cloudflare 後台 → Storage & Databases → D1 → `ohl-db` → Console，例如：

```sql
SELECT * FROM feedback ORDER BY at DESC LIMIT 50;
SELECT kind, COUNT(*) FROM events WHERE game = 'wish-lamp' GROUP BY kind;
```
