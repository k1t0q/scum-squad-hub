import {verifySession} from './session-auth.mjs';
// Steam identity grants access only through an existing verified, active link.
export async function verifiedSteamMember(request,env){
 const identity=await verifySession(request,env);
 if(!identity)return null;
 return env.DB.prepare('SELECT m.id,m.squad_id,m.nick,m.game_role,m.access_role FROM scum_verified_steam_links l JOIN members m ON m.id=l.member_id AND m.squad_id=l.squad_id WHERE l.steamid=? AND m.is_active=1 LIMIT 1').bind(identity.steamId).first();
}
export const clearSteamCookie='scum_steam_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
