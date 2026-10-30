import {createHmac} from 'node:crypto';
// Only changes verified URL references in the isolated D1 copy. Keeps originals intact.
const e=process.env;
for(const k of ['SCUM_IMAGEKIT_PRIVATE_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'])if(!e[k])throw Error('Missing '+k);
const headers={Authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,'content-type':'application/json'};
const endpoint='https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+'/d1/database/924cdc85-bd75-462a-87f6-a9a739054905/query';
async function query(sql,params=[]){const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({sql,params})});const v=await r.json();if(!r.ok||!v.success)throw Error('D1 query failed '+r.status+' '+JSON.stringify(v.errors));return v.result[0].results||[]}
const files=[];
async function list(path){for(let skip=0;;skip+=1000){const u=new URL('https://api.imagekit.io/v1/files');u.searchParams.set('path',path);u.searchParams.set('type','all');u.searchParams.set('limit','1000');u.searchParams.set('skip',String(skip));const r=await fetch(u,{headers:{Authorization:'Basic '+Buffer.from(e.SCUM_IMAGEKIT_PRIVATE_KEY+':').toString('base64')}});if(!r.ok)throw Error('ImageKit inventory failed '+r.status);const a=await r.json();for(const f of a){if(f.type==='folder')await list(path.replace(/\/$/,'')+'/'+f.name);else files.push(f)}if(a.length<1000)break}}
await list('/scum-hub');
console.log('ImageKit inventory:',files.length);
const byPath=new Map(files.map(f=>[f.filePath.replace(/^\/scum-hub\//,''),f.url]));
let changed=0,missing=0;for(const [t,pk,columns] of [['squad_place_posts','id',['images','comment']],['squad_places','id',['images','comment']],['raids','id',['target_images']],['squads','id',['appearance']],['squad_photo_annotations','photo_url',['photo_url']]]){
 for(const row of await query('SELECT * FROM '+t))for(const col of columns){const raw=row[col];if(typeof raw!=='string'||!raw.includes('supabase.co/storage/'))continue;let updated=raw;const refs=[...new Set(raw.match(/https:\/\/[^\s"\\]+supabase\.co\/storage\/v1\/object\/public\/[^\s"\\]+/g)||[])];for(const src of refs){const path=new URL(src).pathname.split('/object/public/')[1];const target=byPath.get(decodeURIComponent(path));if(!target){missing++;console.log('Unmapped reference:',t,col);continue}const signed=new URL(target),expiry=Math.floor(Date.now()/1000)+300;const sig=createHmac('sha1',e.SCUM_IMAGEKIT_PRIVATE_KEY).update(signed.pathname.split('/').slice(2).join('/')+expiry).digest('hex');signed.searchParams.set('ik-t',String(expiry));signed.searchParams.set('ik-s',sig);let check=await fetch(signed,{method:'HEAD'});if(!check.ok)check=await fetch(signed,{headers:{Range:'bytes=0-0'}});if(!check.ok){console.log('Image verification failed:',check.status,new URL(target).hostname);missing++;continue}updated=updated.split(src).join(target)}if(updated!==raw){await query('UPDATE '+t+' SET '+col+'=? WHERE '+pk+'=?',[updated,row[pk]]);changed++}}
}
console.log('Updated fields:',changed,'unmapped references:',missing);if(missing)process.exitCode=1;
