const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));
const fail=(error,status)=>new Response(JSON.stringify({error}),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
async function hmac(env,usage){if(typeof env.ADMIN_SESSION_KEY!=='string'||env.ADMIN_SESSION_KEY.length<32)throw Error('admin_session_not_configured');return crypto.subtle.importKey('raw',enc.encode(env.ADMIN_SESSION_KEY),{name:'HMAC',hash:'SHA-256'},false,[usage])}
export async function adminLogin(request,env){
 if(request.headers.get('origin')!==new URL(request.url).origin)return fail('invalid_origin',403);
 if(!env.DB||!env.ADMIN_CODE_HASH||!env.ADMIN_SESSION_KEY||!env.CODE_LOGIN_LIMITER)return fail('admin_not_configured',503);
 const ip=request.headers.get('cf-connecting-ip');
 if(!ip)return fail('client_ip_unavailable',403);
 try{const limit=await env.CODE_LOGIN_LIMITER.limit({key:ip});if(!limit.success)return fail('too_many_attempts',429)}catch{return fail('rate_limit_unavailable',503)}
 let body;try{body=await request.json()}catch{return fail('invalid_json',400)}
 const code=String(body?.code||'');
 if(code.length<8||code.length>128)return fail('invalid_credentials',401);
 const digest=await crypto.subtle.digest('SHA-256',enc.encode(code));
 const hex=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const expected=env.ADMIN_CODE_HASH;
 if(typeof expected!=='string'||expected.length!==64)return fail('admin_not_configured',503);
 let diff=0;for(let i=0;i<64;i++)diff|=hex.charCodeAt(i)^expected.charCodeAt(i);
 if(diff!==0)return fail('invalid_credentials',401);
 const rows=await env.DB.prepare("SELECT id,squad_id,nick,game_role,access_role FROM members WHERE lower(nick)='k1t0' AND access_role='admin' AND is_active=1 LIMIT 2").all();
 if(rows.results?.length!==1)return fail('admin_account_not_found',503);
 const admin=rows.results[0],now=Math.floor(Date.now()/1000);
 const payload=b64(enc.encode(JSON.stringify({v:1,mid:admin.id,sid:admin.squad_id,iat:now,exp:now+3600,scope:'admin'})));
 const sig=b64(await crypto.subtle.sign('HMAC',await hmac(env,'sign'),enc.encode(payload)));
 return new Response(JSON.stringify({member:admin}),{headers:{'content-type':'application/json','cache-control':'no-store','set-cookie':'scum_admin_session='+payload+'.'+sig+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600'}});
}
export async function verifyAdminSession(request,env){
 const raw=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('scum_admin_session='));
 if(!raw)return null;
 try{
 const parts=raw.slice(19).split('.');
 if(parts.length!==2||!parts.every(x=>/^[A-Za-z0-9_-]+$/.test(x)))return null;
 if(!await crypto.subtle.verify('HMAC',await hmac(env,'verify'),unb64(parts[1]),enc.encode(parts[0])))return null;
 const data=JSON.parse(new TextDecoder().decode(unb64(parts[0]))),now=Math.floor(Date.now()/1000);
 if(data.v!==1||data.scope!=='admin'||!Number.isSafeInteger(data.iat)||!Number.isSafeInteger(data.exp)||data.exp<=now||data.exp>now+3600||data.exp-data.iat!==3600)return null;
 const member=await env.DB.prepare("SELECT id,squad_id,nick,game_role,access_role FROM members WHERE id=? AND squad_id=? AND access_role='admin' AND is_active=1 LIMIT 1").bind(data.mid,data.sid).first();
 return member?.nick?.toLowerCase()==='k1t0'?member:null;
 }catch{return null}
}
export const clearAdminCookie='scum_admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
