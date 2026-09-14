---
impacto: nada_mudou
secao: alterado
titulo: Criar resposta rápida duas vezes com a mesma chave não cria duas
---

Quem chama a API pode repetir com segurança uma criação que não chegou a receber resposta: enviando o cabeçalho `Idempotency-Key` num `POST /api/v1/message-templates`, a segunda chamada com o mesmo conteúdo devolve a resposta da primeira em vez de criar outra resposta rápida, e a mesma chave com conteúdo diferente é recusada com `409`. Nada muda na tela e não há nada a fazer na VPS: a garantia alcança os clientes que mandam a chave, que o cliente HTTP do próprio produto já injeta em toda mutation.

A corrida entre duas chamadas simultâneas com a mesma chave continua aberta — a tabela de recibos só sabe guardar resultado terminal, então fechar essa janela exige mudança de schema, levada como pergunta na issue #778.
