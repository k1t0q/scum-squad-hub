import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const css=readFileSync(new URL('fonts/onest.css',root),'utf8');
const html=readFileSync(new URL('index.html',root),'utf8');
const deploy=readFileSync(new URL('.github/workflows/scum-hub-migration-deploy.yml',root),'utf8');

test('Onest is bundled locally with Cyrillic and Latin font subsets',()=>{
 for(const script of ['cyrillic','cyrillic-ext','latin','latin-ext']){
  const filename=`onest-${script}-wght-normal.woff2`;
  assert.ok(css.includes(filename));
  assert.ok(statSync(new URL(`fonts/onest/${filename}`,root)).size>5000);
 }
 assert.match(html,/fonts\/onest\.css\?v=2/);
 assert.match(deploy,/cp -R fonts migration-public\/fonts/);
});

test('Achievements use Onest while the squad logo keeps original typography',()=>{
 assert.match(css,/\.ach-page,\.ach-page \*/);
 assert.match(css,/\.logo i,\.logo>div/);
 assert.match(css,/body,button,input,textarea,select/);
});
