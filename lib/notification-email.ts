import type { SupabaseClient } from "@supabase/supabase-js";

export function emailContent(kind: string, siteUrl: string, bountyId: string | null) {
  const origin = new URL(siteUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password) throw new Error("Email site URL must use HTTPS");
  const link = new URL("/", origin.origin);
  link.searchParams.set("view", bountyId ? "detail" : "inbox");
  if (bountyId) link.searchParams.set("id", bountyId);
  const message = kind === "message" || kind === "application_message";
  return {
    subject: message ? "New message on Bounty" : "Your bounty has an update",
    text: `${message ? "You have a new private message about a bounty." : "There is an update to a bounty or application you are involved in."}\n\nOpen Bounty to view it securely:\n${link}\n\nManage status and message emails in your Bounty Inbox:\n${origin.origin}/?view=inbox\n\nPlease reply through Bounty, not to this email.`,
  };
}

export async function deliverEmail(db: SupabaseClient) {
  const key = process.env.RESEND_API_KEY, from = process.env.NOTIFICATION_EMAIL_FROM;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!key || !from || !site) return { status: "not configured", accepted: 0, failed: 0 };
  // Validate before claiming work. An invalid configuration must not consume retries.
  emailContent("status", site, null);
  const { data: jobs, error } = await db.rpc("claim_email_deliveries");
  if (error) throw new Error("Email queue claim failed");
  let accepted = 0, failed = 0;
  for (const job of jobs || []) {
    try {
      const { data: allowed, error: eligibilityError } = await db.rpc("email_delivery_allowed", { p_notification: job.notification_id });
      if (eligibilityError) throw new Error("Email eligibility check failed");
      if (!allowed) {
        await db.from("email_deliveries").update({ skipped_at: new Date().toISOString(), last_error: "Read, opted out, blocked, or access changed" }).eq("notification_id", job.notification_id);
        continue;
      }
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `bounty-notification/${job.notification_id}` },
        body: JSON.stringify({ from, to: [job.email], ...emailContent(job.kind, site, job.bounty_id) }),
      });
      if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
      const result = await response.json();
      if (typeof result.id !== "string") throw new Error("Email provider did not return a message ID");
      const { error: saveError } = await db.from("email_deliveries").update({ accepted_at: new Date().toISOString(), provider_id: result.id, last_error: null }).eq("notification_id", job.notification_id);
      if (saveError) throw new Error("Email acceptance could not be recorded");
      accepted++;
    } catch (error) {
      failed++;
      // Do not log addresses, credentials, private message bodies, or provider payloads.
      const safe = error instanceof Error && /^Email /.test(error.message) ? error.message : "Email transport failed";
      await db.from("email_deliveries").update({ last_error: safe }).eq("notification_id", job.notification_id);
    }
    // Keep under the provider's default request rate rather than bursting the queue.
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  return { status: "configured", accepted, failed };
}
