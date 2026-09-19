---
impacto: nada_mudou
secao: corrigido
titulo: "Marcar como perdido" para de recusar o motivo digitado em "Outro" quando o funil não tem motivos cadastrados
---

`fn_validate_lost_reason_required` só aceita o motivo canônico do produto (8 códigos em
inglês) somado ao que o funil tem cadastrado em Configurações › Funis — sem exceção para
funil sem cadastro nenhum. A janela "Marcar como perdido" só validava o texto livre digitado
em "Outro" contra essa lista quando o funil JÁ tinha motivos cadastrados; sem cadastro (o caso
comum, inclusive toda instalação nova) qualquer texto era aceito na tela e recusado pelo banco
no clique, com um erro cru do Postgres (`internal_error` / `lost_reason_invalid`) em vez de uma
mensagem que dissesse o que fazer.

Agora a mesma validação vale nos dois casos: texto que o banco recusaria é barrado ANTES do
clique, com a mensagem já existente e a dica de onde cadastrar um motivo novo. De defesa em
profundidade, `/api/v1/leads/[id]/lose` e `/win` (a função `encerraDemanda`, compartilhada com
a capacidade de encerramento da IA) passam a traduzir essa mesma recusa do banco em 422
`lost_reason_invalid`, como as rotas de arrasto, lote e troca de funil já faziam — em vez de
500 `internal_error`.
