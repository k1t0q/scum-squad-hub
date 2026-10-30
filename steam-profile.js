const $=id=>document.getElementById(id);
async function loadProfile(){
 try{
  const response=await fetch('/api/steam/profile',{credentials:'same-origin',cache:'no-store'});
  if(response.status===401){location.replace('/auth/steam/start');return}
  if(!response.ok)throw Error('profile_unavailable');
  const data=await response.json();
  $('steamId').textContent=data.steam_id;
  $('nick').textContent=data.member?.nick||'Профиль Steam';
  $('squad').textContent=data.squad?.name||'Не привязан';
  $('role').textContent=data.member?(data.member.access_role==='admin'?'Администратор · ':'')+data.member.game_role:'—';
  $('explanation').textContent=data.member?'Ты вошёл через Steam. Открой штаб, чтобы перейти к своему отряду.':'Ты вошёл через Steam. Этот аккаунт пока не привязан к отряду. Войди по коду своего отряда или обратись в Discord: k1t0q.';
  $('enterHub').hidden=!data.member;$('codeLogin').hidden=!!data.member;
  $('status').hidden=true;$('profile').hidden=false;
 }catch{$('status').textContent='Не удалось загрузить профиль. Обнови страницу, чтобы повторить.'}
}
$('logout').onclick=async()=>{
 $('logout').disabled=true;
 try{const r=await fetch('/api/steam/logout',{method:'POST',credentials:'same-origin'});if(!r.ok)throw Error();location.replace('/landing-preview.html')}catch{$('logout').disabled=false;$('status').hidden=false;$('status').textContent='Не удалось выйти. Попробуй ещё раз.'}
};
loadProfile();
