// D1-to-legacy UI data adapter. Only used by the migration branch.
// The existing SCUM HUB interface expects the shapes returned here.
export async function fetchSquadSnapshot(apiBase, squadId) {
  if(typeof squadId!=='string'||!squadId.trim())throw new Error('squad_id is required');
  const paths=['members','tasks','protect'];
  const responses=await Promise.all(paths.map(async path=>{
    const url=new URL('/api/'+path,apiBase);
    url.searchParams.set('squad_id',squadId);
    const response=await fetch(url,{credentials:'include'});
    if(!response.ok)throw new Error(path+': HTTP '+response.status);
    return response.json();
  }));
  return Object.fromEntries(paths.map((key,index)=>[key,responses[index]]));
}
function rows(payload) {
  if(Array.isArray(payload))return payload;
  if(Array.isArray(payload?.items))return payload.items;
  if(Array.isArray(payload?.data))return payload.data;
  if(Array.isArray(payload?.results))return payload.results;
  return [];
}
export function adaptD1Snapshot(snapshot) {
  const members=rows(snapshot.members);
  const tasks=rows(snapshot.tasks);
  const protect=rows(snapshot.protect);
  const nickById=Object.fromEntries(members.map(m=>[m.id,m.nick]));
  return {
    members:members.map(m=>[m.nick,m.game_role,'','Не ответил',m.id]),
    tasks:tasks.map(t=>({
      id:t.id,title:t.title,need:Number(t.quantity)||0,done:0,
      unit:t.unit||'шт.',place:t.place||'',priority:t.priority||'Обычный',
      deadline:t.deadline||'',owner:nickById[t.assignee_id]||'',
      comment:t.comment||'',status:t.status||'В процессе',
      creator:nickById[t.creator_id]||'',history:[]
    })),
    protectHistory:protect.map(p=>({
      id:p.id,member_id:p.member_id,nick:p.updated_by||nickById[p.member_id]||'—',
      pressedAt:p.updated_at,time:p.effective_at||p.updated_at
    }))
  };
}

// Member-code sessions fetch only their own squad. No Steam identity is needed.
export async function fetchMemberSnapshot(apiBase=location.origin) {
  const response=await fetch(new URL('/api/member/snapshot',apiBase),{credentials:'include'});
  if(!response.ok)throw new Error('member snapshot: HTTP '+response.status);
  return response.json();
}

export function renderReadOnlyD1(snapshot){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const rows=(items,cols)=>'<table style="width:100%;font-size:13px"><tbody>'+items.map(x=>'<tr>'+cols.map(k=>'<td style="padding:7px;border-bottom:1px solid #444">'+esc(typeof k==='function'?k(x):x[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  const part=(title,items,cols)=>'<h3>'+esc(title)+' ('+items.length+')</h3>'+rows(items,cols);
  const members=snapshot.members||[],tasks=snapshot.tasks||[],protect=snapshot.protect||[],markers=snapshot.markers||[],posts=snapshot.posts||[],explosives=snapshot.explosives||[];
  return '<div style="max-height:65vh;overflow:auto"><h2>SCUM HUB · D1</h2><p class="muted">Только просмотр · '+esc(snapshot.member?.nick)+'</p>'+
    part('Состав',members,['nick','game_role'])+
    part('Задачи',tasks,['title','quantity','status'])+
    part('Протект',protect,['updated_by','effective_at'])+
    part('Метки карты',markers,['name','type','x','y'])+
    part('Схроны и базы',posts,['map_marker_name','kind',x=>Array.isArray(x.images)?x.images.length+' фото':'0 фото'])+
    part('Взрывчатка',explosives,['item','quantity'])+'</div>';
}
