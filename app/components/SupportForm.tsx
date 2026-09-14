"use client";
import { useState } from "react";
import { rpc } from "../../lib/data";
import { errorMessage } from "../../lib/rules";

export function SupportForm({ bountyId }: { bountyId?: string }) {
 const [status, setStatus] = useState("");
 const [busy, setBusy] = useState(false);

 return <form onSubmit={async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const kind = String(data.get("kind") || "Support");
  setBusy(true); setStatus("");
  try {
   const subject = `${kind}: ${String(data.get("subject") || "").trim()}`.slice(0, 120);
   const id = await rpc<string>("send_support_request", { p_subject: subject, p_message: data.get("message"), p_bounty: bountyId || null });
   setStatus(`${kind === "Suggestion" ? "Suggestion" : "Request"} saved. Reference: ${id}. This is not an emergency service.`);
   form.reset();
  } catch (error) { setStatus(errorMessage(error)); }
  finally { setBusy(false); }
 }}>
  <label>What is this about?<select name="kind" defaultValue="Support"><option value="Support">Support request</option><option value="Suggestion">Product suggestion</option><option value="Safety">Safety concern</option><option value="Bug">Report a bug</option></select></label>
  <label>Subject<input name="subject" required minLength={3} maxLength={108} placeholder="What would you like us to know?" /></label>
  <label>How can we help?<textarea name="message" required minLength={10} maxLength={3000} rows={5} placeholder="Share enough detail for the team to understand the issue or idea." /></label>
  <button className="primary" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
  {status && <p role="status">{status}</p>}
 </form>;
}

