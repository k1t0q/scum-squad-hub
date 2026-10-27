// Signed session issuance is only callable after verified Steam OpenID.
const encoder=new TextEncoder();
function encode(value){return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
export async function issueSession(steamId,env,now=Math.floor(Date.now()/1000)){
 if(!/^7656119[0-9]{10}$/.test(steamId))throw Error('Invalid verified SteamID');
 if(typeof env.SESSION_HMAC_KEY!=='string'||env.SESSION_HMAC_KEY.length<32)throw Error('Missing session key');
 const claims={v:1,sub:steamId,iat:now,exp:now+3600};
 const payload=encode(encoder.encode(JSON.stringify(claims)));
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.SESSION_HMAC_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=encode(await crypto.subtle.sign('HMAC',key,encoder.encode(payload)));
 return payload+'.'+signature;
}
