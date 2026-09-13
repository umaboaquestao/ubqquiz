create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  host_token text not null,
  status text not null default 'lobby' check (status in ('lobby', 'question', 'results', 'finished')),
  question_index integer not null default 0,
  question_started_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.quiz_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  score integer not null default 0,
  answered_at timestamptz,
  answer_index integer,
  connected_at timestamptz not null default now(),
  unique (session_id, name)
);

alter table public.quiz_sessions enable row level security;
alter table public.quiz_players enable row level security;

create policy "Anyone can read active sessions"
  on public.quiz_sessions for select using (true);

create policy "Anyone can create a session"
  on public.quiz_sessions for insert with check (true);

create policy "Anyone can read players"
  on public.quiz_players for select using (true);

create policy "Anyone can join a session"
  on public.quiz_players for insert with check (true);

create policy "Players can submit answers"
  on public.quiz_players for update using (true) with check (true);

alter table public.quiz_sessions replica identity full;
alter table public.quiz_players replica identity full;

begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
  alter publication supabase_realtime add table public.quiz_sessions;
  alter publication supabase_realtime add table public.quiz_players;
commit;
