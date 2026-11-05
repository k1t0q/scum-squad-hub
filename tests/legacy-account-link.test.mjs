import test from 'node:test';
import assert from 'node:assert/strict';
import {linkLegacyAccount} from '../src/legacy-account-link.mjs';
test('retired account linking never contacts external auth or writes D1',async()=>{
 const env=new Proxy({},{get(){throw Error('Retired linking must not access bindings')}});
 const response=await linkLegacyAccount(new Request('https://example.com/api/link-legacy-account',{method:'POST'}),env,'76561198000000000',{});
 assert.equal(response.status,410);
 assert.equal((await response.json()).error,'legacy_link_retired');
});
