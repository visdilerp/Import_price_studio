-- ============================================================
-- MIGRATION 2 — Visibility (public/private), sharing, and
-- profile directory for the share picker.
-- Run this whole file in: Supabase Dashboard > SQL Editor
-- (Safe to run on your existing project — nothing is deleted.)
-- ============================================================

-- 1. Visibility column on calculations (default private)
alter table public.calculations
  add column if not exists visibility text not null default 'private'
  check (visibility in ('private','public'));

-- 2. Shares table: share a calculation with specific users
create table if not exists public.calculation_shares (
  id bigint generated always as identity primary key,
  calculation_id uuid not null references public.calculations(id) on delete cascade,
  shared_with uuid not null references public.profiles(id) on delete cascade,
  shared_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (calculation_id, shared_with)
);
alter table public.calculation_shares enable row level security;

-- 3. Helper: can the current user VIEW this calculation?
--    (owner, admin, public, or explicitly shared with them)
create or replace function public.can_view_calc(cid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.calculations c
    where c.id = cid
      and ( c.owner = auth.uid()
            or c.visibility = 'public'
            or public.is_admin()
            or exists (select 1 from public.calculation_shares s
                       where s.calculation_id = cid and s.shared_with = auth.uid()) )
  );
$$;

-- 4. Calculations: replace SELECT policy (edit/delete stay owner+admin only)
drop policy if exists "calc_select" on public.calculations;
create policy "calc_select" on public.calculations
  for select using (public.can_view_calc(id));

-- 5. Shares policies: owner/admin manage; shared user can see their share
drop policy if exists "share_select" on public.calculation_shares;
create policy "share_select" on public.calculation_shares
  for select using (
    shared_with = auth.uid() or public.is_admin()
    or exists (select 1 from public.calculations c where c.id = calculation_id and c.owner = auth.uid())
  );

drop policy if exists "share_insert" on public.calculation_shares;
create policy "share_insert" on public.calculation_shares
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.calculations c where c.id = calculation_id and c.owner = auth.uid())
  );

drop policy if exists "share_delete" on public.calculation_shares;
create policy "share_delete" on public.calculation_shares
  for delete using (
    public.is_admin()
    or exists (select 1 from public.calculations c where c.id = calculation_id and c.owner = auth.uid())
  );

-- 6. Edit logs & revisions: viewable by anyone who can view the calculation
drop policy if exists "log_select" on public.edit_logs;
create policy "log_select" on public.edit_logs
  for select using (public.can_view_calc(calculation_id));

drop policy if exists "rev_select" on public.revisions;
create policy "rev_select" on public.revisions
  for select using (public.can_view_calc(calculation_id));

-- (insert policies unchanged: only owner/admin can write logs & revisions)

-- 7. Profiles: every signed-in user can see the user directory
--    (needed for the "share with…" picker; internal tool)
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);

-- ============================================================
-- Done. No data is modified; existing reports stay Private.
-- ============================================================
