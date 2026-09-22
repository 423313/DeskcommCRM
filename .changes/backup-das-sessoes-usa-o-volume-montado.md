---
impacto: nada_mudou
secao: corrigido
titulo: O backup das sessões do WhatsApp passa a arquivar o volume que o contêiner usa de verdade
---

O `backup.sh` do kit montava o volume das sessões pelo nome declarado no `compose` (`waha-data`), e o Docker então criava um volume novo e vazio com esse nome: o `waha-*.tgz` saía com o tar de um diretório vazio (~87 bytes) e o passo ainda anunciava `✓ sessões WhatsApp salvas`, de modo que o pareamento do WhatsApp só se dava por perdido no dia do restore. Agora o volume é resolvido pela montagem real do contêiner `waha` no destino `/app/.sessions` — vale tanto volume nomeado (usa o nome físico, com o prefixo do projeto) quanto pasta do host (bind), e o nome declarado no `compose` fica só para quando o contêiner não existe. Se a montagem resolvida não tiver sessão gravada, o arquivo vazio não entra no backup: o passo avisa que o pareamento não foi salvo em vez de anunciar sucesso.
