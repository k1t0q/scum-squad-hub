import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function fixture(login){
 const status={textContent:''},button={disabled:false,textContent:'ВОЙТИ В СОСТАВ'},auth={innerHTML:''};let submitted,mounted;
 const form={querySelector:q=>q==='#hubLoginStatus'?status:button};
 const context={isD1HubHost:()=>true,$:()=>auth,window:{scumHubD1CodeLogin:async credentials=>{submitted=credentials;return login(credentials)}},mountOriginalD1Hub:async snapshot=>{mounted=snapshot},toast:()=>{throw Error('Login errors must be visible inside the form')},FormData:class{get(k){return {nick:' Player ',code:' example-code ',role:'Rifler'}[k]}}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function showMemberLogin(){'),source.indexOf('\nfunction showAdminLogin')),context);
 vm.runInContext(source.slice(source.indexOf('async function doJoin(e){'),source.indexOf('\nfunction showK1t0Login')),context);
 return {context,form,status,button,auth,submitted:()=>submitted,mounted:()=>mounted};
}
test('existing member signs in with nickname and code, preserving the stored role',async()=>{
 const snapshot={member:{nick:'Player',game_role:'Helper'}};const f=fixture(async()=>({raw:snapshot}));
 await f.context.doJoin({target:f.form,preventDefault(){}});
 assert.deepEqual(JSON.parse(JSON.stringify(f.submitted())),{nick:'Player',code:'example-code'});
 assert.equal(f.mounted(),snapshot);assert.equal(f.button.disabled,false);
 f.context.showMemberLogin();assert.ok(!f.auth.innerHTML.includes('name="role"'));assert.ok(f.auth.innerHTML.includes('role="alert"'));
});
test('rejected credentials show a readable persistent error and allow another attempt',async()=>{
 let attempts=0;const f=fixture(async()=>{attempts++;throw Error('invalid_credentials')});
 await f.context.doJoin({target:f.form,preventDefault(){}});
 assert.match(f.status.textContent,/Неверный ник или код/);assert.equal(f.button.disabled,false);
 await f.context.doJoin({target:f.form,preventDefault(){}});assert.equal(attempts,2);
});
test('network timeout is explained inside the login form',async()=>{
 const f=fixture(async()=>{throw Object.assign(Error('timed out'),{name:'TimeoutError'})});
 await f.context.doJoin({target:f.form,preventDefault(){}});
 assert.match(f.status.textContent,/Не удалось связаться/);assert.equal(f.button.disabled,false);
});
