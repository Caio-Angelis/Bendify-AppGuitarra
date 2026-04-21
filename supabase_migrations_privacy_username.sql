-- supabase_migrations_privacy_username.sql
-- Goal:
-- - Reduce email exposure in public/authenticated reads.
-- - Shift ranking/friends/team UI to public handles (`username`) instead of email.
-- - Keep existing app functionality with minimal behavior change.
--
-- Scope:
-- - Adds `profiles.username` (if missing) and backfills it.
-- - Backfills `daily_ranking.username`.
-- - Restricts SELECT on email columns for anon/authenticated/public roles.
-- - Keeps RLS in place and limits column grants to public identifiers.
--
-- IMPORTANT:
-- - Run in a controlled environment first.
-- - Validate all checklist queries at the end.

begin;

-- ---------------------------------------------------------------------------
-- Profiles: add username + basic integrity
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text;

-- Fill empty usernames from email local-part (sanitized) or fallback to short id.
update public.profiles
set username = left(
  coalesce(
    nullif(
      regexp_replace(
        lower(split_part(coalesce(email, ''), '@', 1)),
        '[^a-z0-9_]',
        '_',
        'g'
      ),
      ''
    ),
    left(replace(id::text, '-', ''), 8)
  ),
  32
)
where username is null or btrim(username) = '';

-- Uniqueness for non-null usernames (case-insensitive).
create unique index if not exists profiles_username_unique_ci
  on public.profiles (lower(username))
  where username is not null;

-- Optional shape check (skip if already present).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_shape_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_shape_check
      check (
        username is null
        or (
          length(username) between 3 and 32
          and username ~ '^[a-z0-9_]+$'
        )
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily ranking: make sure username is populated for public display
-- ---------------------------------------------------------------------------
update public.daily_ranking dr
set username = left(
  coalesce(
    nullif(p.username, ''),
    nullif(
      regexp_replace(
        lower(split_part(coalesce(dr.email, ''), '@', 1)),
        '[^a-z0-9_]',
        '_',
        'g'
      ),
      ''
    ),
    left(replace(dr.user_id::text, '-', ''), 8)
  ),
  32
)
from public.profiles p
where p.id = dr.user_id
  and (dr.username is null or btrim(dr.username) = '');

-- Fallback for rows without matching profile.
update public.daily_ranking
set username = left(replace(user_id::text, '-', ''), 8)
where username is null or btrim(username) = '';

-- ---------------------------------------------------------------------------
-- Column-level privacy hardening
-- ---------------------------------------------------------------------------
-- Remove broad table-level SELECT first; then re-grant only safe columns.
revoke select on table public.profiles from public, anon, authenticated;
revoke select on table public.daily_ranking from public, anon, authenticated;

-- Explicitly grant only public identifiers needed by frontend queries.
grant select (id, username) on table public.profiles to authenticated;
grant select (user_id, username, streak_count) on table public.daily_ranking to public;

commit;

-- ---------------------------------------------------------------------------
-- Permission test checklist (manual)
-- ---------------------------------------------------------------------------
-- [ ] Authenticated SELECT on profiles returns id/username and does NOT allow email column.
-- [ ] Authenticated search by username works in friends page.
-- [ ] Pending friend requests show requester username (not email).
-- [ ] Team members list shows username (or fallback id).
-- [ ] Global ranking and friends ranking show username (or fallback id).
-- [ ] Anonymous client cannot read profiles.email or daily_ranking.email.
-- [ ] Existing writes to daily_ranking (upsert streak) still succeed with username.
-- [ ] Existing auth/profile flows (login/signup/contact) continue funcionando.
