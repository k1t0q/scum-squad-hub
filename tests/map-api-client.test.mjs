import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapApiClient} from '../src/map-api-client.mjs';
test('map adapter sends scoped authenticated requests',async()=>{
 const calls=[];
 const client=createMapApiClient({baseUrl:'https://api.example.com',getToken:()=> 'token',getSquadId:()=> 'own',fetcher:async(url,options)=>{
  calls.push({url,options});return {ok:true,json:async()=>({items:[{id:'one'}]})};
 }});
 assert.deepEqual(await client.listMarkers(),[{id:'one'}]);
 assert.deepEqual(await client.listPosts('stash'),[{id:'one'}]);
 assert.equal(calls.length,2);
 for(const call of calls){const url=new URL(call.url);assert.equal(url.searchParams.get('squad_id'),'own');assert.equal(call.options.headers.authorization,'Bearer token');}
 assert.equal(new URL(calls[1].url).searchParams.get('kind'),'stash');
});
test('map adapter does not call API without credentials',async()=>{
 let called=false;
 const client=createMapApiClient({baseUrl:'https://api.example.com',getToken:()=>null,getSquadId:()=> 'own',fetcher:async()=>{called=true;}});
 await assert.rejects(client.listMarkers(),/Authentication required/);
 assert.equal(called,false);
});
test('map adapter refuses non HTTPS endpoints',()=>{
 assert.throws(()=>createMapApiClient({baseUrl:'http://api.example.com',getToken:()=>'',getSquadId:()=>''}),/HTTPS required/);
});
test('map adapter rejects server errors without exposing details',async()=>{
 const client=createMapApiClient({baseUrl:'https://api.example.com',getToken:()=> 'token',getSquadId:()=> 'own',fetcher:async()=>({ok:false,status:403})});
 await assert.rejects(client.listMarkers(),/403/);
});
