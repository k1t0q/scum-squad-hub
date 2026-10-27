// Run only from the isolated migration branch. Does not delete Supabase originals.
const env=process.env;
for(const name of ['SCUM_SUPABASE_URL','SCUM_SUPABASE_SERVICE_ROLE_KEY','SCUM_IMAGEKIT_PRIVATE_KEY'])if(!env[name])throw Error('Missing secret: '+name);
const origin=env.SCUM_SUPABASE_URL.replace(/\/$/,'');
const buckets=['raid-photos','squad-photos','squad-place-images'];
const auth={apikey:env.SCUM_SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SCUM_SUPABASE_SERVICE_ROLE_KEY};
const imagekitAuth='Basic '+Buffer.from(env.SCUM_IMAGEKIT_PRIVATE_KEY+':').toString('base64');
const apply=env.APPLY_IMAGES==='true';
async function list(bucket,prefix=''){
 const r=await fetch(origin+'/storage/v1/object/list/'+encodeURIComponent(bucket),{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({prefix,limit:1000,offset:0,sortBy:{column:'name',order:'asc'}})});
 if(!r.ok)throw Error('Storage list failed '+bucket+': HTTP '+r.status);
 const items=await r.json();if(items.length===1000)throw Error('Pagination needed in '+bucket+'/'+prefix);
 const files=[];
 for(const item of items){const path=prefix?prefix+'/'+item.name:item.name;if(item.id)files.push(path);else files.push(...await list(bucket,path))}
 return files;
}
let total=0;
for(const bucket of buckets){
 const files=await list(bucket);console.log(bucket+': '+files.length+' objects');total+=files.length;
 if(!apply)continue;
 for(const path of files){
  const src=await fetch(origin+'/storage/v1/object/'+bucket+'/'+path.split('/').map(encodeURIComponent).join('/'),{headers:auth});
  if(!src.ok)throw Error('Download failed '+bucket+'/'+path+': HTTP '+src.status);
  const bytes=Buffer.from(await src.arrayBuffer());
  const form=new FormData();
  form.set('file',bytes.toString('base64'));form.set('fileName',path.split('/').pop());
  form.set('folder','/scum-hub/'+bucket+'/'+path.split('/').slice(0,-1).join('/'));
  form.set('useUniqueFileName','false');
  const upload=await fetch('https://upload.imagekit.io/api/v1/files/upload',{method:'POST',headers:{Authorization:imagekitAuth},body:form});
  if(!upload.ok)throw Error('ImageKit upload failed '+bucket+'/'+path+': HTTP '+upload.status);
  console.log('uploaded '+bucket+'/'+path);
 }
}
console.log('Total files: '+total+'. '+(apply?'Upload finished; verify URLs and access before cutover.':'Dry run only.'));
