// Code-based login for the migration Worker; Steam is not required.
// Compare against the existing server-side D1 squad code; never return it to clients.
const encoder=new TextEncoder();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function constantEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
export async function verifySquadCode(request,env){
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'invalid_origin'},403);
  if(!env.DB)return json({error:'code_login_not_configured'},503);
  // Reject verification if the Worker has no configured abuse protection.
  if (!env.CODE_LOGIN_LIMITER) return json({error:'rate_limit_unavailable'},503);
  const clientIp=request.headers.get('cf-connecting-ip');
  if (!clientIp) return json({error:'client_ip_unavailable'},403);
  try {
    const result=await env.CODE_LOGIN_LIMITER.limit({key:clientIp});
    if (!result.success) return json({error:'too_many_attempts'},429);
  } catch { return json({error:'rate_limit_unavailable'},503); }
  let body;try{body=await request.json()}catch{return json({error:'invalid_json'},400)}
  const nick=String(body?.nick||'').trim(),code=String(body?.code||''),role=String(body?.role||'');
  if(!/^[^<>\u0000-\u001f]{2,32}$/.test(nick)||code.length<4||code.length>128||(role!==''&&!['Rifler','Sniper','Bomber','Locker','Builder','Helper'].includes(role)))return json({error:'invalid_credentials'},400);
  // Verify the existing legacy squad code against its own squad. This preserves
  // current squad codes without requiring users to re-register or use Steam.
  // The imported legacy invite_code column must later be migrated to a salted hash.
  const member=await env.DB.prepare('SELECT m.id,m.squad_id,m.nick,m.game_role,m.access_role,s.invite_code FROM members m JOIN squads s ON s.id=m.squad_id WHERE lower(m.nick)=lower(?) AND m.is_active=1 LIMIT 100').bind(nick).all();
  const supplied=await digest(code);
  const matches=[];
  for(const record of member.results||[]){
    const expected=await digest(String(record.invite_code||''));
    if(constantEqual(expected,supplied))matches.push(record);
  }
  if(matches.length===0){
    // A new nickname can join only a squad with a valid, unique invite code.
    // Existing nicknames (including inactive ones) must not be silently replaced.
    const squads=await env.DB.prepare('SELECT id,invite_code FROM squads WHERE invite_code IS NOT NULL AND length(invite_code)>=4 LIMIT 100').all();
    const valid=[];
    for(const squad of squads.results||[]){
      if(constantEqual(await digest(String(squad.invite_code)),supplied))valid.push(squad);
    }
    if(valid.length!==1)return json({error:'invalid_credentials'},401);
    if(!role)return json({error:'role_required'},400);
    const squad=valid[0];
    const occupied=await env.DB.prepare('SELECT id FROM members WHERE squad_id=? AND lower(nick)=lower(?) LIMIT 1').bind(squad.id,nick).first();
    if(occupied)return json({error:'nickname_taken'},409);
    const id=crypto.randomUUID();
    try{
      await env.DB.prepare('INSERT INTO members (id,squad_id,nick,game_role,access_role,joined_at,is_active) VALUES (?,?,?,?,?,?,1)')
        .bind(id,squad.id,nick,role,'member',new Date().toISOString()).run();
    }catch{return json({error:'registration_failed'},503)}
    return json({verified:true,member:{id,squad_id:squad.id,nick,game_role:role}});
  }
  if(matches.length!==1)return json({error:'invalid_credentials'},401);
  const record=matches[0];
  // A shared squad code must never authenticate or impersonate an administrator.
  if(record.access_role==='admin')return json({error:'admin_requires_separate_login'},403);
  // This is only a verification result, NOT an authenticated session.
  return json({verified:true,member:{id:record.id,squad_id:record.squad_id,nick:record.nick,game_role:record.game_role}});
}
