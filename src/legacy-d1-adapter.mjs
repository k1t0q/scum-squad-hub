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
  const images=posts.flatMap(p=>(Array.isArray(p.images)?p.images:[]).map(src=>({src,post:p.map_marker_name||p.kind}))).filter(x=>{try{const u=new URL(x.src);return u.protocol==='https:'&&u.hostname==='ik.imagekit.io'}catch{return false}}).slice(0,24);
  const gallery='<h3>Фото из ImageKit ('+images.length+')</h3><div style="display:flex;flex-wrap:wrap;gap:8px">'+images.map(x=>'<a href="'+esc(x.src)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(x.src)+'" alt="'+esc(x.post)+'" loading="lazy" style="width:105px;height:80px;object-fit:cover;border-radius:6px"></a>').join('')+'</div>';
  return '<div style="max-height:65vh;overflow:auto"><h2>SCUM HUB · D1</h2><p class="muted">Только просмотр · '+esc(snapshot.member?.nick)+'</p>'+
    part('Состав',members,['nick','game_role'])+
    part('Задачи',tasks,['title','quantity','status'])+
    part('Протект',protect,['updated_by','effective_at'])+
    part('Метки карты',markers,['name','type','x','y'])+
    part('Схроны и базы',posts,['map_marker_name','kind',x=>Array.isArray(x.images)?x.images.length+' фото':'0 фото'])+
    part('Взрывчатка',explosives,['item','quantity'])+gallery+'</div>';
}

export async function updateTaskStatusD1(id,status){
 const r=await fetch('/api/member/tasks/status',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({id,status})});
 if(!r.ok)throw Error('Task update failed: '+r.status);
 return r.json();
}
export async function checkStashD1(id){
 const r=await fetch('/api/member/stashes/check',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({id})});
 if(!r.ok)throw Error('Stash check failed: '+r.status);
 return r.json();
}

