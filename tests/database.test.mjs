import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
const db=new PGlite();
const owner=randomUUID(),helper=randomUUID(),other=randomUUID();let template;
async function as(id,sql,args=[]){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id}';`);return db.query(sql,args);}
async function admin(sql,args=[]){await db.exec('reset role');return db.query(sql,args);}
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
async function create(reward=37){return (await as(owner,"select create_bounty_v2($1,'Review my resume','Review this resume and explain three concrete improvements',$2,'Three written suggestions',30,'remote',null,null,null,$3) as id",[template,reward,randomUUID()])).rows[0].id;}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
 for(const name of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort()){
   try{await db.exec(await readFile(`supabase/migrations/${name}`,'utf8'));}catch(e){throw new Error(`${name}: ${e.message}`,{cause:e});}
 }
 template=(await one('select id from bounty_templates limit 1')).id;
 for(const [id,name] of [[owner,'Owner'],[helper,'Helper'],[other,'Other']]){
 await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",[id,`${name.toLowerCase()}@ucla.edu`,JSON.stringify({display_name:name,first_name:name,last_name:"O’Neil"})]);
 await db.query("update profiles set verification_status='verified' where id=$1",[id]);
 await db.query("update credit_accounts set available_balance=500 where profile_id=$1",[id]);
 }
});
after(()=>db.close());
test('beta enrollment requires confirmed email, is reversible, and preserves student accounts',async()=>{
 await admin('select set_beta_access(false)');
 const tester=randomUUID(),unconfirmed=randomUUID();
 await admin("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'tester@example.com',now(),'{\"display_name\":\"Tester\"}')",[tester]);
 await admin("insert into auth.users(id,email,raw_user_meta_data) values($1,'unconfirmed@example.com','{\"email_verified\":true}')",[unconfirmed]);
 assert.equal((await as(tester,'select enroll_beta_tester() as enrolled')).rows[0].enrolled,false);
 await assert.rejects(()=>as(tester,'select set_beta_access(true)'));
 await assert.rejects(()=>as(tester,'update beta_access_settings set enabled=true'));
 await admin('select set_beta_access(true)');
 await assert.rejects(()=>as(unconfirmed,'select enroll_beta_tester()'));
 assert.equal((await as(tester,'select enroll_beta_tester() as enrolled')).rows[0].enrolled,true);
 await as(tester,'select enroll_beta_tester()');
 assert.equal((await as(tester,'select count(*)::int as count from credit_accounts')).rows[0].count,1);
 assert.equal((await as(tester,'select available_balance from credit_accounts')).rows[0].available_balance,0);
 assert.equal((await as(tester,'select verification_status,beta_access_granted from profiles')).rows[0].beta_access_granted,true);
 const betaTask=await create();
 assert.equal((await as(tester,'select id from bounties where id=$1',[betaTask])).rows.length,1);
 await as(tester,"select submit_proposal($1,'I can help test this bounty')",[betaTask]);
 await admin('select set_beta_access(false)');
 assert.equal((await as(tester,'select id from bounties where id=$1',[betaTask])).rows.length,0);
 await assert.rejects(()=>as(tester,"select submit_proposal($1,'I can help test this bounty')",[betaTask]));
 assert.equal((await as(owner,'select verification_status from profiles')).rows[0].verification_status,'verified');
 await admin('select set_beta_access(true)');
 await as(tester,'select enroll_beta_tester()');
 await admin("update profiles set verification_status='rejected' where id=$1",[tester]);
 assert.equal((await as(tester,'select enroll_beta_tester() as enrolled')).rows[0].enrolled,false);
 await admin('select set_beta_access(false)');
});
test('names are private and legacy display names remain intact',async()=>{
 const names=(await as(owner,'select * from profile_names')).rows;assert.equal(names.length,1);assert.equal(names[0].last_name,'O’Neil');
 await as(owner,"select save_my_names('李','')");assert.equal((await one('select display_name from profiles')).display_name,'Owner');
});
test('custom rewards persist; invalid, overspending and anonymous requests fail',async()=>{
 const id=await create(37);assert.equal((await as(owner,'select reward_credits from bounties where id=$1',[id])).rows[0].reward_credits,37);
 for(const amount of [0,-1,100001,501])await assert.rejects(()=>create(amount));
 await assert.rejects(()=>as(owner,"select create_bounty_v2($1,'Review title','Description with more than twenty characters',37.5,'Done',30,'remote',null,null,null,$2)",[template,randomUUID()]));
 await db.exec('set role anon');await assert.rejects(()=>db.query("select create_bounty_v2($1,'Review title','Description with more than twenty characters',37,'Done',30,'remote',null,null,null,$2)",[template,randomUUID()]));
});
test('creation retry is idempotent',async()=>{
 const key=randomUUID();const args=[template,key];const sql="select create_bounty_v2($1,'Resume review','Description with more than twenty characters',37,'Done',30,'remote',null,null,null,$2) as id";
 const a=(await as(owner,sql,args)).rows[0].id,b=(await as(owner,sql,args)).rows[0].id;assert.equal(a,b);
});
test('meeting details are inaccessible through broad queries and the participant RPC',async()=>{
 const id=await create();await admin("update bounties set location_address='Private meeting note' where id=$1",[id]);
 await assert.rejects(()=>as(helper,'select location_address from bounties where id=$1',[id]));
 assert.equal((await as(helper,'select get_meeting_details($1) as place',[id])).rows[0].place,null);
 assert.equal((await as(owner,'select get_meeting_details($1) as place',[id])).rows[0].place,'Private meeting note');
});
test('edited offers require renewed agreement; acceptance and payout reserve and release once',async()=>{
 const id=await create(37);const offer=(await as(helper,"select submit_proposal($1,'I can help tomorrow afternoon') as id",[id])).rows[0].id;
 await as(owner,"select edit_bounty($1,1,'Edited resume review','Please review this resume and give three suggestions',85,'Three suggestions',30,null)",[id]);
 await assert.rejects(()=>as(owner,'select accept_proposal($1,$2)',[offer,randomUUID()]));
 await as(helper,"select submit_proposal($1,'I agree with the updated scope')",[id]);
 const beforeOwner=(await as(owner,'select available_balance from credit_accounts')).rows[0].available_balance;
 const beforeHelper=(await as(helper,'select available_balance from credit_accounts')).rows[0].available_balance;
 const key=randomUUID();await as(owner,'select accept_proposal($1,$2)',[offer,key]);await as(owner,'select accept_proposal($1,$2)',[offer,key]);
 assert.equal((await one('select available_balance from credit_accounts')).available_balance,beforeOwner-85);
 await assert.rejects(()=>as(other,'select accept_proposal($1,$2)',[offer,randomUUID()]));
 await assert.rejects(()=>as(owner,"select edit_bounty($1,2,'Changed scope title','Description with more than twenty characters',1,'Done',30,null)",[id]));
 await as(helper,'select submit_bounty($1)',[id]);const completeKey=randomUUID();await as(owner,'select complete_bounty($1,$2)',[id,completeKey]);await as(owner,'select complete_bounty($1,$2)',[id,completeKey]);
 assert.equal((await as(helper,'select available_balance from credit_accounts')).rows[0].available_balance,beforeHelper+85);
 await assert.rejects(()=>as(owner,'select complete_bounty($1,$2)',[id,randomUUID()]));
 const sums=(await admin("select transaction_id,sum(amount)::int as balance from ledger_entries group by transaction_id")).rows;assert.ok(sums.every(t=>t.balance===0));
});
test('reminders are durable, deduplicated, snoozable and respect preferences',async()=>{
 const id=await create();await admin("update bounties set updated_at=now()-interval '25 hours' where id=$1",[id]);
 await as(owner,"insert into notification_preferences(profile_id,quiet_start,quiet_end) values($1,0,0) on conflict(profile_id) do update set quiet_start=0,quiet_end=0",[owner]);
 await admin('select generate_bounty_reminders()');await admin('select generate_bounty_reminders()');
 assert.equal(Number((await one("select count(*) from notifications where bounty_id=$1 and kind='reminder'",[id])).count),1);
 await as(owner,"select manage_bounty($1,'snooze')",[id]);await admin("update notifications set created_at=now()-interval '2 days' where bounty_id=$1",[id]);await admin("update bounties set updated_at=now()-interval '4 days' where id=$1",[id]);await admin('select generate_bounty_reminders()');
 assert.equal(Number((await one("select count(*) from notifications where bounty_id=$1 and kind='reminder'",[id])).count),1);
 await admin("update bounties set reminders_snoozed_until=null where id=$1",[id]);await as(owner,"update notification_preferences set reminders_enabled=false where profile_id=$1",[owner]);await admin('select generate_bounty_reminders()');
 assert.equal(Number((await one("select count(*) from notifications where bounty_id=$1 and kind='reminder'",[id])).count),1);
 await as(owner,"select manage_bounty($1,'cancel')",[id]);await admin('select generate_bounty_reminders()');assert.equal((await one('select status from bounties where id=$1',[id])).status,'cancelled');
});
test('worker RPCs cannot be called by students and notification ownership is enforced',async()=>{
 await assert.rejects(()=>as(owner,'select generate_bounty_reminders()'));
 await assert.rejects(()=>as(owner,'select * from claim_push_deliveries()'));
 await assert.rejects(()=>as(owner,"update notifications set message='forged'"));
 const result=await as(other,'select * from notifications where profile_id=$1',[owner]);assert.equal(result.rows.length,0);
});
test('push queue claims once, suppresses opted-out recipients and rejects arbitrary endpoints',async()=>{
 await as(owner,"update notification_preferences set push_enabled=true,reminders_enabled=true where profile_id=$1",[owner]);
 await assert.rejects(()=>as(owner,"insert into push_subscriptions(profile_id,endpoint,p256dh,auth) values($1,'https://localhost/private','key','auth')",[owner]));
 await as(owner,"insert into push_subscriptions(profile_id,endpoint,p256dh,auth,created_at) values($1,'https://fcm.googleapis.com/test','key','auth',now()-interval '1 hour')",[owner]);
 await admin("insert into notifications(profile_id,kind,message,dedupe_key) values($1,'message','A new message','push-test')",[owner]);
 const first=(await admin('select * from claim_push_deliveries()')).rows;assert.ok(first.length>0);
 assert.equal((await admin('select * from claim_push_deliveries()')).rows.length,0);
 await admin("update push_deliveries set next_attempt_at=now()-interval '1 hour'");await as(owner,"update notification_preferences set push_enabled=false where profile_id=$1",[owner]);
 assert.equal((await admin('select * from claim_push_deliveries()')).rows.length,0);
});
test('assigned scope changes require helper agreement; reward delta is reserved exactly once',async()=>{
 const id=await create(37);const offer=(await as(helper,"select submit_proposal($1,'I can do this task tomorrow') as id",[id])).rows[0].id;
 await as(owner,'select accept_proposal($1,$2)',[offer,randomUUID()]);
 await assert.rejects(()=>as(owner,"select propose_bounty_change($1,'Updated scope with enough detail','Clear completion',1)",[id]));
 await as(owner,"select propose_bounty_change($1,'Updated scope with enough detail','Clear completion',57)",[id]);
 const change=(await one("select id from bounty_changes where bounty_id=$1 and status='pending'",[id])).id;
 assert.equal((await one('select reward_credits from bounties where id=$1',[id])).reward_credits,37);
 await assert.rejects(()=>as(owner,'select respond_bounty_change($1,true,$2)',[change,randomUUID()]));
 const balanceBefore=(await as(owner,'select available_balance from credit_accounts')).rows[0].available_balance;
 const key=randomUUID();await as(helper,'select respond_bounty_change($1,true,$2)',[change,key]);await as(helper,'select respond_bounty_change($1,true,$2)',[change,key]);
 assert.equal((await as(owner,'select available_balance from credit_accounts')).rows[0].available_balance,balanceBefore-20);
 assert.equal((await one('select reward_credits from bounties where id=$1',[id])).reward_credits,57);
 await as(helper,'select submit_bounty($1)',[id]);await as(owner,'select complete_bounty($1,$2)',[id,randomUUID()]);
 const bonusKey=randomUUID();await as(owner,'select bonus_bounty($1,11,$2)',[id,bonusKey]);await as(owner,'select bonus_bounty($1,11,$2)',[id,bonusKey]);
 assert.equal((await one('select available_balance from credit_accounts')).available_balance,balanceBefore-31);
 assert.equal((await one('select reward_credits from bounties where id=$1',[id])).reward_credits,57);
});
test('only completed participants can rate; public reputation returns initials and real averages',async()=>{
 const id=await create(37);await assert.rejects(()=>as(helper,"insert into bounty_reviews(bounty_id,reviewer_id,rating,body) values($1,$2,5,'Great help')",[id,helper]));
 const offer=(await as(helper,"select submit_proposal($1,'I can help with this task') as id",[id])).rows[0].id;
 await as(owner,'select accept_proposal($1,$2)',[offer,randomUUID()]);await as(helper,'select submit_bounty($1)',[id]);await as(owner,'select complete_bounty($1,$2)',[id,randomUUID()]);
 await assert.rejects(()=>as(other,"insert into bounty_reviews(bounty_id,reviewer_id,rating,body) values($1,$2,5,'A fake review')",[id,other]));
 await as(owner,"insert into bounty_reviews(bounty_id,reviewer_id,rating,body) values($1,$2,5,'Clear and helpful')",[id,owner]);
 await assert.rejects(()=>as(owner,"insert into bounty_reviews(bounty_id,reviewer_id,rating,body) values($1,$2,1,'Duplicate review')",[id,owner]));
 const peers=(await as(owner,'select * from get_task_people($1)',[id])).rows;
 const rated=peers.find(p=>p.id===helper);assert.equal(rated.display_name,'H');assert.equal(Number(rated.rating),5);assert.equal(Number(rated.review_count),1);
 assert.equal((await as(owner,'select * from get_marketplace_reputation()')).rows.find(p=>p.id===other).rating,null);
});
test('application chat is private; poster chooses applicant; blocking stops new messages',async()=>{
 const id=await create(37);const offer=(await as(helper,"select submit_proposal($1,'Available tomorrow at 3pm') as id",[id])).rows[0].id;
 await as(helper,"insert into application_messages(proposal_id,sender_id,body) values($1,$2,'What time works for you?')",[offer,helper]);
 assert.equal((await as(owner,'select * from application_messages where proposal_id=$1',[offer])).rows.length,1);
 assert.equal((await as(other,'select * from application_messages where proposal_id=$1',[offer])).rows.length,0);
 await assert.rejects(()=>as(other,"insert into application_messages(proposal_id,sender_id,body) values($1,$2,'Intrusion')",[offer,other]));
 await assert.rejects(()=>as(helper,'select accept_proposal($1,$2)',[offer,randomUUID()]));
 await as(owner,'insert into profile_blocks(blocker_id,blocked_id) values($1,$2)',[owner,helper]);
 await assert.rejects(()=>as(helper,"insert into application_messages(proposal_id,sender_id,body) values($1,$2,'Blocked message')",[offer,helper]));
 await as(owner,'delete from profile_blocks where blocker_id=$1 and blocked_id=$2',[owner,helper]);
});
test('dispute resolution requires operator access and returns reserved credits once',async()=>{
 const id=await create(37);const offer=(await as(helper,"select submit_proposal($1,'Available for this task') as id",[id])).rows[0].id;
 const before=(await as(owner,'select available_balance from credit_accounts')).rows[0].available_balance;
 await as(owner,'select accept_proposal($1,$2)',[offer,randomUUID()]);await as(helper,"select manage_bounty($1,'dispute')",[id]);
 const key=randomUUID();await assert.rejects(()=>as(owner,"select resolve_bounty_dispute($1,false,'Reviewed and agreed refund',$2)",[id,key]));
 await admin("select resolve_bounty_dispute($1,false,'Reviewed and agreed refund',$2)",[id,key]);await admin("select resolve_bounty_dispute($1,false,'Reviewed and agreed refund',$2)",[id,key]);
 assert.equal((await as(owner,'select available_balance from credit_accounts')).rows[0].available_balance,before);
 assert.equal((await one('select status from bounties where id=$1',[id])).status,'cancelled');
});
