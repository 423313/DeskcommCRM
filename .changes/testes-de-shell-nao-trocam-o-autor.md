---
impacto: nada_mudou
secao: corrigido
titulo: Os testes do kit param de trocar o autor dos commits de quem os roda
---
Cinco testes de shell (`pnpm test:shell`) montam repositórios git descartáveis e gravavam neles uma identidade de mentira com `git -C <pasta> config user.*`. Só que o git grava onde ele *resolve* o repositório, e isso não é necessariamente a pasta pedida. Um `GIT_DIR` herdado, por exemplo quando a suíte roda de dentro de um hook, passa por cima do `-C`, e uma pasta que não é repositório sobe até o repositório de cima. Em 10/09/2026 isso deixou `Pessoa <alguem@fork.dev>` no `.git/config` de um checkout de desenvolvimento, e essa identidade assinou 829 dos 987 commits (sem merge) que entraram na `main` até 18/09.

Agora cada um desses testes zera o ambiente do git herdado e dá a identidade de commit por variável de ambiente. Onde o próprio config é o dado sob teste, a escrita vai direto no arquivo de config do clone, sem resolver repositório. Uma guarda estática (`tests/unit/testes-de-shell-nao-vazam-identidade.test.ts`) reprova a volta de qualquer uma das duas formas. Nada muda para quem opera uma instalação.
