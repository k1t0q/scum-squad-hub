const auth='Basic '+Buffer.from(process.env.SCUM_IMAGEKIT_PRIVATE_KEY+':').toString('base64');
const r=await fetch('https://api.imagekit.io/v1/files?path=%2Fscum-hub&limit=1000',{headers:{Authorization:auth}});
if(!r.ok)throw Error('ImageKit HTTP '+r.status);
const files=await r.json();
console.log('ImageKit entries:',files.length);
console.log('Folders:',files.filter(x=>x.type==='folder').map(x=>x.name).join(', '));
