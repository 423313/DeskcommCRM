---
impacto: nada_mudou
secao: corrigido
titulo: Motivo de perda fora da lista agora é recusado na hora, com a frase certa, em vez de erro do banco
---

O banco só aceita, como motivo de perda, os 9 códigos do produto somados ao que o funil tem
cadastrado em Configurações › Funis — e isso vale inclusive para funil sem cadastro nenhum, que
é o caso de toda instalação nova. A janela "Marcar como perdido" só conferia o texto digitado em
"Outro" contra essa lista quando o funil JÁ tinha motivos cadastrados. Sem cadastro, qualquer
texto passava na tela e era recusado pelo banco no clique, com um erro cru do Postgres
(`internal_error` / `lost_reason_invalid`) em vez de uma mensagem que dissesse o que fazer.

**O que muda é QUANDO a recusa acontece, não o que é aceito.** Texto livre continua não sendo
motivo válido; ele passa a ser barrado na hora, com a frase que diz onde cadastrar um motivo
novo, em vez de virar erro do banco depois do clique.

De defesa em profundidade, quem encerra um negócio por `encerraDemanda` — as telas de ganhar e
perder, a duplicação de negócio, a automação e a capacidade de encerramento da IA — passa a
traduzir essa mesma recusa do banco em 422 `lost_reason_invalid`, como as rotas de arrasto,
lote e troca de funil já faziam, em vez de 500 `internal_error`.
