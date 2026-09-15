---
impacto: nada_mudou
secao: alterado
titulo: Três índices redundantes saem do banco
---
O banco mantinha três índices cujo trabalho já era feito integralmente por outro índice da mesma tabela. Eles não aceleravam consulta nenhuma e cobravam o preço em toda gravação, além de ocupar espaço em disco. Foram removidos. Nenhuma consulta fica mais lenta e nenhuma proteção contra duplicidade foi perdida.
