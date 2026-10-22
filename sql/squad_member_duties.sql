-- Run once in the Supabase SQL editor.
create table if not exists public.squad_member_duties (
 member_id uuid primary key references public.members(id) on delete cascade,
 squad_id uuid not null,
 raid text not null default '',
 def text not null default '',
 counter text not null default '',
 updated_at timestamptz not null default now(),
 constraint duty_raid_len check (char_length(raid)<=500),
 constraint duty_def_len check (char_length(def)<=500),
 constraint duty_counter_len check (char_length(counter)<=500)
);
create index if not exists squad_member_duties_squad_idx on public.squad_member_duties(squad_id);
alter table public.squad_member_duties enable row level security;
drop policy if exists squad_duties_read on public.squad_member_duties;
create policy squad_duties_read on public.squad_member_duties for select to authenticated
 using (exists (select 1 from public.members me where me.user_id=auth.uid() and me.squad_id=squad_member_duties.squad_id and me.is_active=true));
drop policy if exists squad_duties_admin_insert on public.squad_member_duties;
create policy squad_duties_admin_insert on public.squad_member_duties for insert to authenticated
 with check (exists (select 1 from public.members me where me.user_id=auth.uid() and me.squad_id=squad_member_duties.squad_id and me.access_role='admin' and me.is_active=true)
 and exists(select 1 from public.members target where target.id=squad_member_duties.member_id and target.squad_id=squad_member_duties.squad_id));
drop policy if exists squad_duties_admin_update on public.squad_member_duties;
create policy squad_duties_admin_update on public.squad_member_duties for update to authenticated
 using (exists (select 1 from public.members me where me.user_id=auth.uid() and me.squad_id=squad_member_duties.squad_id and me.access_role='admin' and me.is_active=true))
 with check (exists (select 1 from public.members me where me.user_id=auth.uid() and me.squad_id=squad_member_duties.squad_id and me.access_role='admin' and me.is_active=true));
