// Tokens are verified server-side; issuance is disabled until Steam identity is validated.
const encoder=new TextEncoder();
function decodeBase64Url(value){
  const base=value.replace(/-/g,'+').replace(/_/g,'/');
  return Uint8Array.from(atob(base),ch=>ch.charCodeAt(0));
}
export async function verifySession(request,env){
  const authorization=request.headers.get('authorization')||'';
  const match=/^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authorization);
  if(!match||typeof env.SESSION_HMAC_KEY!=='string'||env.SESSION_HMAC_KEY.length<32)return null;
  try{
    const key=await crypto.subtle.importKey('raw',encoder.encode(env.SESSION_HMAC_KEY),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const valid=await crypto.subtle.verify('HMAC',key,decodeBase64Url(match[2]),encoder.encode(match[1]));
    if(!valid)return null;
    const claims=JSON.parse(new TextDecoder().decode(decodeBase64Url(match[1])));
    const now=Math.floor(Date.now()/1000);
    if(claims.v!==1||typeof claims.sub!=='string'||!/^\d{17}$/.test(claims.sub))return null;
    if(!Number.isSafeInteger(claims.exp)||claims.exp<=now||claims.exp>now+86400)return null;
    if(!Number.isSafeInteger(claims.iat)||claims.iat>now+60||claims.iat>claims.exp)return null;
    return {steamId:claims.sub};
  }catch{return null;}
}
