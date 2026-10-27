-- Apply to migration D1 only after confirming member identifiers.
-- Never infer member identity from client-supplied squad IDs.
CREATE TABLE IF NOT EXISTS steam_member_links (
 steam_id TEXT NOT NULL,
 member_id TEXT NOT NULL,
 linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_at TEXT,
 PRIMARY KEY (steam_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_steam_member_links_active ON steam_member_links (steam_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_steam_member_links_member ON steam_member_links (member_id);
