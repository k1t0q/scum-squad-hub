// Code-based login for the migration Worker; Steam is not required.
// Credentials must be provisioned as Worker secrets. Never expose the code or hash.
const encoder=new TextEncoder();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function constantEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
export async function verifySquadCode(request,env){
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'invalid_origin'},403);
  if(!env.SQUAD_CODE_PEPPER||!env.DB)return json({error:'code_login_not_configured'},503);
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
  if(!/^[^<>\u0000-\u001f]{2,32}$/.test(nick)||code.length<4||code.length>128||!['Rifler','Sniper','Bomber','Locker','Builder','Helper'].includes(role))return json({error:'invalid_credentials'},400);
  // Verify the existing legacy squad code against its own squad. This preserves
  // current squad codes without requiring users to re-register or use Steam.
  // The imported legacy invite_code column must later be migrated to a salted hash.
  const member=await env.DB.prepare('SELECT m.id,m.squad_id,m.nick,m.game_role,m.access_role,s.invite_code FROM members m JOIN squads s ON s.id=m.squad_id WHERE lower(m.nick)=lower(?) AND m.is_active=1 LIMIT 100').bind(nick).all();
  const supplied=await digest(env.SQUAD_CODE_PEPPER+':'+code);
  const matches=[];
  for(const record of member.results||[]){
    const expected=await digest(env.SQUAD_CODE_PEPPER+':'+String(record.invite_code||''));
    if(constantEqual(expected,supplied)&&record.game_role===role)matches.push(record);
  }
  if(matches.length!==1)return json({error:'invalid_credentials'},401);
  const record=matches[0];
  // A shared squad code must never authenticate or impersonate an administrator.
  if(member.results[0].access_role==='admin')return json({error:'admin_requires_separate_login'},403);
  // This is only a verification result, NOT an authenticated session.
  return json({verified:true,member:{id:member.results[0].id,squad_id:member.results[0].squad_id,nick:member.results[0].nick,game_role:member.results[0].game_role}});
}
