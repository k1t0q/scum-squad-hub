-- Completed periods are computed once and shared by every squad member.
CREATE TABLE IF NOT EXISTS hub_leaderboard_snapshots (
 squad_id TEXT NOT NULL,
 period TEXT NOT NULL CHECK(period IN ('day','week','month','total')),
 period_end TEXT NOT NULL,
 period_start TEXT,
 scores TEXT NOT NULL,
 computed_at TEXT NOT NULL,
 PRIMARY KEY(squad_id,period,period_end)
);
