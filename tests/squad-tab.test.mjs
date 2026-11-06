import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const rosterSource=source.slice(source.indexOf('function members(){'),source.indexOf('function editMemberNick('));

test('merged squad roster has no legacy per-member duty buttons',()=>{
 const view={innerHTML:'',insertAdjacentHTML(_position,html){this.innerHTML+=html}};
 const context={db:{profile:{nick:'k1t0',access:'admin'},members:[['k1t0','Sniper'],['Player','Rifler']]},window:{currentSquadName:'ДУБЛЬ'},$:()=>view,esc:s=>String(s),loadSquadDiscordStatuses:()=>{}};
 vm.createContext(context);vm.runInContext(rosterSource,context);
 context.squadPage();
 assert.match(view.innerHTML,/<h2>Отряд<\/h2>/);
 assert.match(view.innerHTML,/Изменить ник/);
 assert.match(view.innerHTML,/Выгнать/);
 assert.match(view.innerHTML,/Discord: проверяем/);
 assert.doesNotMatch(view.innerHTML,/editMemberDuties|>Задачи<|Рейд:|Антирейд:/);
});

test('old roster and settings destinations redirect to one squad tab',()=>{
 assert.match(source,/const pages=\[[^\n]*'Отряд','Достижения'\]/);
 assert.match(source,/if\(page==='Состав'\|\|page==='Настройки'\)page='Отряд'/);
 assert.match(source,/if\(page==='Отряд'\)squadPage\(\)/);
 assert.doesNotMatch(source,/function editMemberDuties\(|function saveMemberDuties\(/);
});

test('profile only manages its own Discord; squad manages member Discord links',()=>{
 assert.match(source,/function editProfile\(\)[^\n]*furyDiscordLinkButton/);
 assert.doesNotMatch(source,/function editProfile\(\)[^\n]*furyDiscordAdminList/);
 assert.match(source,/function editProfile\(\)[^\n]*loadDiscordLinkStatus\(\)/);
 assert.match(source,/async function loadSquadDiscordStatuses\(\)/);
 assert.match(source,/adminRevokeMemberChannel/);
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

test('squad name column overrides the legacy last-child right alignment',()=>{
 const css=readFileSync(new URL('../overrides.css',import.meta.url),'utf8');
 assert.match(css,/\.itemtop>div\.hub-squad-member-info:last-child/);
 assert.match(css,/\.itemtop>div\.member-actions-row:last-child\{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important/);
 assert.match(css,/align-items:flex-start!important;justify-content:center!important/);
});

test('achievement hover restores the original cursor tilt without lifting the card',()=>{
 const css=readFileSync(new URL('../achievements.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../achievements.js',import.meta.url),'utf8');
 assert.match(css,/\.ach-flip-front\{[^\n]*rotateX\(var\(--rx,0deg\)\) rotateY\(var\(--ry,0deg\)\)/);
 assert.doesNotMatch(css,/\.ach-flip:not\(\.is-flipped\):hover\{transform:translateY/);
 assert.match(js,/front\.onpointermove=e=>/);
 assert.match(js,/\(0\.5-y\)\*20\+'deg'/);
 assert.match(js,/front\.onpointerleave=\(\)=>/);
});
