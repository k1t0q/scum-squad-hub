(async()=>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8000);
 try{
  const r=await fetch('/api/steam/profile',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
  if(!r.ok)return;
  const profile=await r.json();
  for(const link of document.querySelectorAll('[data-steam-entry]')){
   link.href='/steam-profile.html';link.textContent=profile.member?.nick?'ПРОФИЛЬ · '+profile.member.nick:'МОЙ ПРОФИЛЬ ↗';
  }
  const notice=document.getElementById('steam');
  if(notice)notice.textContent='Steam подтверждён. '+(profile.member?'Твой отряд: '+(profile.squad?.name||'SCUM HUB')+'. Открой профиль, чтобы перейти в штаб.':'Открой профиль игрока.');
 }catch{}
 finally{clearTimeout(timer);for(const link of document.querySelectorAll('[data-steam-entry]'))link.style.removeProperty('visibility');document.documentElement.classList.remove('steam-session-pending')}
})();