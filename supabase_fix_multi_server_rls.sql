-- Repairs recursive RLS policies introduced by the multi-server migration.
-- Run this in the Supabase SQL editor for the project used by Amanoki.

begin;

create or replace function public.is_server_member(target_server_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.server_members
    where server_id = target_server_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_server(target_server_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.server_members
    where server_id = target_server_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

drop policy if exists "Users can view servers they are members of" on public.servers;
drop policy if exists "Users can create servers" on public.servers;

create policy "Users can view servers they are members of"
on public.servers
for select
using (public.is_server_member(id) or owner_id = auth.uid());

create policy "Users can create servers"
on public.servers
for insert
with check (auth.uid() = owner_id);

drop policy if exists "Users can view members of their servers" on public.server_members;
drop policy if exists "Owners and admins can manage members" on public.server_members;
drop policy if exists "Users can join servers" on public.server_members;
drop policy if exists "Owners and admins can insert members" on public.server_members;
drop policy if exists "Owners and admins can update members" on public.server_members;
drop policy if exists "Owners and admins can delete members" on public.server_members;

create policy "Users can view members of their servers"
on public.server_members
for select
using (public.is_server_member(server_id));

create policy "Users can join servers"
on public.server_members
for insert
with check (auth.uid() = user_id);

create policy "Owners and admins can insert members"
on public.server_members
for insert
with check (public.can_manage_server(server_id));

create policy "Owners and admins can update members"
on public.server_members
for update
using (public.can_manage_server(server_id))
with check (public.can_manage_server(server_id));

create policy "Owners and admins can delete members"
on public.server_members
for delete
using (public.can_manage_server(server_id));

drop policy if exists "Members can view channels" on public.channels;
create policy "Members can view channels"
on public.channels
for select
using (public.is_server_member(server_id));

drop policy if exists "Members can view messages" on public.messages;
create policy "Members can view messages"
on public.messages
for select
using (
  exists (
    select 1
    from public.channels c
    where c.slug = public.messages.channel
      and public.is_server_member(c.server_id)
  )
);

commit;
