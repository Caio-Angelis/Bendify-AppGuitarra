-- supabase_migrations_security_patch.sql
-- Security hardening migration:
-- 1) Adds missing RLS/policies for tables used by frontend.
-- 2) Creates/updates RPCs used by frontend with server-side authorization checks.
-- 3) Includes a manual checklist for anon/authenticated permission testing.
--
-- Tables covered here:
-- - feedback
-- - shop_items
-- - teams
-- - team_members
-- - user_achievements
-- - pedalboard_presets
--
-- RPCs covered here:
-- - purchase_user_item(p_item_id uuid)
-- - equip_user_item(p_item_id uuid, p_user_id uuid)
-- - consume_user_item(p_item_type text, p_user_id uuid)

begin;

-- ---------------------------------------------------------------------------
-- RLS: feedback (only own rows)
-- ---------------------------------------------------------------------------
alter table public.feedback enable row level security;

drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own"
on public.feedback
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own"
on public.feedback
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "feedback_update_own" on public.feedback;
create policy "feedback_update_own"
on public.feedback
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "feedback_delete_own" on public.feedback;
create policy "feedback_delete_own"
on public.feedback
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: shop_items (read-only catalog for authenticated users)
-- ---------------------------------------------------------------------------
alter table public.shop_items enable row level security;

drop policy if exists "shop_items_select_authenticated" on public.shop_items;
create policy "shop_items_select_authenticated"
on public.shop_items
for select
to authenticated
using (true);

-- ---------------------------------------------------------------------------
-- RLS: teams
-- ---------------------------------------------------------------------------
alter table public.teams enable row level security;

drop policy if exists "teams_select_authenticated" on public.teams;
create policy "teams_select_authenticated"
on public.teams
for select
to authenticated
using (true);

drop policy if exists "teams_insert_as_leader" on public.teams;
create policy "teams_insert_as_leader"
on public.teams
for insert
to authenticated
with check (leader_id = auth.uid());

drop policy if exists "teams_update_only_leader" on public.teams;
create policy "teams_update_only_leader"
on public.teams
for update
to authenticated
using (leader_id = auth.uid())
with check (leader_id = auth.uid());

drop policy if exists "teams_delete_only_leader" on public.teams;
create policy "teams_delete_only_leader"
on public.teams
for delete
to authenticated
using (leader_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: team_members
-- ---------------------------------------------------------------------------
alter table public.team_members enable row level security;

drop policy if exists "team_members_select_authenticated" on public.team_members;
create policy "team_members_select_authenticated"
on public.team_members
for select
to authenticated
using (true);

drop policy if exists "team_members_insert_self_member" on public.team_members;
create policy "team_members_insert_self_member"
on public.team_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'member'
  and exists (
    select 1
    from public.teams t
    where t.id = team_id
  )
);

drop policy if exists "team_members_insert_self_leader_row" on public.team_members;
create policy "team_members_insert_self_leader_row"
on public.team_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'leader'
  and exists (
    select 1
    from public.teams t
    where t.id = team_id
      and t.leader_id = auth.uid()
  )
);

drop policy if exists "team_members_delete_self_or_team_leader" on public.team_members;
create policy "team_members_delete_self_or_team_leader"
on public.team_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.teams t
    where t.id = team_id
      and t.leader_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- RLS: user_achievements (only own rows)
-- ---------------------------------------------------------------------------
alter table public.user_achievements enable row level security;

drop policy if exists "user_achievements_select_own" on public.user_achievements;
create policy "user_achievements_select_own"
on public.user_achievements
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_achievements_insert_own" on public.user_achievements;
create policy "user_achievements_insert_own"
on public.user_achievements
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_achievements_delete_own" on public.user_achievements;
create policy "user_achievements_delete_own"
on public.user_achievements
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: pedalboard_presets (only own rows)
-- ---------------------------------------------------------------------------
alter table public.pedalboard_presets enable row level security;

