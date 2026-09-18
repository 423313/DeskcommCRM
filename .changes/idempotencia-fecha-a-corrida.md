---
impacto: nada_mudou
secao: corrigido
titulo: Repetir a mesma criação pela API não cria o registro duas vezes
---
Quem integra com a API e manda o cabeçalho `Idempotency-Key` ao criar um modelo de mensagem (`POST /api/v1/message-templates`) tinha duas falhas. Repetir o mesmo pedido devolvia 409 `idempotency_conflict` em vez da resposta gravada, porque o resumo do pedido era gravado num formato que a comparação nunca reconhecia. E dois pedidos iguais chegando ao MESMO tempo criavam o modelo duas vezes. Agora a chave é reservada antes da criação: a repetição devolve a resposta original, e o pedido simultâneo recebe 409 `idempotency_in_progress`, que pode ser repetido em instantes. Se a criação falhar, a chave é liberada na hora e a nova tentativa executa normalmente.

O `update.sh` aplica a mudança de banco sozinho (migration 0321), inclusive em quem já tinha a tabela. O operador não precisa fazer nada, e a tela não muda. Diagnóstico e desenho de @webtecnica (PR #1189, issue #778).
