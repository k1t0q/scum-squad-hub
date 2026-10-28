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
