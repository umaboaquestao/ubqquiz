-- Executar uma vez no SQL Editor do mesmo projeto Supabase do Quiz Live.
-- Tabelas privadas: respostas certas e tokens nunca são expostos pela API.
begin;
create schema if not exists quiz_private;
revoke all on schema quiz_private from public, anon, authenticated;
create table if not exists quiz_private.open_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  title text not null,
  questions jsonb not null,
  closes_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists quiz_private.open_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references quiz_private.open_rooms(id) on delete cascade,
  token uuid not null,
  name text not null check (char_length(name) between 1 and 24),
  next_index integer not null default 0,
  score integer not null default 0,
  completed_at timestamptz,
  unique(room_id, token),
  unique(room_id, name)
);
alter table quiz_private.open_rooms enable row level security;
alter table quiz_private.open_players enable row level security;
revoke all on all tables in schema quiz_private from public, anon, authenticated;

create or replace function public.create_open_quiz(p_title text, p_questions jsonb, p_closes_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare code text; q jsonb; room quiz_private.open_rooms;
begin
  if p_closes_at is null or p_closes_at <= clock_timestamp() then raise exception 'Escolhe um prazo no futuro.'; end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 200 then raise exception 'Nome de quiz inválido.'; end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then raise exception 'Perguntas inválidas.'; end if;
  if jsonb_array_length(p_questions) not between 1 and 500 then raise exception 'Escolhe entre 1 e 500 perguntas.'; end if;
  for q in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(q->'question') is distinct from 'string' or length(trim(q->>'question')) = 0
      or jsonb_typeof(q->'answers') is distinct from 'array'
      or jsonb_typeof(q->'correct') is distinct from 'number'
      or (q->>'correct') not in ('0','1','2','3') then raise exception 'Pergunta inválida.'; end if;
    if jsonb_array_length(q->'answers') <> 4 or exists (
      select 1 from jsonb_array_elements(q->'answers') a
      where jsonb_typeof(a) <> 'string' or length(trim(a #>> '{}')) = 0
    ) then raise exception 'São necessárias quatro respostas por pergunta.'; end if;
  end loop;
  loop
    code := 'UBQA' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into quiz_private.open_rooms(room_code,title,questions,closes_at)
        values(code,trim(p_title),p_questions,p_closes_at) returning * into room;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('room_code',room.room_code,'closes_at',room.closes_at);
end $$;

create or replace function public.join_open_quiz(p_code text, p_name text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room quiz_private.open_rooms; player quiz_private.open_players; safe_questions jsonb;
begin
  select * into room from quiz_private.open_rooms where room_code = upper(trim(p_code)) for share;
  if not found then raise exception 'Sala não encontrada. Confirma o código.'; end if;
  if p_token is null then raise exception 'Identificação inválida.'; end if;
  select * into player from quiz_private.open_players where room_id = room.id and token = p_token;
  if not found then
    if clock_timestamp() >= room.closes_at then raise exception 'Esta sala já encerrou.'; end if;
    if p_name is null or char_length(trim(p_name)) not between 1 and 24 then raise exception 'Introduz um nome com 1 a 24 caracteres.'; end if;
    begin
      insert into quiz_private.open_players(room_id,token,name) values(room.id,p_token,trim(p_name)) returning * into player;
    exception when unique_violation then
      select * into player from quiz_private.open_players where room_id = room.id and token = p_token;
      if not found then raise exception 'Esse nome já está nesta sala. Escolhe outro.'; end if;
    end;
  end if;
  select jsonb_agg(jsonb_build_object('question',q->'question','answers',q->'answers') order by n)
    into safe_questions from jsonb_array_elements(room.questions) with ordinality as items(q,n);
  return jsonb_build_object('questions',safe_questions,'next_index',player.next_index,'score',player.score,'closes_at',room.closes_at);
end $$;

create or replace function public.answer_open_quiz(p_code text, p_token uuid, p_index integer, p_answer integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room quiz_private.open_rooms; player quiz_private.open_players;
begin
  select * into room from quiz_private.open_rooms where room_code = upper(trim(p_code)) for share;
  if not found then raise exception 'Sala não encontrada.'; end if;
  select * into player from quiz_private.open_players where room_id = room.id and token = p_token for update;
  if not found then raise exception 'Entra novamente na sala.'; end if;
  -- Uma repetição após uma falha de rede devolve o estado sem pontuar novamente.
  if p_index < player.next_index then return jsonb_build_object('next_index',player.next_index,'score',player.score); end if;
  if clock_timestamp() >= room.closes_at then raise exception 'O prazo da sala terminou. As respostas anteriores ficaram guardadas.'; end if;
  if p_index is null or p_index <> player.next_index or p_index >= jsonb_array_length(room.questions)
    or p_answer is null or p_answer not between 0 and 3 then raise exception 'Resposta inválida. Volta a entrar para retomar.'; end if;
  update quiz_private.open_players set
    score = score + case when (room.questions->p_index->>'correct')::integer = p_answer then 100 else 0 end,
    next_index = next_index + 1,
    completed_at = case when next_index + 1 = jsonb_array_length(room.questions) then clock_timestamp() else null end
    where id = player.id returning * into player;
  return jsonb_build_object('next_index',player.next_index,'score',player.score);
end $$;

create or replace function public.open_quiz_board(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room quiz_private.open_rooms; players jsonb;
begin
  select * into room from quiz_private.open_rooms where room_code = upper(trim(p_code));
  if not found then raise exception 'Sala não encontrada.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'score',score,'completed',completed_at is not null,'position',position) order by score desc,name),'[]'::jsonb)
    into players from (select name,score,completed_at,dense_rank() over(order by score desc) as position from quiz_private.open_players where room_id = room.id) ranked;
  return jsonb_build_object('title',room.title,'closes_at',room.closes_at,'closed',clock_timestamp() >= room.closes_at,'players',players);
end $$;

revoke all on function public.create_open_quiz(text,jsonb,timestamptz) from public;
revoke all on function public.join_open_quiz(text,text,uuid) from public;
revoke all on function public.answer_open_quiz(text,uuid,integer,integer) from public;
revoke all on function public.open_quiz_board(text) from public;
grant execute on function public.create_open_quiz(text,jsonb,timestamptz) to anon, authenticated;
grant execute on function public.join_open_quiz(text,text,uuid) to anon, authenticated;
grant execute on function public.answer_open_quiz(text,uuid,integer,integer) to anon, authenticated;
grant execute on function public.open_quiz_board(text) to anon, authenticated;
commit;
