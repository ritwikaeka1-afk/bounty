# Bounty redesign: rollout and verification

This change is prepared locally. It has not been deployed to Azure or applied to a live Supabase database.

## Implemented

- Bounty branding, responsive green-and-cream design, clearer typography and credit labels.
- Separate sign-in and account creation; private first/last names and public initials.
- Custom whole-number credit rewards, editing, renewed applications after edits, agreed changes after assignment, and optional completion bonuses.
- Skill applications, poster selection, private application and assigned-task conversations.
- Completed-task five-star feedback with actual average and count. Unrated users show “New,” not a fabricated score.
- Saved bounties, task management, credit activity, reports, blocking, and persisted support requests.
- Durable in-app reminders, snooze/dismiss, notification preferences, and opt-in Web Push transport.

## Database first

Back up the target database and test against a staging copy. Inspect the project's migration history before applying changes; do not trust repository-local Supabase `.temp` files as evidence of the intended project.

Apply the five new migrations in filename order after existing migrations:

1. `20260909000000_bounty_experience.sql`
2. `20260909001000_task_people_and_blocks.sql`
3. `20260909002000_agreed_adjustments.sql`
4. `20260909003000_reputation_and_application_chat.sql`
5. `20260909004000_product_metrics.sql`

They add tables, policies, RPCs, and column-level access restrictions. Existing account names are preserved; new first/last names are private. Existing student verification and internal-credit rules remain. They do not grant students starting credits or automatically verify them.

Deploy the application only after migration validation. For rollback, restore the previous application first and retain additive database structures while investigating. Do not automatically drop tables containing messages, reviews, ledger history, or user data.

## Environment and delivery

See `.env.example`. Supply `NEXT_PUBLIC_SUPABASE_URL` and either the publishable or anon key at build time. Configure `NEXT_PUBLIC_SITE_URL` to the real public origin. Public variables are compiled into the client; changing Azure runtime settings alone will not update them.

Push requires a generated VAPID key pair, a real `VAPID_SUBJECT`, and a runtime-only `SUPABASE_SERVICE_ROLE_KEY` and `NOTIFICATION_JOB_SECRET`. Never expose service-role, job, or private VAPID keys to browser code. The existing Azure build now accepts the public VAPID key as a repository variable.

Configure an external scheduler to POST `/api/notifications/run` every 15–30 minutes with `Authorization: Bearer <NOTIFICATION_JOB_SECRET>`. Use a scheduler with secret storage, such as an Azure timer Function or Logic App. No scheduler has been provisioned, and its cost is separate from this code and must be checked for the selected service. Without it, event notifications still persist, but time-based reminders and push delivery do not run automatically.

Default reminder ages are 24 hours, 72 hours, and seven days, subject to eligibility, quiet time, snooze, opt-out, and a daily cap. Push retries are bounded and use durable claims. Transport is at-least-once: a provider accepting a push immediately before a worker crash can result in a retry; notification tags reduce duplicate presentation. Monitor failures and queue age. Support requests require an operator to review the stored queue; this change does not configure support email delivery.

## Domain

Azure B1 permits custom-hostname binding; purchasing/renewing a domain remains separate. Eligible managed HTTPS certificates do not include domain registration. Obtain the exact verification and DNS values from the target Azure app, bind the hostname, enable HTTPS, update authentication site/callback URLs and public build configuration, then validate email links. Existing push subscriptions are origin-specific and must be enrolled again on the new hostname. No domain availability, trademark clearance, purchase, or DNS change is included.

References: [Microsoft custom domains](https://learn.microsoft.com/en-us/azure/app-service/app-service-web-tutorial-custom-domain), [managed certificates](https://learn.microsoft.com/en-us/azure/app-service/tutorial-secure-domain-certificate).

## Verification and remaining checks

`npm test` runs 12 database integration cases with PGlite using the actual migrations and Supabase auth/storage stubs. They cover access controls, custom rewards, retries, agreement changes, reviews, application privacy, reminders, push claims, and dispute refunds. `npm run build` also checks TypeScript. The existing `lint` script is a TypeScript check, not a separate lint suite.

Before production, test with two verified staging accounts and one unrelated account: email callback, application/chat, selection, submission, completion, reciprocal review, and exact credit balances. Run true concurrent assignment/completion tests with separate PostgreSQL sessions; PGlite tests are not proof of multiconnection concurrency. Test real push acceptance, denial, sign-out, quiet hours, expired tasks, and a scheduler retry. Real authentication email, push transport, and Azure deployment have not been exercised locally because production credentials were not configured.

Public identities use initials, which are pseudonymous rather than fully anonymous. User-authored messages, biographies, and photos may disclose identity. Exact meeting details are participant-only. Do not promise complete anonymity.

## Follow-up work

Optional product analytics defaults off. Set retention and operator access policies before enabling it. The current client loads visible bounty pages and filters locally; move discovery, account aggregates, message history, applications, and reputation to independently paginated server queries as usage grows. Notifications show the latest 100 and ledger activity the latest 50. Chat currently uses manual refresh rather than real-time subscriptions. Add older-message pagination before conversations exceed the current display window.

Saved-search alerts, repeat templates, portfolio evidence, measured reward recommendations, blind review publication, and a full moderation console remain future work. No automatic surge pricing or fabricated marketplace statistics are included.
