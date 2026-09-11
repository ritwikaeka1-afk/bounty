import { createClient } from "./supabase/client";
export type Template = { id: string; title: string; category: string; guidance: string; default_reward_credits: number; required_skills: string[]; requires_location: boolean };
export type Bounty = { id: string; creator_id: string; accepted_by: string | null; title: string; description: string; category: string; reward_credits: number; status: string; due_at: string | null; created_at: string; updated_at: string; completion_criteria: string; estimated_minutes: number | null; location_type: string; location_name: string | null; revision: number; reminders_dismissed: boolean };
export type Profile = { id: string; display_name: string; bio: string | null; major: string | null; graduation_year: number | null; skills: string[]; interests: string[]; experience: "beginner" | "intermediate" | "advanced"; avatar_url: string | null; verification_status: string };
export type Notice = { id: string; bounty_id: string | null; kind: string; message: string; read_at: string | null; created_at: string };
export type Offer = { id: string; bounty_id: string; bidder_id: string; message: string; status: string; bounty_revision: number };
export type Preferences = { reminders_enabled: boolean; push_enabled: boolean; timezone: string; quiet_start: number; quiet_end: number };
export const defaultPreferences: Preferences = { reminders_enabled: true, push_enabled: false, timezone: "America/Los_Angeles", quiet_start: 22, quiet_end: 8 };
export const bountyColumns = "id,creator_id,accepted_by,title,description,category,reward_credits,status,due_at,created_at,updated_at,completion_criteria,estimated_minutes,location_type,location_name,revision,reminders_dismissed";
// Fetch every visible page so older assignments and reserved credits are not
// silently dropped by PostgREST's row limit. RLS still scopes every request.
export async function loadBounties() {
  const rows: Bounty[] = [];
  for (let offset = 0; ; offset += 300) {
    const { data, error } = await createClient().from("bounties")
      .select(bountyColumns).order("created_at", { ascending: false })
      .order("id", { ascending: false }).range(offset, offset + 299);
    if (error) return { data: null, error };
    rows.push(...(data as Bounty[]));
    if (data.length < 300) return { data: rows, error: null };
  }
}
export async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await createClient().rpc(name, args);
  if (error) throw error;
  return data as T;
}
export async function enablePush(profileId: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Push is unavailable in this browser. Your in-app inbox still works.");
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Push delivery is not configured yet. Use the in-app inbox for now.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Push is off. You can still read every update in your inbox.");
  await navigator.serviceWorker.register("/sw.js");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = subscription.toJSON();
  const { error } = await createClient().from("push_subscriptions").upsert({ profile_id: profileId, endpoint: subscription.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }, { onConflict: "endpoint" });
  if (error) { if (!existing) await subscription.unsubscribe(); throw error; }
}
export async function removeDevicePush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    const { error } = await createClient().from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    if (error) throw error;
  }
}
