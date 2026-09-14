begin;

-- Broad approved categories replace narrow templates in the posting UI.
-- Keep legacy templates and their foreign keys intact for existing bounties.
-- create_bounty_v2 continues to derive the category from an approved campus
-- template on the server, while preserving the caller's custom title.
insert into public.bounty_templates (
  university_id, category, subcategory, title, guidance,
  default_reward_credits, required_skills, requires_location
)
select u.id, c.category, 'Category', c.category, c.guidance, 25,
       '{}'::text[], c.requires_location
from public.universities u
cross join (values
  ('Academic', 'Tutoring, study sessions, concept explanations, or writing feedback. Describe your topic and level. Help someone learn; do not complete assessed work for them.', false),
  ('Physical', 'Moving items, carrying supplies, event setup, or other practical hands-on help. Explain size, weight, access, and any equipment needed. Keep tasks safe and within the helper''s abilities.', true),
  ('Errands', 'Campus pickups, drop-offs, or collecting permitted supplies. Explain what needs collecting and the timing; keep exact meeting details private.', true),
  ('Creative', 'Design, photography, video, music, or creative feedback. Describe the deliverable, format, and any permissions needed.', false),
  ('Tech', 'Coding guidance, troubleshooting, device setup, or website help. Describe the issue without sharing passwords or private credentials.', false),
  ('Career', 'Resume feedback, practice interviews, portfolio reviews, or career preparation. Explain the role or opportunity you are preparing for.', false),
  ('Events', 'Planning, organizing, hosting, or supporting a student event. Describe the role, schedule, and expected outcome.', false)
) as c(category, guidance, requires_location)
where u.is_active
on conflict (university_id, title) do nothing;

commit;
