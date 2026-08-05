create table if not exists public.app_state (
  id text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "app_state_read" on public.app_state;
create policy "app_state_read"
on public.app_state for select
to anon, authenticated
using (true);

drop policy if exists "app_state_write" on public.app_state;
create policy "app_state_write"
on public.app_state for insert
to anon, authenticated
with check (true);

drop policy if exists "app_state_update" on public.app_state;
create policy "app_state_update"
on public.app_state for update
to anon, authenticated
using (true)
with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;
