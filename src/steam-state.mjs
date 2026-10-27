const encoder=new TextEncoder();
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function signature(message,key){
 const secret=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return encode(await crypto.subtle.sign('HMAC',secret,encoder.encode(message)));
}
export async function createLoginState(env,now=Date.now()){
 if(!env.SESSION_HMAC_KEY||env.SESSION_HMAC_KEY.length<32)throw Error('Missing key');
 const nonce=encode(crypto.getRandomValues(new Uint8Array(24)));
 const payload=encode(encoder.encode(JSON.stringify({nonce,exp:Math.floor(now/1000)+300})));
 return payload+'.'+await signature(payload,env.SESSION_HMAC_KEY);
}
export async function verifyLoginState(value,env,now=Date.now()){
 if(typeof value!=='string'||!env.SESSION_HMAC_KEY||env.SESSION_HMAC_KEY.length<32)return false;
 const parts=value.split('.');
 if(parts.length!==2)return false;
 const expected=await signature(parts[0],env.SESSION_HMAC_KEY);
 if(expected.length!==parts[1].length)return false;
 let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^parts[1].charCodeAt(i);
 if(difference!==0)return false;
 try{
 const p=JSON.parse(atob(parts[0].replace(/-/g,'+').replace(/_/g,'/')));
 return typeof p.nonce==='string'&&p.nonce.length>=24&&Number.isSafeInteger(p.exp)&&p.exp>Math.floor(now/1000)&&p.exp<=Math.floor(now/1000)+300;
 }catch{return false;}
}
