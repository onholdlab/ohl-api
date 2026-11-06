-- onholdlab 共用後端（Cloudflare D1）。重跑也安全。
-- 執行：npx wrangler d1 execute ohl-db --remote --file=schema.sql

-- 玩家回饋（原 Supabase feedback 表）
CREATE TABLE IF NOT EXISTS feedback (
  id      INTEGER PRIMARY KEY,
  source  TEXT NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN ('message','bug','idea','question')),
  message TEXT NOT NULL,
  contact TEXT,
  page    TEXT,
  ua      TEXT,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_at ON feedback (at);

-- 排行榜（原 Supabase scores 表，十字路口用）
CREATE TABLE IF NOT EXISTS scores (
  id     INTEGER PRIMARY KEY,
  game   TEXT NOT NULL,
  name   TEXT NOT NULL,
  score  REAL NOT NULL,
  device TEXT NOT NULL,
  at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_game_score ON scores (game, score DESC);
CREATE INDEX IF NOT EXISTS scores_device_at ON scores (device, at);

-- 計數事件（許願神燈、混亂甲骨文等），不存任何個人資料
CREATE TABLE IF NOT EXISTS events (
  id   INTEGER PRIMARY KEY,
  game TEXT NOT NULL,
  kind TEXT NOT NULL,
  at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_game_kind ON events (game, kind);
