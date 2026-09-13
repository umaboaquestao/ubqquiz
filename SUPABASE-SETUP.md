# Ligar o realtime

1. Cria um projeto em https://supabase.com/dashboard.
2. No projeto, abre **SQL Editor**.
3. Cola todo o conteúdo de `supabase-schema.sql` e executa.
4. Abre **Project Settings > API**.
5. Copia a **Project URL** e a chave pública **anon / publishable key**.
6. Cola os valores em `src/supabase.js`.

Nunca uses a chave `service_role` no browser.

Depois disso, a aplicação pode criar salas, aceitar participantes e receber alterações em realtime através das tabelas `quiz_sessions` e `quiz_players`.
