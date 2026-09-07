create or replace function public.update_my_profile(
  p_display_name text,
  p_bio text,
  p_skills text[],
  p_experience public.experience_level
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign-in required'; end if;
  if char_length(btrim(p_display_name)) not between 2 and 60 then raise exception 'Display name must be 2 to 60 characters'; end if;
  if char_length(coalesce(p_bio, '')) > 500 then raise exception 'Bio must be 500 characters or fewer'; end if;
  if coalesce(array_length(p_skills, 1), 0) > 12 then raise exception 'Choose at most 12 skills'; end if;
  update public.profiles
  set display_name = btrim(p_display_name),
      bio = nullif(btrim(p_bio), ''),
      skills = coalesce(p_skills, '{}'),
      experience = p_experience
  where id = auth.uid();
  if not found then raise exception 'Profile not found'; end if;
end; $$;

revoke execute on function public.update_my_profile(text, text, text[], public.experience_level) from public, anon;
grant execute on function public.update_my_profile(text, text, text[], public.experience_level) to authenticated;
