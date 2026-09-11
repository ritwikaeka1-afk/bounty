import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { brand } from "../../../../lib/brand";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const secret=process.env.NOTIFICATION_JOB_SECRET;
  const supplied=request.headers.get("authorization")||"";
  const expected=`Bearer ${secret}`;
  if(!secret||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))
    return NextResponse.json({error:"Unauthorized"},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return NextResponse.json({error:"Notification storage is not configured"},{status:503});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:generated,error}=await db.rpc("generate_bounty_reminders");
  if(error)return NextResponse.json({error:"Reminder generation failed"},{status:500});
  const pub=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,priv=process.env.VAPID_PRIVATE_KEY,subject=process.env.VAPID_SUBJECT;
  if(!pub||!priv||!subject)return NextResponse.json({generated,push:"not configured"});
  webpush.setVapidDetails(subject,pub,priv);
  const {data:jobs,error:claimError}=await db.rpc("claim_push_deliveries");
  if(claimError)return NextResponse.json({error:"Push queue claim failed"},{status:500});
  let sent=0,failed=0;
  for(const job of jobs||[]){
    try{
      // Defense in depth: never send to a user-supplied arbitrary URL.
      const endpoint=new URL(job.endpoint);
      const allowed=endpoint.hostname==="fcm.googleapis.com"||endpoint.hostname==="updates.push.services.mozilla.com"||endpoint.hostname.endsWith(".push.apple.com")||endpoint.hostname.endsWith(".notify.windows.com");
      if(endpoint.protocol!=="https:"||endpoint.port||endpoint.username||endpoint.password||!allowed)throw new Error("Invalid push endpoint");
      // Recheck opt-out immediately before transport (preferences may change after claiming).
      const {data:sub}=await db.from("push_subscriptions").select("profile_id").eq("id",job.subscription_id).maybeSingle();
      if(!sub)continue;
      const {data:p}=await db.from("notification_preferences").select("push_enabled,reminders_enabled").eq("profile_id",sub.profile_id).maybeSingle();
      if(!p?.push_enabled||(job.kind==="reminder"&&!p.reminders_enabled))continue;
      if(job.kind==="reminder"){
        const {data:b}=await db.from("bounties").select("status,due_at,reminders_dismissed,reminders_snoozed_until").eq("id",job.bounty_id).maybeSingle();
        if(!b||b.status!=="open"||b.reminders_dismissed||(b.due_at&&Date.parse(b.due_at)<=Date.now())||(b.reminders_snoozed_until&&Date.parse(b.reminders_snoozed_until)>Date.now()))continue;
      }
      await webpush.sendNotification({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth}},JSON.stringify({title:brand.name,tag:job.notification_id}),{TTL:3600,timeout:5000});
      const {error:saveError}=await db.from("push_deliveries").update({delivered_at:new Date().toISOString(),last_error:null}).eq("notification_id",job.notification_id).eq("subscription_id",job.subscription_id);
      if(saveError)throw saveError;
      sent++;
    }catch(e){
      failed++;
      const status=e&&typeof e==="object"&&"statusCode" in e?Number(e.statusCode):0;
      if(status===404||status===410)await db.from("push_subscriptions").delete().eq("id",job.subscription_id);
      else await db.from("push_deliveries").update({last_error:status?`Transport status ${status}`:"Push delivery failed"}).eq("notification_id",job.notification_id).eq("subscription_id",job.subscription_id);
    }
  }
  return NextResponse.json({generated,sent,failed});
}
