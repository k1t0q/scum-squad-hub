import { checkStash } from './stash-update.mjs';
import { updateExplosives } from './explosives-update.mjs';
import { authorizeSquad } from './squad-authorization.mjs';
import { createSteamLoginUrl } from './steam-openid.mjs';
import { verifySteamAssertion } from './steam-verify.mjs';
import { createLoginState, verifyLoginState } from './steam-state.mjs';
import { issueSession } from './issue-session.mjs';
import { verifySession } from './session-auth.mjs';
// Isolated SCUM HUB migration Worker. Never expose squad records without verified sessions.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    const origin = env.PUBLIC_ORIGIN;
    if (request.method === 'GET' && url.pathname === '/auth/steam/start') {
      if (!origin || new URL(origin).origin !== url.origin) return new Response(JSON.stringify({error:'origin_not_configured'}),{status:503,headers});
      const state=await createLoginState(env);
      const cookie='steam_state='+encodeURIComponent(state)+'; Path=/auth/steam; HttpOnly; Secure; SameSite=Lax; Max-Age=300';
      return new Response(null,{status:302,headers:{location:createSteamLoginUrl(origin,state),'set-cookie':cookie,'cache-control':'no-store'}});
    }
    if (request.method === 'GET' && url.pathname === '/auth/steam/callback') {
      if (!origin || new URL(origin).origin !== url.origin) return new Response(JSON.stringify({error:'origin_not_configured'}),{status:503,headers});
      const cookie=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('steam_state='));
      const stored=cookie?decodeURIComponent(cookie.slice('steam_state='.length)):null;
      const state=url.searchParams.get('state');
      if (!stored || !state || stored!==state || !(await verifyLoginState(state,env)))return new Response(JSON.stringify({error:'invalid_state'}),{status:401,headers});
      const steamId=await verifySteamAssertion(request.url,origin);
      if (!steamId)return new Response(JSON.stringify({error:'steam_verification_failed'}),{status:401,headers});
      const token=await issueSession(steamId,env);
      return new Response(JSON.stringify({token_type:'Bearer',access_token:token,expires_in:3600}),{status:200,headers:{...headers,'set-cookie':'steam_state=; Path=/auth/steam; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}});
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      try {
        const result = await env.DB.prepare('SELECT 1 AS ok').first();
        return new Response(JSON.stringify({ service: 'scum-hub-migration', database: result?.ok === 1 ? 'ok' : 'unavailable' }), { status: result?.ok === 1 ? 200 : 503, headers });
      } catch {
        return new Response(JSON.stringify({ service: 'scum-hub-migration', database: 'unavailable' }), { status: 503, headers });
      }
    }
    if (url.pathname.startsWith('/api/')) {
      const identity = await verifySession(request, env);
      if (!identity) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });
      if (request.method === 'GET' && url.pathname === '/api/squad-access') {
        const squadId = url.searchParams.get('squad_id');
        if (!squadId) return new Response(JSON.stringify({error:'missing_squad_id'}),{status:400,headers});
        const membership = await authorizeSquad(env,identity.steamId,squadId);
        if (!membership) return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers});
        return new Response(JSON.stringify({member_id:membership.memberId,squad_id:membership.squadId,access_role:membership.role}),{status:200,headers});
      }
      if (request.method === 'GET' && (url.pathname === '/api/stashes' || url.pathname === '/api/explosives')) {
        const squadId=url.searchParams.get('squad_id');
        if (!squadId) return new Response(JSON.stringify({error:'missing_squad_id'}),{status:400,headers});
        const membership=await authorizeSquad(env,identity.steamId,squadId);
        if (!membership) return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers});
        try {
          const stashes=url.pathname==='/api/stashes';
          const sql=stashes
            ? "SELECT id,kind,images,comment,created_at,stash_checked_at,stash_checked_by,map_marker_name FROM squad_place_posts WHERE squad_id = ? AND kind = 'stash' ORDER BY created_at DESC LIMIT 200"
            : "SELECT item,quantity,updated_at FROM explosives_inventory WHERE squad_id = ? ORDER BY item LIMIT 200";
          const result=await env.DB.prepare(sql).bind(squadId).all();
          return new Response(JSON.stringify({items:result.results||[]}),{status:200,headers});
        } catch {return new Response(JSON.stringify({error:'database_unavailable'}),{status:503,headers});}
      }
      if (request.method === 'PATCH' && url.pathname === '/api/explosives') {
        const squadId = url.searchParams.get('squad_id');
        if (!squadId) return new Response(JSON.stringify({error:'missing_squad_id'}), {status:400,headers});
        const membership = await authorizeSquad(env, identity.steamId, squadId);
        if (!membership) return new Response(JSON.stringify({error:'forbidden'}), {status:403,headers});
        return updateExplosives(request, env, membership, squadId, headers);
      }
      if (request.method === 'POST' && url.pathname === '/api/stashes/check') {
        const squadId=url.searchParams.get('squad_id');
        if (!squadId)return new Response(JSON.stringify({error:'missing_squad_id'}),{status:400,headers});
        const membership=await authorizeSquad(env,identity.steamId,squadId);
        if (!membership)return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers});
        return checkStash(request,env,membership,squadId,headers);
      }
      return new Response(JSON.stringify({ error: 'not_implemented', message: 'Squad data APIs are not enabled' }), { status: 501, headers });
    }
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers });
  }
};
