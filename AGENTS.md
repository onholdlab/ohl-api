# ohl-api 開發規則（Claude Code 與 Codex 共用）

## 規格先行（SDD）

規格＝README 的路徑表與說明，加上 `test/` 裡的測試。改行為一律照這個順序：

1. 先改 README 的規格：新路徑、新遊戲、新限制都寫清楚。
2. 再寫測試：新增 `test/<主題>.test.mjs`，或在既有測試檔裡「只新增」新的 test。跑 `node --test`，確認新測試先失敗。
3. 最後寫程式，直到 `node --test` 全部通過。

## 測試只能新增

- 既有測試不能改寫或刪除。測試沒過要修的是程式碼，不是測試。
- 如果認為測試本身寫錯了，停下來說明是哪一條、為什麼錯、規格該怎麼改，由使用者決定。
- CI 的 test-guard 會擋：PR 改寫、刪除或搬移既有測試，或新增、修改 `.claude/hooks/`、`.claude/settings.json`、`.github/workflows/`、`.github/scripts/` 下的 harness 檔案，都要維護者在 PR 加上 `harness-reviewed` 標籤才會通過。

## 自動檢查（harness）

- GitHub Actions 會在 PR 跑 `test`（`node --test`）。`test-guard` 需先在 `main` 上線，才會檢查後續送往 `main` 的 PR。分支保護設定決定檢查是否會阻擋合併。
- 測試用記憶體 SQLite（`node:sqlite`），需要 Node.js 22.13 以上，不會連線或修改正式資料。

## 長任務的 context

- 進度寫在 PR 描述的待辦清單：做了什麼、下一步、卡在哪。
- 換新對話時先讀 PR 描述，再跑一次 `node --test` 看現況，不靠對話記憶接續。
