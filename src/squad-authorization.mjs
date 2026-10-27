// Explicit mapping is required: never trust squad_id or member_id supplied by clients.
// The mapping table must be populated only by a verified account-linking workflow.
export async function authorizeSquad(env, steamId, squadId) {
 if (!/^7656119[0-9]{10}$/.test(steamId) || typeof squadId!=='string' || !squadId) return null;
 if (!env.DB || typeof env.DB.prepare!=='function') return null;
 try {
  const result=await env.DB.prepare(
   'SELECT m.id AS member_id, m.squad_id AS squad_id, m.access_role AS access_role FROM scum_verified_steam_links AS l JOIN members AS m ON m.id = l.member_id WHERE l.steamid = ? AND l.squad_id = ? AND m.squad_id = l.squad_id AND m.is_active = 1 LIMIT 1'
  ).bind(steamId,squadId).first();
  if (!result || result.squad_id!==squadId || !result.member_id) return null;
  return {memberId:result.member_id,squadId:result.squad_id,role:result.access_role};
 } catch { return null; }
}
