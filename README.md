# CampusBounty

A Next.js + TypeScript starter for a verified-student marketplace using virtual campus credits only. The interface runs in demo mode before Supabase is configured.

## Run it locally

1. Install [Node.js 20.9 or newer](https://nodejs.org/). Verify with `node --version` and `npm --version`.
2. In this directory, run `npm install` and then `npm run dev`.
3. Open `http://localhost:3000`.

## Connect Supabase

1. Create a Supabase project and copy its Project URL and anon key from **Project Settings → API**.
2. Copy `.env.example` to `.env.local`, then paste the Project URL and publishable key from Supabase's Connect dialog.
3. Run `supabase/migrations/20260906000000_marketplace.sql` in the Supabase SQL Editor.
4. In **Authentication → Providers**, enable Email; require email confirmation. Add your local and production URLs to Auth redirect URLs.
5. Insert approved universities into `universities`; only mark profiles `verified` after confirming their campus email.
6. Implement server-side / `SECURITY DEFINER` RPCs for `create_bounty`, `accept_bounty`, `submit_bounty`, and `complete_bounty`. Never let browsers change balances or write ledger entries directly.

The provided migration already includes these four protected RPCs and the auth trigger. The next application step is to call them from server actions or route handlers, then replace the demo data in `app/page.tsx` with Supabase queries.

## Important guardrails

- Credits are internal and cannot be purchased, transferred externally, or redeemed for cash.
- Keep the Supabase service-role key only in secure server/admin code.
- Treat `ledger_entries` as append-only and make the transaction ledger the financial source of truth.
