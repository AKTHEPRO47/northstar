const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
globalThis.crypto=require('node:crypto').webcrypto;
require('../web/vault.js');const C=globalThis.NorthstarCrypto;
test('same key on another device decrypts; wrong keys and tampering fail',async()=>{
 const secret=C.generateKey(),a=await C.credentials(secret),b=await C.credentials(secret),other=await C.credentials(C.generateKey());
 assert.match(secret,/^ns1_[\w-]{43}$/);assert.equal(a.id,b.id);assert.equal(a.token,b.token);assert.notEqual(a.id,a.token);
 const state={items:[{name:'Synthetic asset',amount:1234}],history:[],large:'x'.repeat(200000)};
 const envelope=await C.encrypt(a.key,state);assert(!JSON.stringify(envelope).includes('Synthetic asset'));
 assert.deepEqual(await C.decrypt(b.key,envelope),state);await assert.rejects(C.decrypt(other.key,envelope));
 await assert.rejects(C.decrypt(a.key,{...envelope,data:(envelope.data[0]==='A'?'B':'A')+envelope.data.slice(1)}));
 assert.notEqual((await C.encrypt(a.key,state)).iv,envelope.iv);await assert.rejects(C.credentials('short'));
});
test('API checks authorization and prevents concurrent overwrites',async()=>{
 const code=fs.readFileSync(__dirname+'/../functions/api/vault/[[id]].js','utf8');
 const {onRequest}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const rows=new Map();const env={DB:{prepare(sql){return {bind(...args){return {
 async first(){const row=rows.get(args[0]);return row?.auth_hash===args[1]?row:null;},
 async run(){if(sql.startsWith('INSERT')){if(rows.has(args[0]))return {meta:{changes:0}};rows.set(args[0],{auth_hash:args[1],ciphertext:args[2],version:1});return {meta:{changes:1}};}
 const row=rows.get(args[1]);if(!row||row.auth_hash!==args[2]||row.version!==args[3])return {meta:{changes:0}};row.ciphertext=args[0];row.version++;return {meta:{changes:1}};}
 };}};}}};
 const a=await C.credentials(C.generateKey()),body=await C.encrypt(a.key,{items:[]});
 const call=(method,token=a.token,revision,payload=body)=>{const headers={};if(token)headers.Authorization='Bearer '+token;if(revision!==undefined)headers['If-Match']=String(revision);return onRequest({env,params:{id:[a.id]},request:new Request('https://example.com/api/vault/'+a.id,{method,headers,body:method==='GET'?undefined:JSON.stringify(payload)})});};
 assert.equal((await call('GET',null)).status,401);assert.equal((await call('POST')).status,201);assert.equal((await call('POST')).status,409);
 assert.equal((await call('GET','x'.repeat(43))).status,404);assert.equal((await call('PUT','x'.repeat(43),1)).status,404);
 assert.deepEqual((await (await call('GET')).json()).envelope,body);
 assert.equal((await call('PUT',a.token,1)).status,200);assert.equal((await call('PUT',a.token,1)).status,409);
 assert.equal((await call('PUT',a.token)).status,428);assert.equal((await call('PUT',a.token,2,{amount:100})).status,400);
 assert.notEqual(rows.get(a.id).auth_hash,a.token);
 assert.equal((await onRequest({env:{},params:{id:[a.id]},request:new Request('https://example.com/api/vault/'+a.id)})).status,503);
});
test('tracker begins empty and saves assets and debts through account adapter',()=>{
 const elements=new Map(),events={},saves=[];
 const element=id=>{if(!elements.has(id)){const handlers={};elements.set(id,{value:'',style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(n,f){handlers[n]=f;},fire(n){handlers[n]?.({preventDefault(){}});}});}return elements.get(id);};
 const window={addEventListener(n,f){events[n]=f;},scrollTo(){},NorthstarAccount:{state:null,save:async s=>saves.push(JSON.parse(JSON.stringify(s)))}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../web/app.js','utf8'),{window,document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){}},navigator:{},location:{protocol:'https:'},console,setTimeout(){},clearTimeout(){}});
 assert.equal(saves.length,0);events['northstar-unlocked']();assert.equal(saves[0].items.length,0);
 element('entry-name').value='Synthetic asset';element('entry-amount').value='1000';element('entry-currency').value='SGD';element('entry-kind').value='asset';element('entry-form').fire('submit');
 assert.equal(element('net-worth').textContent,'S$1,000.00');element('entry-name').value='Synthetic debt';element('entry-amount').value='200';element('entry-kind').value='debt';element('entry-form').fire('submit');assert.equal(element('net-worth').textContent,'S$800.00');
});
