-- supabase_migrations.sql
-- RLS policies + RPCs for Bendify (Supabase / Postgres)
--
-- Notes:
-- - Tables/columns are based on `src/types/supabase.ts`
-- - Goal: users can only edit their own practice logs and inventory.

begin;

-- ---------------------------------------------------------------------------
-- Helper: auth guard
-- ---------------------------------------------------------------------------

create or replace function public._require_auth_uid(p_user_id uuid)
returns uuid
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_user_id is null then
    raise exception 'user_id_required' using errcode = '22004';
  end if;
  if p_user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: profiles
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own_row" on public.profiles;
create policy "profiles_insert_own_row"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own_row" on public.profiles;
create policy "profiles_update_own_row"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "profiles_delete_own_row" on public.profiles;
create policy "profiles_delete_own_row"
on public.profiles
for delete
to authenticated
using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: practice_logs (only own rows)
-- ---------------------------------------------------------------------------

alter table public.practice_logs enable row level security;

drop policy if exists "practice_logs_select_own" on public.practice_logs;
create policy "practice_logs_select_own"
on public.practice_logs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "practice_logs_insert_own" on public.practice_logs;
create policy "practice_logs_insert_own"
on public.practice_logs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "practice_logs_update_own" on public.practice_logs;
create policy "practice_logs_update_own"
on public.practice_logs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "practice_logs_delete_own" on public.practice_logs;
create policy "practice_logs_delete_own"
on public.practice_logs
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: daily_ranking
-- - SELECT is public (Ranking page is not protected).
-- - Writes restricted to own row.
-- ---------------------------------------------------------------------------

alter table public.daily_ranking enable row level security;

drop policy if exists "daily_ranking_select_public" on public.daily_ranking;
create policy "daily_ranking_select_public"
on public.daily_ranking
for select
to public
using (true);

drop policy if exists "daily_ranking_insert_own" on public.daily_ranking;
create policy "daily_ranking_insert_own"
on public.daily_ranking
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "daily_ranking_update_own" on public.daily_ranking;
create policy "daily_ranking_update_own"
on public.daily_ranking
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "daily_ranking_delete_own" on public.daily_ranking;
create policy "daily_ranking_delete_own"
on public.daily_ranking
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: user_inventory (inventory) — only own rows
-- ---------------------------------------------------------------------------

alter table public.user_inventory enable row level security;

drop policy if exists "user_inventory_select_own" on public.user_inventory;
create policy "user_inventory_select_own"
on public.user_inventory
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_inventory_insert_own" on public.user_inventory;
create policy "user_inventory_insert_own"
on public.user_inventory
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_inventory_update_own" on public.user_inventory;
create policy "user_inventory_update_own"
on public.user_inventory
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "user_inventory_delete_own" on public.user_inventory;
create policy "user_inventory_delete_own"
on public.user_inventory
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: friendships (needed for friends ranking RPC)
-- - Not requested explicitly, but required so users can read their own accepted
--   friendships (and create/accept requests) safely.
-- ---------------------------------------------------------------------------

alter table public.friendships enable row level security;

drop policy if exists "friendships_select_participants" on public.friendships;
create policy "friendships_select_participants"
on public.friendships
for select
to authenticated
using (requester_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "friendships_insert_requester" on public.friendships;
create policy "friendships_insert_requester"
on public.friendships
for insert
to authenticated
with check (requester_id = auth.uid());

drop policy if exists "friendships_update_participants" on public.friendships;
create policy "friendships_update_participants"
on public.friendships
for update
to authenticated
using (requester_id = auth.uid() or recipient_id = auth.uid())
with check (requester_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "friendships_delete_participants" on public.friendships;
create policy "friendships_delete_participants"
on public.friendships
for delete
to authenticated
using (requester_id = auth.uid() or recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPC: Daily ranking including friends' offense sum
-- "ofensiva" in the app maps to `daily_ranking.streak_count`.
--
-- Returns a ranking list for a viewer (auth user):
-- - includes the viewer + accepted friends
-- - score = own_streak + sum(friends_streak)
-- - rows sorted by score desc, tie-breaker by email/user_id.
-- ---------------------------------------------------------------------------

drop function if exists public.calc_daily_ranking_friends(uuid, integer);
create function public.calc_daily_ranking_friends(
  p_viewer_user_id uuid default auth.uid(),
  p_limit integer default 50
)
returns table (
  rank integer,
  user_id uuid,
  email text,
  own_streak integer,
  friends_offense integer,
  total_offense integer
)
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_uid uuid;
  v_limit integer;
begin
  v_uid := public._require_auth_uid(p_viewer_user_id);
  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));

  return query
  with accepted_friends as (
    select
      case
        when f.requester_id = v_uid then f.recipient_id
        else f.requester_id
      end as friend_id
    from public.friendships f
    where
      f.status = 'accepted'
      and (f.requester_id = v_uid or f.recipient_id = v_uid)
      and f.requester_id is not null
      and f.recipient_id is not null
  ),
  scope_ids as (
    select v_uid as user_id
    union
    select af.friend_id as user_id
    from accepted_friends af
    where af.friend_id is not null
  ),
  scoped_rank as (
    select
      s.user_id,
      coalesce(dr.email, (select p.email from public.profiles p where p.id = s.user_id), s.user_id::text) as email,
      coalesce(dr.streak_count, 0)::integer as own_streak
    from scope_ids s
    left join public.daily_ranking dr
      on dr.user_id = s.user_id
  ),
  friends_sum as (
    select
      v_uid as user_id,
      coalesce(sum(sr.own_streak), 0)::integer as friends_offense
    from scoped_rank sr
    where sr.user_id <> v_uid
  ),
  scored as (
    select
      sr.user_id,
      sr.email,
      sr.own_streak,
      fs.friends_offense,
      (sr.own_streak + fs.friends_offense)::integer as total_offense
    from scoped_rank sr
    cross join friends_sum fs
  ),
  ordered as (
    select
      row_number() over (order by s.total_offense desc, s.own_streak desc, s.email asc, s.user_id asc)::integer as rank,
      s.user_id,
      s.email,
      s.own_streak,
      s.friends_offense,
      s.total_offense
    from scored s
    order by s.total_offense desc, s.own_streak desc, s.email asc, s.user_id asc
    limit v_limit
  )
  select
    o.rank, o.user_id, o.email, o.own_streak, o.friends_offense, o.total_offense
  from ordered o;
end;
$$;

commit;

