-- Teste de integração; termina em rollback e não deixa salas de teste.
begin;
do $$
declare code text; a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); result jsonb;
begin
  result := public.create_open_quiz('Teste automático UBQ', '[{"question":"Dois mais dois?","answers":["4","3","2","1"],"correct":0},{"question":"Um mais um?","answers":["2","3","4","5"],"correct":0}]', now()+interval '1 hour');
  code := result->>'room_code';
  result := public.join_open_quiz(code,'Jogador A',a);
  assert result->'questions'->0->'correct' is null, 'Resposta certa exposta';
  assert (result->>'next_index')::integer = 0;
  perform public.join_open_quiz(code,'Jogador B',b);
  result := public.answer_open_quiz(code,a,0,0);
  assert (result->>'score')::integer = 100;
  result := public.answer_open_quiz(code,a,0,0);
  assert (result->>'score')::integer = 100, 'Repetição pontuou novamente';
  result := public.join_open_quiz(code,'Jogador A',a);
  assert (result->>'next_index')::integer = 1, 'Retoma falhou';
  perform public.answer_open_quiz(code,b,0,1);
  perform public.answer_open_quiz(code,a,1,0);
  result := public.open_quiz_board(code);
  assert jsonb_array_length(result->'players') = 2;
  assert (result->'players'->0->>'score')::integer = 200;
  assert (result->'players'->0->>'completed')::boolean;
  begin
    perform public.join_open_quiz(code,'Jogador A',gen_random_uuid());
    raise exception 'Nome duplicado foi aceite';
  exception when raise_exception then
    if sqlerrm = 'Nome duplicado foi aceite' then raise; end if;
  end;
  update quiz_private.open_rooms set closes_at=now()-interval '1 second' where room_code=code;
  begin
    perform public.answer_open_quiz(code,b,1,0);
    raise exception 'Resposta fora de prazo foi aceite';
  exception when raise_exception then
    if sqlerrm = 'Resposta fora de prazo foi aceite' then raise; end if;
  end;
  result := public.open_quiz_board(code);
  assert (result->>'closed')::boolean;
end $$;
select 'PASS: pontuação, retoma, repetição, classificação, nomes duplicados e prazo' as resultado;
rollback;
