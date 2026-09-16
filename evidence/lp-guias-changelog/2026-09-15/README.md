# Prova em tela — guias do assistente e changelog da LP

Medido em 2026-09-15 contra `next build` + `next start` do `deskcomm-site` (branch
`feat/guias-e-changelog`, commit `ac55a44`), Chromium via Playwright, lendo o `CHANGELOG.md`
real da `main` do produto (40 versões).

```bash
BASE=http://localhost:3217 OUT=/tmp/telas node evidence/lp-guias-changelog/2026-09-15/prova.mjs
```

| o que | resultado |
|---|---|
| verificações | 533 verdes, 0 vermelhas (`run.txt`) |
| erros de console e de rede | 0 |
| larguras do cabeçalho | 360, 390, 640, 768, 900, 1024, 1100, 1180, 1280 e 1440 px, nos três idiomas |

O que a prova percorre, como uma pessoa faria:

- **Cabeçalho da home.** Botão dos guias visível e clicável, item nenhum fora da tela, nenhum
  link quebrando linha, e o rótulo certo por largura.
- **Da home aos guias pelo botão.** `lang` e canonical da página, fontes carregadas, filtro de
  público, abas por clique e por teclado, botão de copiar com a área de transferência conferida,
  FAQ e seletor de idioma para a MESMA página.
- **Do rodapé ao changelog.** 40 versões, busca com e sem acento, estado vazio com "limpar",
  filtro "requer atenção", cartão da mais recente, texto marcado `lang="pt-BR"`, aviso e link de
  tradução em en/es, e "versão anterior".
- **Versões escritas à mão.** 1.0.0, 1.2.1, 1.3.0 e 1.6.0: ids únicos, nenhum `**` cru,
  citação, código e introdução.
- **Em toda página.** Nenhuma rolagem horizontal, e nenhum vazamento de `undefined`, `NaN`,
  `null`, `[object Object]` ou `{v}`.

Três defeitos apareceram nas rodadas anteriores e foram consertados antes desta:

- **Espanhol em 1024px.** O cabeçalho passava 29px da tela.
- **Celular.** O comando de instalação ficava cortado.
- **Changelog em 360px.** A data transbordava 4px da coluna. Esse defeito nasceu do conserto de
  outro.

## Segunda rodada: o preview da Vercel

Em 2026-09-16 a mesma prova rodou contra o preview do PR na Vercel, com um segredo de bypass
temporário, revogado logo depois. O resultado está em `run-vercel-preview.txt`.

| o que | resultado |
|---|---|
| verificações | 533 verdes, 0 vermelhas |
| versões lidas | 42, com a mais nova v1.28.0 |

A régua do script passou a vir do próprio `CHANGELOG.md`: o número de versões e a mais nova são
lidos na hora, e não escritos à mão.

O preview foi construído com 40 versões. A 1.27.3 e a 1.28.0 saíram depois do build e apareceram
sem nova implantação. As páginas dessas duas versões, que não existiam no build, abriram com 200
nos três idiomas.

Duas coisas vistas no caminho, as duas esperadas:

- **O primeiro acesso depois da janela de 10 minutos devolve a lista antiga e agenda a nova.** A
  página em inglês mostrou 40 na primeira visita. A em espanhol listou a 1.28.0 só no segundo
  pedido. Por isso o passo do `release.yml` repete a sonda em vez de conferir uma vez só.
- **Um script com o número de versões escrito à mão quebra a cada release.** A versão anterior
  deste script reprovou por isso.

Não medido: o passo novo do `release.yml`, que só roda num corte de release real.
