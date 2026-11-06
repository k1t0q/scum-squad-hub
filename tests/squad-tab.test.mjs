import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const rosterSource=source.slice(source.indexOf('function members(){'),source.indexOf('function editMemberNick('));

test('merged squad roster has no legacy per-member duty buttons',()=>{
 const view={innerHTML:'',insertAdjacentHTML(_position,html){this.innerHTML+=html}};
 const context={db:{profile:{nick:'k1t0',access:'admin'},members:[['k1t0','Sniper'],['Player','Rifler']]},window:{currentSquadName:'ДУБЛЬ'},$:()=>view,esc:s=>String(s),settingsPage:()=>view.insertAdjacentHTML('beforeend','<section>Discord</section>')};
 vm.createContext(context);vm.runInContext(rosterSource,context);
 context.squadPage();
 assert.match(view.innerHTML,/Состав ДУБЛЬ/);
 assert.match(view.innerHTML,/Изменить ник/);
 assert.match(view.innerHTML,/Выгнать/);
 assert.match(view.innerHTML,/Discord/);
 assert.doesNotMatch(view.innerHTML,/editMemberDuties|>Задачи<|Рейд:|Антирейд:/);
});

test('old roster and settings destinations redirect to one squad tab',()=>{
 assert.match(source,/const pages=\[[^\n]*'Отряд','Достижения'\]/);
 assert.match(source,/if\(page==='Состав'\|\|page==='Настройки'\)page='Отряд'/);
 assert.match(source,/if\(page==='Отряд'\)squadPage\(\)/);
 assert.doesNotMatch(source,/function editMemberDuties\(|function saveMemberDuties\(/);
});

test('Discord settings append below the roster instead of replacing it',()=>{
 const view={innerHTML:'<section>Состав ДУБЛЬ</section>',insertAdjacentHTML(_position,html){this.innerHTML+=html}};
 let checked=false;
 const context={window:{isSecureContext:true},navigator:{},localStorage:{getItem:()=>null},db:{profile:{access:'admin'}},$:()=>view,document:{getElementById:()=>null},sessionStorage:{getItem:()=>null},loadDiscordLinkStatus:()=>{checked=true},loadDiscordAdminList:()=>{}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function settingsPage('),source.indexOf('function startSteamLink(')),context);
 context.settingsPage(true);
 assert.match(view.innerHTML,/Состав ДУБЛЬ/);
 assert.match(view.innerHTML,/Настройки Discord/);
 assert.match(view.innerHTML,/furyDiscordLinkButton/);
 assert.ok(checked);
});
