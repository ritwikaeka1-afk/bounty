# Inactivity logout and notification email

## Sessions

After 28 minutes without keyboard, pointer, touch, or wheel activity, Bounty shows a two-minute warning with a Stay signed in button. After 30 minutes it clears the displayed account data, removes that tab's draft, and signs out the current Supabase session. Activity in any tab on the same origin shares the deadline. Reloading, focusing, token refresh, and background network requests do not reset it. A suspended tab checks elapsed wall-clock time when it resumes, before accepting activity.

This is a browser inactivity feature, not a server-side guarantee that an already issued JWT immediately becomes invalid. Supabase access tokens remain valid until expiry; its existing RLS policies still govern API access. Tabs on different origins (for example Azure's hostname versus joinbounty.me), different browser profiles, and different devices do not share browser activity. When local storage is unavailable, open tabs use BroadcastChannel; if both APIs are unavailable, each tab has its own timer. A browser that is completely suspended cannot run a timer until it resumes.

## Email delivery setup

Supabase Auth SMTP and Bounty notification emails are separate. Existing sign-in email settings do not give Azure access to Resend. Apply `20260914001000_notification_email.sql`, then deploy this change. New status and message notices are queued; historical notices are not backfilled.

Set these in **Azure App Service → Environment variables**, as runtime settings:

- `RESEND_API_KEY`: a Resend sending API key authorized for your verified sender domain.
- `NOTIFICATION_EMAIL_FROM`: for example `Bounty <noreply@joinbounty.me>` after verifying that domain in Resend.
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only key for the correct project.
- `NOTIFICATION_JOB_SECRET`: a long, randomly generated secret.
- `NEXT_PUBLIC_SITE_URL`: the HTTPS public origin, also supplied to the GitHub build as its existing repository variable.

Do not prefix secrets with `NEXT_PUBLIC` or commit them. Keep Resend click tracking disabled for authentication emails. This feature sends plain text with generic subjects/previews and authenticated links; it never emails private conversation text or meeting addresses.

Enable the included GitHub Actions scheduler after configuration:

1. Add the same `NOTIFICATION_JOB_SECRET` as a GitHub Actions repository secret.
2. Set the `NEXT_PUBLIC_SITE_URL` repository variable to the final HTTPS origin.
3. Set repository variable `NOTIFICATIONS_ENABLED` to `true`.
4. Merge the workflow into the default branch and run **Deliver Bounty notifications → Run workflow** once to verify it.

The workflow POSTs to `/api/notifications/run` every five minutes. GitHub scheduling can be delayed and Actions quotas apply; this is not instant delivery. If an external scheduler already invokes this endpoint, use one scheduler rather than enabling both. The endpoint's existing job secret protects it.

## Preferences, retries, and diagnostics

Inbox preferences independently control status and message email, enabled by default. Delivery respects quiet hours and rechecks consent before sending. Read inbox notices are suppressed. Pending chat bursts are collapsed to the latest notice per task and kind; chat email has a 15-minute spacing rule per task after provider acceptance. New application/status notices use the same queue. Rejected/unconfirmed accounts do not receive notification email.

Queue claims are leased for ten minutes, retried at most four times, and stop after 20 hours, within Resend's 24-hour idempotency window. A stable Resend idempotency key prevents a worker retry from sending the same logical notice twice. Keep sender/site settings stable while retrying; changing a payload under the same key can produce an idempotency conflict.

The worker reports `email.status`, `email.accepted`, and `email.failed`. `accepted` means Resend accepted the request, not that it arrived in the recipient's inbox. Use the recorded `provider_id` in Resend's Emails dashboard to inspect delivered/bounced status. This version does not configure Resend webhooks. Missing credentials return `not configured`; the scheduler then fails visibly rather than pretending delivery works.

Operators can inspect recent delivery metadata (no recipient addresses or bodies) in SQL Editor:

```sql
select notification_id, created_at, attempts, accepted_at, provider_id, skipped_at, last_error
from public.email_deliveries
order by created_at desc
limit 50;
```

For a real test, use two confirmed accounts, enable email preferences outside quiet hours, and send an application or bounty message. Check the next worker run and the corresponding Resend message ID. Never share the API key in chat. Actual Resend credentials, successful delivery, and Azure settings have not been verified by the local test suite.

Local tests cover shared deadlines, reload/sleep expiry, expired-session markers, new sessions, storage fallback, email payload privacy, opt-out rechecks, provider errors, idempotency keys, queue isolation, email confirmation, and leases. Existing marketplace tests remain required.
