import { steamLinkStatus } from './steam-link-status.mjs';
import { linkLegacyAccount } from './legacy-account-link.mjs';
import { deleteMapMarker } from './map-marker-delete.mjs';
import { createMapMarker } from './map-marker-create.mjs';
import { updateMapMarker } from './map-marker-update.mjs';
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
      if (typeof env.SESSION_HMAC_KEY !== 'string' || env.SESSION_HMAC_KEY.length < 32) return new Response(JSON.stringify({error:'session_key_not_configured'}),{status:503,headers});
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
      let verificationReason='unknown';
      const steamId=await verifySteamAssertion(request.url,origin,fetch,reason=>{verificationReason=reason;console.warn('steam_openid_verification_failed',reason);});
      if (!steamId)return new Response(JSON.stringify({error:'steam_verification_failed',reason:verificationReason}),{status:401,headers});
      const token=await issueSession(steamId,env);
      const responseHeaders=new Headers(headers);
      responseHeaders.set('location','/link');
      responseHeaders.append('set-cookie','steam_state=; Path=/auth/steam; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
      responseHeaders.append('set-cookie','scum_steam_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600');
      return new Response(null,{status:303,headers:responseHeaders});
    }
    if (request.method === 'GET' && url.pathname === '/link') {
      const identity=await verifySession(request,env);
      if(!identity)return Response.redirect(url.origin+'/auth/steam/start',302);
      const {linkPage}=await import('./migration-link-page.mjs');
      return new Response(linkPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self' https://zicapopwsssopyxphhpo.supabase.co; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",'referrer-policy':'no-referrer'}});
    }
    if (request.method === 'GET' && url.pathname === '/migration-link.js') {
      const {linkScript}=await import('./migration-link-script.mjs');
      return new Response(linkScript,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
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
      if(!['GET','HEAD','OPTIONS'].includes(request.method) && request.headers.get('origin')!==url.origin)return new Response(JSON.stringify({error:'invalid_origin'}),{status:403,headers});
      const identity = await verifySession(request, env);
      if (!identity) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });
      if (request.method === 'GET' && url.pathname === '/api/my-steam-id') return new Response(JSON.stringify({steam_id:identity.steamId}),{status:200,headers});
      if (request.method === 'GET' && url.pathname === '/api/link-status') return steamLinkStatus(env,identity.steamId,headers);
      if (request.method === 'POST' && url.pathname === '/api/link-legacy-account') {
        if(request.headers.get('origin')!==url.origin)return new Response(JSON.stringify({error:'invalid_origin'}),{status:403,headers});
        return linkLegacyAccount(request,env,identity.steamId,headers);
      }
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
      if (request.method === 'GET' && url.pathname === '/api/place-posts') {
        const squadId=url.searchParams.get('squad_id');
        const kind=url.searchParams.get('kind');
        if (!squadId)return new Response(JSON.stringify({error:'missing_squad_id'}),{status:400,headers});
        if (!['stash','base','other'].includes(kind))return new Response(JSON.stringify({error:'invalid_kind'}),{status:400,headers});
        const membership=await authorizeSquad(env,identity.steamId,squadId);
        if (!membership)return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers});
        try {
          const result=await env.DB.prepare(
            'SELECT id,kind,images,comment,created_by,created_at,stash_checked_at,stash_checked_by,map_marker_name FROM squad_place_posts WHERE squad_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 200'
          ).bind(squadId,kind).all();
          const items=(result.results||[]).map(item=>{
            let images=item.images;
            if(typeof images==='string'){try{images=JSON.parse(images)}catch{images=[]}}
            return {...item,images:Array.isArray(images)?images:[]};
          });
          return new Response(JSON.stringify({items}),{status:200,headers});
        }catch{return new Response(JSON.stringify({error:'database_unavailable'}),{status:503,headers});}
      }
      if (request.method === 'GET' && url.pathname === '/api/map-markers') {
        const squadId=url.searchParams.get('squad_id');
        if (!squadId)return new Response(JSON.stringify({error:'missing_squad_id'}),{status:400,headers});
        const membership=await authorizeSquad(env,identity.steamId,squadId);
        if (!membership)return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers});
        try {
          const result=await env.DB.prepare(
            'SELECT id,x,y,type,name,note,icon,color,size,show_label,locked,created_by,updated_at,enemy_nicks FROM squad_map_markers WHERE squad_id = ? ORDER BY updated_at DESC LIMIT 1000'
          ).bind(squadId).all();
          const items=(result.results||[]).map(marker=>{
            let enemyNicks=marker.enemy_nicks;
            if(typeof enemyNicks==='string'){try{enemyNicks=JSON.parse(enemyNicks)}catch{enemyNicks=[]}}
            return {...marker,showLabel:marker.show_label===1||marker.show_label===true,locked:marker.locked===1||marker.locked===true,enemyNicks:Array.isArray(enemyNicks)?enemyNicks:[]};
          });
          return new Response(JSON.stringify({items}),{status:200,headers});
        }catch{return new Response(JSON.stringify({error:'database_unavailable'}),{status:503,headers});}
      }
      if (request.method === 'POST' && url.pathname === '/api/map-markers') {
        const squadId=url.searchParams.get('squad_id');
        if(!squadId)return new Response(JSON.stringify({error:'missing_squad_id'}),{status:400,headers});
        const membership=await authorizeSquad(env,identity.steamId,squadId);
        if(!membership)return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers});
        return createMapMarker(request,env,membership,squadId,headers);
      }
      if (request.method === 'DELETE' && url.pathname === '/api/map-markers') {
        const squadId=url.searchParams.get('squad_id');
        if(!squadId)return new Response(JSON.stringify({error:'missing_squad_id'}),{status:400,headers});
        const membership=await authorizeSquad(env,identity.steamId,squadId);
        if(!membership)return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers});
        return deleteMapMarker(request,env,membership,squadId,headers);
      }
      if (request.method === 'PATCH' && url.pathname === '/api/map-markers') {
        const squadId=url.searchParams.get('squad_id');
        if (!squadId)return new Response(JSON.stringify({error:'missing_squad_id'}),{status:400,headers});
        const membership=await authorizeSquad(env,identity.steamId,squadId);
        if (!membership)return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers});
        return updateMapMarker(request,env,membership,squadId,headers);
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