drop policy if exists "pedalboard_presets_select_own" on public.pedalboard_presets;
create policy "pedalboard_presets_select_own"
on public.pedalboard_presets
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "pedalboard_presets_insert_own" on public.pedalboard_presets;
create policy "pedalboard_presets_insert_own"
on public.pedalboard_presets
for insert
to authenticated
with check (
  user_id = auth.uid()
  and slot_index between 1 and 5
);

drop policy if exists "pedalboard_presets_update_own" on public.pedalboard_presets;
create policy "pedalboard_presets_update_own"
on public.pedalboard_presets
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and slot_index between 1 and 5
);

drop policy if exists "pedalboard_presets_delete_own" on public.pedalboard_presets;
create policy "pedalboard_presets_delete_own"
on public.pedalboard_presets
for delete
to authenticated
using (user_id = auth.uid());

-- Ensures frontend UPSERT on (user_id, slot_index) has a matching unique target.
create unique index if not exists pedalboard_presets_user_slot_uniq
  on public.pedalboard_presets (user_id, slot_index);

-- ---------------------------------------------------------------------------
-- RPC: purchase_user_item(p_item_id uuid)
-- - Validates auth user, item existence, level and credits.
-- - Deducts credits server-side.
-- - Consumable: increments quantity.
-- - Non-consumable: blocks duplicate ownership.
-- ---------------------------------------------------------------------------
drop function if exists public.purchase_user_item(uuid);
create function public.purchase_user_item(p_item_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid;
  v_item_type text;
  v_price integer;
  v_min_level integer;
  v_credits integer;
  v_level integer;
  v_already_owned boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_item_id is null then
    raise exception 'item_id_required' using errcode = '22004';
  end if;

  select
    si.type,
    coalesce(si.price, 0)::integer,
    coalesce(si.min_level, 1)::integer
  into
    v_item_type,
    v_price,
    v_min_level
  from public.shop_items si
  where si.id = p_item_id;

  if v_item_type is null then
    raise exception 'item_not_found' using errcode = '22023';
  end if;

  select
    coalesce(p.credits, 0)::integer,
    coalesce(p.level, 1)::integer
  into
    v_credits,
    v_level
  from public.profiles p
  where p.id = v_uid
  for update;

  if v_level is null then
    raise exception 'profile_not_found' using errcode = '22023';
  end if;

  if v_level < v_min_level then
    raise exception 'insufficient_level' using errcode = '42501';
  end if;

  if lower(v_item_type) <> 'consumable' then
    select exists (
      select 1
      from public.user_inventory ui
      where ui.user_id = v_uid
        and ui.item_id = p_item_id
    )
    into v_already_owned;

    if v_already_owned then
      raise exception 'item_already_owned' using errcode = '23505';
    end if;
  end if;

  if v_credits < v_price then
    raise exception 'insufficient_credits' using errcode = '22003';
  end if;

  update public.profiles
  set credits = coalesce(credits, 0) - v_price
  where id = v_uid;

  if lower(v_item_type) = 'consumable' then
    update public.user_inventory
    set quantity = coalesce(quantity, 0) + 1
    where user_id = v_uid
      and item_id = p_item_id;

    if not found then
      insert into public.user_inventory (
        user_id,
        item_id,
        quantity,
        equipped
      )
      values (
        v_uid,
        p_item_id,
        1,
        false
      );
    end if;
  else
    insert into public.user_inventory (
      user_id,
      item_id,
      quantity,
      equipped
    )
    values (
      v_uid,
      p_item_id,
      1,
      false
    );
  end if;
end;
$$;

revoke all on function public.purchase_user_item(uuid) from public;
grant execute on function public.purchase_user_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: equip_user_item(p_item_id uuid, p_user_id uuid)
-- - Requires caller to be p_user_id.
-- - Requires owned item.
-- - Unequips other items of same type and equips selected one.
-- ---------------------------------------------------------------------------
drop function if exists public.equip_user_item(uuid, uuid);
create function public.equip_user_item(p_item_id uuid, p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid;
  v_item_type text;
  v_has_item boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_user_id is null or p_item_id is null then
    raise exception 'invalid_parameters' using errcode = '22004';
  end if;
  if p_user_id <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select si.type
  into v_item_type
  from public.shop_items si
  where si.id = p_item_id;

  if v_item_type is null then
    raise exception 'item_not_found' using errcode = '22023';
  end if;
  if lower(v_item_type) = 'consumable' then
    raise exception 'cannot_equip_consumable' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.user_inventory ui
    where ui.user_id = v_uid
      and ui.item_id = p_item_id
      and coalesce(ui.quantity, 0) > 0
  )
  into v_has_item;

  if not v_has_item then
    raise exception 'item_not_owned' using errcode = '42501';
  end if;

  update public.user_inventory
  set equipped = false
  where user_id = v_uid
    and item_id in (
      select ui.item_id
      from public.user_inventory ui
      join public.shop_items si
        on si.id = ui.item_id
      where ui.user_id = v_uid
        and si.type = v_item_type
    );

  update public.user_inventory
  set equipped = true
  where user_id = v_uid
    and item_id = p_item_id;
end;
$$;

revoke all on function public.equip_user_item(uuid, uuid) from public;
grant execute on function public.equip_user_item(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: consume_user_item(p_item_type text, p_user_id uuid)
-- - Requires caller to be p_user_id.
-- - Consumes one unit of the first available inventory row for item type.
-- ---------------------------------------------------------------------------
drop function if exists public.consume_user_item(text, uuid);
create function public.consume_user_item(p_item_type text, p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid;
  v_item_id uuid;
  v_qty integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_user_id is null or p_item_type is null then
    raise exception 'invalid_parameters' using errcode = '22004';
  end if;
  if p_user_id <> v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select
    ui.item_id,
    coalesce(ui.quantity, 1)::integer
  into
    v_item_id,
    v_qty
  from public.user_inventory ui
  join public.shop_items si
    on si.id = ui.item_id
  where ui.user_id = v_uid
    and lower(si.type) = lower(p_item_type)
    and coalesce(ui.quantity, 0) > 0
  order by ui.acquired_at nulls first, ui.item_id
  limit 1
  for update;

  if v_item_id is null then
    raise exception 'item_not_available' using errcode = '22023';
  end if;

  if v_qty <= 1 then
    delete from public.user_inventory
    where user_id = v_uid
      and item_id = v_item_id;
  else
    update public.user_inventory
    set quantity = v_qty - 1
    where user_id = v_uid
      and item_id = v_item_id;
  end if;
end;
$$;

revoke all on function public.consume_user_item(text, uuid) from public;
grant execute on function public.consume_user_item(text, uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Manual permission checklist (run after migration)
-- ---------------------------------------------------------------------------
-- [ ] ANON cannot SELECT from: feedback, teams, team_members, user_achievements,
--     pedalboard_presets, shop_items.
-- [ ] AUTH user A can INSERT feedback only with user_id = auth.uid().
-- [ ] AUTH user A cannot SELECT/UPDATE/DELETE feedback rows of user B.
-- [ ] AUTH user A can SELECT teams/team_members and create a team where leader_id = auth.uid().
-- [ ] AUTH user A cannot UPDATE/DELETE team where leader_id != auth.uid().
-- [ ] AUTH user A can join team as member with user_id = auth.uid() only.
-- [ ] AUTH user A can leave own membership; team leader can remove team members.
-- [ ] AUTH user A can CRUD only own pedalboard_presets rows and slot_index 1..5.
-- [ ] AUTH user A can SELECT/INSERT own user_achievements only.
-- [ ] RPC purchase_user_item fails for anon, insufficient credits, insufficient level,
--     or already-owned non-consumable item.
-- [ ] RPC purchase_user_item decrements credits and adds inventory for authenticated owner.
-- [ ] RPC equip_user_item fails when p_user_id != auth.uid() or item not owned.
-- [ ] RPC equip_user_item keeps only one equipped item per type.
-- [ ] RPC consume_user_item fails when p_user_id != auth.uid() or no quantity available.
-- [ ] RPC consume_user_item decrements quantity and deletes row when quantity reaches zero.
