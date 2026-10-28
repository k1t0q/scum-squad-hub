// Code-based login for the migration Worker; Steam is not required.
// Credentials must be provisioned as Worker secrets. Never expose the code or hash.
const encoder=new TextEncoder();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function constantEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
export async function verifySquadCode(request,env){
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'invalid_origin'},403);
  if(!env.SQUAD_CODE_PEPPER||!env.SQUAD_CODE_HASH||!env.DB)return json({error:'code_login_not_configured'},503);
  let body;try{body=await request.json()}catch{return json({error:'invalid_json'},400)}
  const nick=String(body?.nick||'').trim(),code=String(body?.code||''),role=String(body?.role||'');
  if(!/^[^<>\u0000-\u001f]{2,32}$/.test(nick)||code.length<4||code.length>128||!['Rifler','Sniper','Bomber','Locker','Builder','Helper'].includes(role))return json({error:'invalid_credentials'},400);
  // Hash with a server-only pepper; the raw squad code never enters the database.
  const hash=await digest(env.SQUAD_CODE_PEPPER+':'+code);
  if(!constantEqual(hash,env.SQUAD_CODE_HASH))return json({error:'invalid_credentials'},401);
  // Only a previously registered, active member may log in; no implicit admin grants.
  const member=await env.DB.prepare('SELECT id,squad_id,nick,game_role,access_role FROM members WHERE lower(nick)=lower(?) AND is_active=1 LIMIT 2').bind(nick).all();
  if(member.results?.length!==1)return json({error:'member_not_found_or_ambiguous'},403);
  if(member.results[0].game_role!==role)return json({error:'invalid_credentials'},401);
  return json({verified:true,member:member.results[0]});
}
