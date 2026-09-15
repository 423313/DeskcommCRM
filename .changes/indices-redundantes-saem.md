---
impacto: nada_mudou
secao: alterado
titulo: Três índices redundantes saem do banco
---
O banco mantinha três índices cujo trabalho já era feito por outro índice da mesma tabela. Eles cobravam o preço em toda gravação e ocupavam espaço em disco. Foram removidos na atualização. As buscas que os usavam continuam atendidas por índice — o maior, da mesma tabela — e nenhuma proteção contra duplicidade foi perdida.
