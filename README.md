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

## Executar localmente

```bash
npm install
npm run dev
```
