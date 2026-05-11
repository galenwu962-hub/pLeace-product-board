create table if not exists public.opening_tasks (
  id text primary key,
  row_number integer,
  title text not null,
  description text,
  department text,
  owner text,
  collaborators text,
  notes text,
  reviewer text,
  start_date date,
  end_date date,
  date_label text,
  time_note text,
  has_confirmed_date boolean default false,
  needs_date_confirmation boolean default false,
  phase text,
  manual_status text,
  status_hint text,
  risk_level text,
  days_to_deadline integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.opening_tasks enable row level security;

create policy "public read opening tasks"
on public.opening_tasks
for select
to anon
using (true);

create policy "public insert opening tasks"
on public.opening_tasks
for insert
to anon
with check (true);

create policy "public update opening tasks"
on public.opening_tasks
for update
to anon
using (true)
with check (true);

create policy "public delete opening tasks"
on public.opening_tasks
for delete
to anon
using (true);
