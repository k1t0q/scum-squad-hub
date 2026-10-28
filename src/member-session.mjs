// Signed, short-lived member session. Shared squad code is NOT a personal identity factor.
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));
async function key(env,usage){if(typeof env.MEMBER_SESSION_KEY!=='string'||env.MEMBER_SESSION_KEY.length<32)throw Error('member_session_not_configured');return crypto.subtle.importKey('raw',enc.encode(env.MEMBER_SESSION_KEY),{name:'HMAC',hash:'SHA-256'},false,[usage])}
export async function createMemberSession(member,env,now=Math.floor(Date.now()/1000)){
 if(!member?.id||!member?.squad_id)throw Error('invalid_member');
 const payload=b64(enc.encode(JSON.stringify({v:1,mid:member.id,sid:member.squad_id,iat:now,exp:now+3600})));
 const sig=b64(await crypto.subtle.sign('HMAC',await key(env,'sign'),enc.encode(payload)));
 return payload+'.'+sig;
}
export async function verifyMemberSession(request,env){
 const raw=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('scum_member_session='));
 if(!raw)return null;
 const token=raw.slice('scum_member_session='.length),parts=token.split('.');
 if(parts.length!==2||!parts.every(x=>/^[A-Za-z0-9_-]+$/.test(x)))return null;
 try{
  const valid=await crypto.subtle.verify('HMAC',await key(env,'verify'),unb64(parts[1]),enc.encode(parts[0]));
  if(!valid)return null;
  const data=JSON.parse(new TextDecoder().decode(unb64(parts[0])));
  const now=Math.floor(Date.now()/1000);
  if(data.v!==1||typeof data.mid!=='string'||typeof data.sid!=='string'||!Number.isSafeInteger(data.iat)||!Number.isSafeInteger(data.exp)||data.exp<=now||data.exp>now+3600||data.iat>now+60||data.iat>data.exp||data.exp-data.iat!==3600)return null;
  const member=await env.DB.prepare('SELECT id,squad_id,nick,game_role,access_role FROM members WHERE id=? AND squad_id=? AND is_active=1 LIMIT 1').bind(data.mid,data.sid).first();
  if(!member||member.access_role==='admin')return null;
  return member;
 }catch{return null}
}
export const memberCookie=token=>'scum_member_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600';
export const clearMemberCookie='scum_member_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
