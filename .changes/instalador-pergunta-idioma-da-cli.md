---
impacto: capacidade_nova
secao: adicionado
titulo: O instalador pergunta em que idioma ele mesmo fala — português ou español
---

O `install.sh` estava inteiramente em português, mesmo permitindo escolher espanhol como idioma da aplicação web instalada: um operador hispanohablante precisava entender português para concluir a própria instalação. Agora a primeira pergunta interativa, antes de qualquer outra saída, é o idioma da instalação (Português/Español), e as mensagens do instalador saem nesse idioma; a saída de outros programas, como `docker` e `git`, continua como vem deles. A escolha é gravada em `DESKCOMM_IDIOMA_CLI` no `.env` e, nas reexecuções, o `install.sh` a lê de lá e não pergunta de novo, nem com `--yes`. Quem prefere fixá-la sem perguntar pode rodar com `DESKCOMM_IDIOMA_CLI=es` (ou `pt-BR`) no ambiente. Sem escolha e sem terminal, o instalador fala português, como sempre falou. O espanhol exige bash 4.4 ou superior (o CentOS 7 traz o 4.2): em um bash mais antigo o instalador avisa, em português e em espanhol, e segue em português. Fora do escopo desta passada: `update.sh`, `backup.sh`, `diagnostico.sh` e os demais scripts do kit seguem só em português, mesmo com a chave no `.env`; ficam para uma extensão do mesmo mecanismo (`hostgator-setup-kit/_i18n.sh`).
