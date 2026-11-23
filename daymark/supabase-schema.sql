-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subject text not null default 'General',
  description text not null default '',
  estimated_minutes integer not null default 60 check (estimated_minutes > 0),
  deadline date,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'todo' check (status in ('todo','done','paused')),
  scheduled_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

drop policy if exists "Users can read their own tasks" on public.tasks;
create policy "Users can read their own tasks"
  on public.tasks for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own tasks" on public.tasks;
create policy "Users can insert their own tasks"
  on public.tasks for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own tasks" on public.tasks;
create policy "Users can update their own tasks"
  on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own tasks" on public.tasks;
create policy "Users can delete their own tasks"
  on public.tasks for delete using (auth.uid() = user_id);

create index if not exists tasks_user_schedule_idx
  on public.tasks (user_id, scheduled_date);
create index if not exists tasks_user_deadline_idx
  on public.tasks (user_id, deadline);

-- Optional: turn off public sign-ups in Supabase Authentication settings
-- after your own account has been created.
