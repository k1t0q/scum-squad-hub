export function steamLinkClient(baseUrl, getToken, fetcher=fetch) {
 const base=new URL(baseUrl);
 if(base.protocol!=='https:')throw Error('HTTPS required');
 async function call(path,options={}){
  const token=await getToken();
  if(!token)throw Error('Steam session required');
  const response=await fetcher(new URL(path,base).toString(),{
   ...options,headers:{...options.headers,authorization:'Bearer '+token},cache:'no-store'
  });
  if(!response.ok)throw Error('Steam link request failed: '+response.status);
  return response.json();
 }
 return {
  status:()=>call('/api/link-status'),
  link:legacyToken=>call('/api/link-legacy-account',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({legacy_access_token:legacyToken})})
 };
}
