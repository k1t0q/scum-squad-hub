// Keep canonical URLs in D1; sign only authenticated delivery responses.
export function canonicalImageUrl(value){
 if(typeof value!=='string'||!value.startsWith('https://ik.imagekit.io/'))return value;
 const u=new URL(value);u.searchParams.delete('ik-s');u.searchParams.delete('ik-t');return u.href;
}
export async function signImageUrl(value,key,now=Math.floor(Date.now()/1000)){
 const src=canonicalImageUrl(value);if(src===value&&!String(src).startsWith('https://ik.imagekit.io/'))return value;if(!key)return src;
 const u=new URL(src),expiry=now+7200;
 const path=u.pathname.split('/').slice(2).join('/')+(u.search||'');
 const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(path+expiry)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 u.searchParams.set('ik-t',String(expiry));u.searchParams.set('ik-s',sig);return u.href;
}
export async function signImageValues(data,key){
 if(typeof data==='string')return data.startsWith('https://ik.imagekit.io/')?signImageUrl(data,key):data;
 if(Array.isArray(data))return Promise.all(data.map(v=>signImageValues(v,key)));
 if(data&&typeof data==='object')return Object.fromEntries(await Promise.all(Object.entries(data).map(async([k,v])=>[k,await signImageValues(v,key)])));
 return data;
}
export function canonicalImageValues(data){
 if(typeof data==='string')return canonicalImageUrl(data);
 if(Array.isArray(data))return data.map(canonicalImageValues);
 if(data&&typeof data==='object')return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,canonicalImageValues(v)]));
 return data;
}
