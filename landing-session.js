(async()=>{
 try{
  const r=await fetch('/api/steam/profile',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)return;
  const profile=await r.json();
  for(const link of document.querySelectorAll('a[href="/auth/steam/start"]')){
   link.href='/steam-profile.html';link.textContent=profile.member?.nick?'ПРОФИЛЬ · '+profile.member.nick:'МОЙ ПРОФИЛЬ ↗';
  }
  const notice=document.getElementById('steam');
  if(notice)notice.textContent='Steam подтверждён. '+(profile.member?'Твой отряд: '+(profile.squad?.name||'SCUM HUB')+'. Открой профиль, чтобы перейти в штаб.':'Открой профиль игрока.');
 }catch{}
})();