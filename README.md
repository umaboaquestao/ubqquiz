# Quiz UBQ

Quiz UBQ pronto para ser publicado e partilhado por link.

## O que está incluído

- Quiz individual responsivo com cronómetro, pontuação e ecrã final.
- Quiz individual e Quiz Live, cada um com o seu modo de administração.
- Importação de sessões a partir de PDF ou JSON.
- Histórico de resultados individuais e resultados Live.
- Editor de administração para alterar perguntas, respostas certas e tempos.
- Adição, remoção, reposição, importação e exportação das perguntas em JSON.

## Partilhar e administrar

Publique a pasta `UBQquiz` num alojamento estático, como Netlify, Vercel ou GitHub Pages, e partilhe o URL normal com a equipa.

- Quiz: `https://o-seu-link/`
- Administração: `https://o-seu-link/?admin`
- Live: `https://o-seu-link/live/`
- Administração Live: `https://o-seu-link/live/?admin`

No modo de administração, as alterações ficam guardadas neste browser. Use **Exportar perguntas** para criar uma cópia de segurança ou para as levar para outro computador através de **Importar perguntas**.

Para que uma alteração do administrador apareça automaticamente para todos os colaboradores, o editor precisa de uma base de dados com autenticação. Nesta versão estática, o quiz é ideal para partilhar e jogar; o editor permite preparar e transportar facilmente cada conjunto de perguntas.

## Sala com prazo (participação em momentos diferentes)

Antes de publicar este modo, executar [open-quiz-migration.sql](./open-quiz-migration.sql) no SQL Editor do projeto Supabase usado pelo Live. A migração cria tabelas próprias e não altera as salas Live.

- Administração: `aberto/?admin` (também disponível em `quiz/aberto/?admin` no site TIMIlândia).
- O administrador escolhe o quiz e a duração (1 h, 6 h, 24 h, 3 dias, 7 dias ou data/hora personalizada).
- Partilhar o link com o código da sala que aparece na classificação.
- Cada pessoa responde ao seu ritmo até ao prazo. Neste modo não há cronómetro por pergunta; cada resposta certa vale 100 pontos.
- O prazo e a pontuação são validados pelo servidor. Não são aceites respostas após o fecho, mesmo de quem já começou.
- A classificação inclui todos os participantes da sala, indica quem terminou e atualiza a cada 15 segundos. Continua disponível depois do prazo.
- No mesmo navegador, voltar a entrar com o código retoma as respostas anteriores. Limpar o armazenamento ou mudar de dispositivo perde essa identificação. Nomes duplicados na mesma sala são recusados.
- A senha de administração segue o mecanismo local já existente; não equivale a autenticação no servidor. Quem conhece o código pode consultar a classificação.

## Executar localmente

```bash
npm install
npm run dev
```
