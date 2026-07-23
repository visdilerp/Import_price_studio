-- ============================================================
-- VISDIL VENTURES - Import Cost Studio : Supabase schema
-- Run this whole file in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ---------- 1. PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text default '',
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin());

-- auto-create a profile whenever a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2. CALCULATIONS ----------
create table if not exists public.calculations (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  report_name text not null,
  country text,
  incoterm text,
  mode text,
  total_landed numeric,
  final_offer numeric,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calculations_owner_idx on public.calculations(owner);
create index if not exists calculations_report_idx on public.calculations(report_name);

alter table public.calculations enable row level security;

drop policy if exists "calc_select" on public.calculations;
create policy "calc_select" on public.calculations
  for select using (owner = auth.uid() or public.is_admin());

drop policy if exists "calc_insert" on public.calculations;
create policy "calc_insert" on public.calculations
  for insert with check (owner = auth.uid());

drop policy if exists "calc_update" on public.calculations;
create policy "calc_update" on public.calculations
  for update using (owner = auth.uid() or public.is_admin());

drop policy if exists "calc_delete" on public.calculations;
create policy "calc_delete" on public.calculations
  for delete using (owner = auth.uid() or public.is_admin());

-- ---------- 3. EDIT LOGS ----------
create table if not exists public.edit_logs (
  id bigint generated always as identity primary key,
  calculation_id uuid not null references public.calculations(id) on delete cascade,
  editor uuid references public.profiles(id) on delete set null,
  editor_email text,
  action text not null,           -- 'created' | 'updated'
  changes jsonb,                  -- array of human-readable change strings
  created_at timestamptz not null default now()
);

create index if not exists edit_logs_calc_idx on public.edit_logs(calculation_id);

alter table public.edit_logs enable row level security;

drop policy if exists "log_select" on public.edit_logs;
create policy "log_select" on public.edit_logs
  for select using (
    exists (select 1 from public.calculations c
            where c.id = calculation_id
              and (c.owner = auth.uid() or public.is_admin()))
  );

drop policy if exists "log_insert" on public.edit_logs;
create policy "log_insert" on public.edit_logs
  for insert with check (
    editor = auth.uid()
    and exists (select 1 from public.calculations c
                where c.id = calculation_id
                  and (c.owner = auth.uid() or public.is_admin()))
  );

-- ---------- 4. PRICE REVISIONS (Offer 1 -> Offer 2 -> ...) ----------
create table if not exists public.revisions (
  id bigint generated always as identity primary key,
  calculation_id uuid not null references public.calculations(id) on delete cascade,
  rev_no int not null,
  note text default '',
  snapshot jsonb not null,        -- per-product offers + totals at time of revision
  created_by uuid references public.profiles(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists revisions_calc_idx on public.revisions(calculation_id);

alter table public.revisions enable row level security;

drop policy if exists "rev_select" on public.revisions;
create policy "rev_select" on public.revisions
  for select using (
    exists (select 1 from public.calculations c
            where c.id = calculation_id
              and (c.owner = auth.uid() or public.is_admin()))
  );

drop policy if exists "rev_insert" on public.revisions;
create policy "rev_insert" on public.revisions
  for insert with check (
    created_by = auth.uid()
    and exists (select 1 from public.calculations c
                where c.id = calculation_id
                  and (c.owner = auth.uid() or public.is_admin()))
  );

-- ============================================================
-- AFTER RUNNING THIS FILE:
-- 1. Authentication > Sign In / Up > Email : turn OFF "Confirm email"
-- 2. Authentication > Users > Add user  -> create your admin account
-- 3. Run this to promote it (replace the email):
--    update public.profiles set role = 'admin' where email = 'you@example.com';
-- ============================================================