export function mountRecoveryPortal(snapshot){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let root=document.getElementById('d1-recovery-portal');
  if(!root){root=document.createElement('div');root.id='d1-recovery-portal';document.body.appendChild(root)}
  root.style.cssText='position:fixed;inset:0;z-index:999999;overflow:auto;background:#0b1015;color:#e6ecec;padding:20px;font:14px Arial,sans-serif';
  const items=(snapshot.markers||[]).map(m=>'<div style="padding:8px;border-bottom:1px solid #26343b"><b>'+esc(m.name||'Метка')+'</b> · '+esc(m.type||'')+' <small>'+esc(m.note||'')+'</small></div>').join('');
  const mapPins=(snapshot.markers||[]).filter(m=>Number.isFinite(Number(m.x))&&Number.isFinite(Number(m.y))).map(m=>'<span title="'+esc(m.name||'Метка')+'" style="position:absolute;left:'+Math.min(100,Math.max(0,Number(m.x)*100))+'%;top:'+Math.min(100,Math.max(0,Number(m.y)*100))+'%;width:9px;height:9px;border-radius:50%;background:#ffbd52;box-shadow:0 0 7px #000"></span>').join('');
  const imageUrls=(snapshot.posts||[]).flatMap(p=>Array.isArray(p.images)?p.images:[]).filter(u=>{try{const x=new URL(u);return x.protocol==='https:'&&['ik.imagekit.io','zicapopwsssopyxphhpo.supabase.co'].includes(x.hostname)}catch{return false}});
  const photoHtml=imageUrls.map(u=>'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(u)+'" loading="lazy" style="width:140px;height:110px;object-fit:cover;border-radius:8px"></a>').join('');
  const sections={
   'Обзор':'<h2>Данные отряда</h2>'+renderReadOnlyD1(snapshot),
   'Карта':'<h2>Карта меток ('+(snapshot.markers||[]).length+')</h2><p>Координаты меток сохранены. Для игровой подложки открой <a style="color:#8ecbff" target="_blank" href="https://k1t0q.github.io/scum-map-k1t0/">SCUM MAP k1t0</a>.</p><div style="max-width:720px;aspect-ratio:1;position:relative;background:repeating-linear-gradient(0deg,#18242a,#18242a 12.3%,#35444a 12.5%),repeating-linear-gradient(90deg,transparent,transparent 12.3%,#35444a 12.5%);border:1px solid #52636a">'+mapPins+'</div>'+items,
   'Задачи':'<h2>Задачи</h2>'+(snapshot.tasks||[]).map(t=>'<div style="padding:12px;border-bottom:1px solid #26343b"><b>'+esc(t.title)+'</b> · '+esc(t.quantity)+' '+esc(t.unit)+' · '+esc(t.status)+' <button data-task="'+esc(t.id)+'" data-status="'+(t.status==='Выполнено'?'В процессе':'Выполнено')+'">Сменить статус</button></div>').join(''),
   'Схроны':'<h2>Схроны и базы</h2>'+(snapshot.posts||[]).map(p=>'<div style="padding:12px;border-bottom:1px solid #26343b"><b>'+esc(p.map_marker_name||p.kind)+'</b> · '+esc(p.kind)+' · '+esc(p.stash_checked_at||'нет проверки')+(p.kind==='stash'?'<button data-stash="'+esc(p.id)+'">Проверил схрон</button>':'')+'</div>').join('')+'<h3>Фотографии ('+imageUrls.length+')</h3><div style="display:flex;flex-wrap:wrap;gap:8px">'+photoHtml+'</div>',
   'Взрыв': '<h2>Взрывчатка</h2>'+(snapshot.explosives||[]).map(x=>'<p>'+esc(x.item)+': '+esc(x.quantity)+'</p>').join(''),
   'Состав':'<h2>Участники</h2>'+(snapshot.members||[]).map(m=>'<p>'+esc(m.nick)+' · '+esc(m.game_role)+'</p>').join('')
  };
  const nav=Object.keys(sections).map((name,i)=>'<button data-section="'+esc(name)+'" style="padding:10px;background:#23323b;color:white;border:1px solid #3b4a52;border-radius:8px">'+esc(name)+'</button>').join('');
  root.innerHTML='<header style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between"><h1 style="font-size:21px">SCUM HUB · Cloudflare D1</h1><div><button id="d1-refresh">Обновить</button> <button id="d1-logout">Выйти</button></div></header><p style="color:#a7b9c2">Восстановленный доступ · '+esc(snapshot.member?.nick)+' · данные из резервной копии D1</p><nav style="display:flex;flex-wrap:wrap;gap:8px;margin:15px 0">'+nav+'</nav><main id="d1-recovery-body"></main>';
  const body=root.querySelector('#d1-recovery-body');
  const show=name=>{body.innerHTML=sections[name]||sections['Обзор'];root.querySelectorAll('[data-section]').forEach(b=>b.style.background=b.dataset.section===name?'#356e75':'#23323b')};
  root.querySelectorAll('[data-section]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.section)));
  body.addEventListener('click',async e=>{
    const task=e.target.closest('[data-task]'),stash=e.target.closest('[data-stash]');
    if(!task&&!stash)return;
    e.target.disabled=true;
    try{
      if(task)await updateTaskStatusD1(Number(task.dataset.task),task.dataset.status);
      if(stash)await checkStashD1(Number(stash.dataset.stash));
      const section=task?'Задачи':'Схроны';
      mountRecoveryPortal(await fetchMemberSnapshot());
      document.querySelector('#d1-recovery-portal [data-section="'+section+'"]')?.click();
    }catch(err){alert(err.message)}finally{e.target.disabled=false}
  });
  root.querySelector('#d1-refresh').onclick=async()=>mountRecoveryPortal(await fetchMemberSnapshot());
  root.querySelector('#d1-logout').onclick=async()=>{await window.scumHubD1CodeLogout();root.remove();document.documentElement.classList.add('auth-lock');window.authScreen()};
  show('Обзор');
}
