import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const rosterSource=source.slice(source.indexOf('function members(){'),source.indexOf('function editMemberNick('));

test('merged squad roster has no legacy per-member duty buttons',()=>{
 const view={innerHTML:'',insertAdjacentHTML(_position,html){this.innerHTML+=html}};
 const context={db:{profile:{nick:'k1t0',access:'admin'},members:[['k1t0','Sniper'],['Player','Rifler']]},window:{currentSquadName:'ДУБЛЬ'},$:()=>view,esc:s=>String(s)};
 vm.createContext(context);vm.runInContext(rosterSource,context);
 context.squadPage();
 assert.match(view.innerHTML,/Состав ДУБЛЬ/);
 assert.match(view.innerHTML,/Изменить ник/);
 assert.match(view.innerHTML,/Выгнать/);
 assert.doesNotMatch(view.innerHTML,/Discord|Настройки/);
 assert.doesNotMatch(view.innerHTML,/editMemberDuties|>Задачи<|Рейд:|Антирейд:/);
});

test('old roster and settings destinations redirect to one squad tab',()=>{
 assert.match(source,/const pages=\[[^\n]*'Отряд','Достижения'\]/);
 assert.match(source,/if\(page==='Состав'\|\|page==='Настройки'\)page='Отряд'/);
 assert.match(source,/if\(page==='Отряд'\)squadPage\(\)/);
 assert.doesNotMatch(source,/function editMemberDuties\(|function saveMemberDuties\(/);
});

test('Discord linking and member management are moved entirely into the profile',()=>{
 assert.match(source,/function editProfile\(\)[^\n]*furyDiscordLinkButton[^\n]*furyDiscordAdminList/);
 assert.match(source,/function editProfile\(\)[^\n]*loadDiscordLinkStatus\(\)/);
 assert.match(source,/function editProfile\(\)[^\n]*loadDiscordAdminList\(\)/);
 assert.match(source,/document\.getElementById\('profileDiscordCode'\)/);
 assert.doesNotMatch(source,/function settingsPage\(/);
 assert.match(source,/function squadPage\(\)\{members\(\)\}/);
});

test('Onest font files resolve and achievements use Onest, except squad logo',()=>{
 const css=readFileSync(new URL('../fonts/onest.css',import.meta.url),'utf8');
 assert.match(css,/url\('\.\/onest\/onest-cyrillic-wght-normal\.woff2'\)/);
 assert.match(css,/\.ach-page \*/);
 assert.match(css,/\.logo i,\.logo>div/);
 assert.doesNotMatch(css,/\.ach-page[^\n]*\{font-family:Inter/);
});
