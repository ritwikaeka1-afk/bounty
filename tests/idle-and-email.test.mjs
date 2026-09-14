import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(file) {
  const {outputText}=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {createIdleClock,IDLE_MS,WARNING_MS}=await load('lib/idle-clock.ts');
const {emailContent,deliverEmail}=await load('lib/notification-email.ts');
test('activity in either tab extends the shared deadline, but a reload does not',()=>{
 let now=1000;const map=new Map();const store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const first=createIdleClock('session',store,()=>now);
 now+=IDLE_MS-WARNING_MS;assert.equal(first.remaining(),WARNING_MS);
 const second=createIdleClock('session',store,()=>now);
 assert.equal(second.remaining(),WARNING_MS);
 assert.equal(second.activity(),true);assert.equal(first.remaining(),IDLE_MS);
 now+=IDLE_MS+1;
 assert.equal(first.remaining(),0);assert.equal(first.activity(),false);
 assert.equal(second.remaining(),0);
 assert.equal(createIdleClock('session',store,()=>now).remaining(),0);
 assert.equal(createIdleClock('new-session',store,()=>now).remaining(),IDLE_MS);
});
test('expiry wins over stale writes and broadcast activity works without local storage',()=>{
 let now=1000;const map=new Map();const store={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const first=createIdleClock('session',store,()=>now),second=createIdleClock('session',store,()=>now);
 first.expire();map.set('session:activity',String(now+1));now++;
 assert.equal(second.activity(),false);
 const unavailable={getItem(){throw Error('Unavailable');},setItem(){throw Error('Unavailable');}};
 const fallback=createIdleClock('other',unavailable,()=>now);now+=IDLE_MS-100;
 fallback.receive(now);assert.equal(fallback.remaining(),IDLE_MS);
 fallback.receive(now+99999999);now+=101;assert.equal(fallback.remaining(),IDLE_MS-101);
});
test('email content uses secure links and generic previews',()=>{
 const body=emailContent('application_message','https://joinbounty.me','task-id');
 assert.match(body.text,/https:\/\/joinbounty.me\/\?view=detail&id=task-id/);
 assert.match(body.text,/view=inbox/);
 assert.equal(body.subject,'New message on Bounty');
 assert.throws(()=>emailContent('message','http://example.com',null));
});
test('email worker rechecks consent, uses idempotency, and records provider acceptance only',async()=>{
 const prior={key:process.env.RESEND_API_KEY,from:process.env.NOTIFICATION_EMAIL_FROM,site:process.env.NEXT_PUBLIC_SITE_URL,fetch:globalThis.fetch};
 process.env.RESEND_API_KEY='test-only';process.env.NOTIFICATION_EMAIL_FROM='Bounty <test@example.com>';process.env.NEXT_PUBLIC_SITE_URL='https://joinbounty.me';
 const writes=[];let requests=0;
 const jobs=[{notification_id:'allowed',profile_id:'user',kind:'message',email:'test@example.com',bounty_id:'task'},{notification_id:'opted-out',kind:'message',email:'other@example.com',bounty_id:'task'}];
 const db={rpc:async(name,args)=>({data:name==='claim_email_deliveries'?jobs:args.p_notification==='allowed',error:null}),from:()=>({update:values=>({eq:async(_,id)=>{writes.push({id,...values});return {error:null};}})})};
 globalThis.fetch=async(url,options)=>{
   requests++;assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],'bounty-notification/allowed');
   assert.deepEqual(JSON.parse(options.body).to,['test@example.com']);return new Response(JSON.stringify({id:'provider-id'}),{status:200});
 };
 try {
   const result=await deliverEmail(db);assert.equal(result.accepted,1);assert.equal(requests,1);
   assert.ok(writes.some(x=>x.provider_id==='provider-id'&&x.accepted_at));assert.ok(writes.some(x=>x.id==='opted-out'&&x.skipped_at));
   globalThis.fetch=async()=>new Response('{}',{status:429});
   const failed=await deliverEmail({...db,rpc:async(name)=>({data:name==='claim_email_deliveries'?[jobs[0]]:true,error:null})});
   assert.equal(failed.failed,1);assert.ok(writes.some(x=>x.last_error==='Email provider returned 429'));
 } finally {
   globalThis.fetch=prior.fetch;
   for(const [name,value] of [['RESEND_API_KEY',prior.key],['NOTIFICATION_EMAIL_FROM',prior.from],['NEXT_PUBLIC_SITE_URL',prior.site]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
});
