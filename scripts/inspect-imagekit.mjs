const auth='Basic '+Buffer.from(process.env.SCUM_IMAGEKIT_PRIVATE_KEY+':').toString('base64');
async function list(path){
 let skip=0;const result=[];
 while(true){
  const u=new URL('https://api.imagekit.io/v1/files');
  u.searchParams.set('path',path);u.searchParams.set('limit','1000');u.searchParams.set('skip',String(skip));u.searchParams.set('type','all');
  const r=await fetch(u,{headers:{Authorization:auth}});
  if(!r.ok)throw Error('ImageKit '+path+' HTTP '+r.status);
  const items=await r.json();result.push(...items);
  if(items.length<1000)break;
  skip+=items.length;
 }
 return result;
}
async function count(path){
 const items=await list(path);
 let n=0;
 for(const item of items){
  if(item.type==='folder')n+=await count(path.replace(/\/$/,'')+'/'+item.name);
  else n++;
 }
 return n;
}
const expected={'raid-photos':6,'squad-photos':100,'squad-place-images':19};
let total=0;
for(const [name,want] of Object.entries(expected)){
 const n=await count('/scum-hub/'+name);
 console.log(name+': '+n+' / '+want);
 if(n!==want)process.exitCode=1;
 total+=n;
}
console.log('Total files:',total);
if(total!==125)process.exitCode=1;

const {createHmac}=await import('node:crypto');
async function sample(path){for(const f of await list(path)){if(f.type!=='folder')return f;const v=await sample(path+'/'+f.name);if(v)return v}}
const f=await sample('/scum-hub');if(f){const u=new URL(f.url);console.log('Delivery path:',u.pathname,'File path:',f.filePath);const expiry=Math.floor(Date.now()/1000)+600;const candidates=[u.pathname.split('/').slice(2).join('/'),f.filePath.replace(/^\//,''),f.filePath,u.pathname,u.href];for(let i=0;i<candidates.length;i++){const url=new URL(f.url);url.search='';url.searchParams.set('ik-t',String(expiry));url.searchParams.set('ik-s',createHmac('sha1',process.env.SCUM_IMAGEKIT_PRIVATE_KEY.trim()).update(candidates[i]+expiry).digest('hex'));const r=await fetch(url);console.log('Signature candidate',i,'status',r.status,r.ok?'OK':(await r.text()).slice(0,100));if(r.ok)break}}
