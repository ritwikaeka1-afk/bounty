# Fixed categories, custom bounty titles

Posting now starts with one of seven fixed categories: Academic, Physical, Errands, Creative, Tech, Career, and Events. The user supplies their own title and details. Examples appear as placeholders and guidance, not prefilled titles. Switching category preserves the typed title, details, and reward.

Academic includes tutoring and study support; Physical includes carrying, moving, and hands-on help. Physical and Errands require a broad campus location. Other categories can be remote or on campus. The same category list drives the homepage shortcuts and Browse filters; reward and deadline sorting still work within a filtered category.

Apply `20260914000000_fixed_bounty_categories.sql` after existing migrations, then deploy the code. The migration adds seven broad approved catalog entries for each active community. It does not rename, delete, or reclassify existing bounties. Existing template references remain valid. Old drafts retain their text but may require choosing a category again.

The existing transactional creation RPC still derives the stored category from the approved catalog entry, so the client cannot invent a category. Titles remain free-form within the existing length limits. No changes to credits, beta access, ratings, messaging, or existing agreements are required.

The added integration test verifies the fixed list, custom title persistence, category filtering, Physical location requirements, invalid catalog rejection, and legacy-template preservation. Run `npm test` and `npm run build` before deployment.
