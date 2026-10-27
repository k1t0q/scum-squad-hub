// Optional migration adapter. No production UI calls this until authenticated cutover.
export function createMapApiClient({baseUrl, getToken, getSquadId, fetcher=fetch}) {
 const base=new URL(baseUrl);
 if(base.protocol!=='https:')throw new Error('HTTPS required');
 async function request(path,options={}) {
  const token=await getToken();
  const squadId=await getSquadId();
  if(typeof token!=='string'||!token||typeof squadId!=='string'||!squadId)throw new Error('Authentication required');
  const url=new URL(path,base);
  if(url.origin!==base.origin)throw new Error('Invalid API origin');
  url.searchParams.set('squad_id',squadId);
  const response=await fetcher(url.toString(),{...options,headers:{authorization:'Bearer '+token,...options.headers}});
  if(!response.ok)throw new Error('Map API request failed: '+response.status);
  return response.json();
 }
 const posts=kind=>request('/api/place-posts?kind='+encodeURIComponent(kind)).then(data=>data.items);
 return {
  listMarkers:()=>request('/api/map-markers').then(data=>data.items),
  listPosts:posts,
  createMarker:marker=>request('/api/map-markers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(marker)}),
  updateMarker:marker=>request('/api/map-markers',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(marker)}),
  checkStash:id=>request('/api/stashes/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})})
 };
}
