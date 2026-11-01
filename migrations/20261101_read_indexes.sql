-- Non-unique indexes only: preserve all existing records and constraints.
-- Apply once to scum-hub-db; safe to reapply.
CREATE INDEX IF NOT EXISTS idx_events_squad_created ON squad_notification_events(squad_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_source_key ON squad_notification_events(source_key);
CREATE INDEX IF NOT EXISTS idx_events_created ON squad_notification_events(created_at);
CREATE INDEX IF NOT EXISTS idx_map_squad_updated ON squad_map_markers(squad_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_squad_kind_created ON squad_place_posts(squad_id,kind,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_squad_created ON squad_place_posts(squad_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presence_squad_day ON presence_history(squad_id,day);
CREATE INDEX IF NOT EXISTS idx_presence_member_day ON presence_history(member_id,day);
CREATE INDEX IF NOT EXISTS idx_members_squad_active_nick ON members(squad_id,is_active,nick);
CREATE INDEX IF NOT EXISTS idx_protect_squad_updated ON protect_updates(squad_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_discord_links_member ON discord_member_links(member_id);
PRAGMA optimize;
