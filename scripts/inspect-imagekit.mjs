const auth='Basic '+Buffer.from(process.env.SCUM_IMAGEKIT_PRIVATE_KEY+':').toString('base64');
const paths=['/','/scum-hub','/scum-hub/raid-photos','/scum-hub/squad-photos','/scum-hub/squad-place-images'];
for(const path of paths){
 const u=new URL('https://api.imagekit.io/v1/files');
 u.searchParams.set('path',path);
 u.searchParams.set('limit','1000');
 u.searchParams.set('type','all');
 const r=await fetch(u,{headers:{Authorization:auth}});
 if(!r.ok)throw Error('ImageKit listing '+path+' HTTP '+r.status);
 const items=await r.json();
 console.log('Path:',path,'entries:',items.length,'folders:',items.filter(x=>x.type==='folder').map(x=>x.name).join(', '));
}

// Inventory is read-only and intentionally prints no API keys.
