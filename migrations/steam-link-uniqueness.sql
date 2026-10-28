-- Apply only after validating existing records. Not deployed automatically.
-- A Steam account may belong to one SCUM HUB squad, and a member to one Steam account.
CREATE UNIQUE INDEX IF NOT EXISTS scum_steam_links_one_squad_per_steam
ON scum_verified_steam_links(steamid);
CREATE UNIQUE INDEX IF NOT EXISTS scum_steam_links_one_steam_per_member
ON scum_verified_steam_links(member_id);
