# Temporary open beta

This release lets anyone with a confirmed email join the existing Bounty marketplace. Beta testers share its tasks and approved templates; this is not a separate staging database. The page labels the open beta and does not claim university affiliation has been verified.

Apply `20260910000000_temporary_beta_access.sql` after the previous migrations, then deploy this application change. **Applying this migration enables beta mode.** Keep Supabase email confirmation enabled. Ensure your Supabase email provider/SMTP configuration supports delivery to external testers; a successful build does not verify email delivery.

Choose Create account, use any email, and open the confirmation link. The authenticated enrollment RPC reads `auth.users.email_confirmed_at` directly. User-editable metadata cannot grant access. Existing confirmed non-UCLA auth accounts that previously had no profile can sign in and enroll too.

New testers receive zero credits, following the existing credit model. An operator must issue documented grants if test tasks need starting balances. This change never creates free credits on repeated sign-in. Existing verified accounts are unchanged; rejected accounts and accounts belonging to another community are not moved or promoted.

## Close the beta

In the correct project's Supabase SQL Editor, run:

```sql
select public.set_beta_access(false);
```

This stops enrollment and moves accounts approved through beta back to pending access. Existing verified student accounts remain verified. Task/credit records are retained. Finish beta assignments before closing; otherwise an operator must handle their reserved credits or reopen access so participants can complete them. Participants may retain access to historical participant records under existing conversation policies; this switch is not account deletion or session revocation.

To reopen:

```sql
select public.set_beta_access(true);
```

Eligible testers regain access on the next sign-in or marketplace refresh. To check the setting:

```sql
select public.get_beta_access_mode();
```

Only database operators/service role can change the setting. The client reads the current setting without a rebuild. New non-UCLA signup is disabled in the UI when beta closes; sign-in stays available for existing accounts. Supabase may still create an auth account through its public API, but it cannot enroll into the marketplace while beta is closed. RLS, participant checks, and credit checks remain enabled.

If an operator later verifies a beta tester as a real student, clear `beta_access_granted` as part of that explicit verification so closing a subsequent beta does not revoke their independently approved access.

Validation includes confirmed versus unconfirmed email, forged verification metadata, disabled enrollment, restricted operator controls, retry-safe account creation, zero starting balance, rejected accounts, and restoration of the student-only access policy. Test actual external-email delivery and confirmation redirects after deployment.
