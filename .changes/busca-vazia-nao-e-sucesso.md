---
impacto: nada_mudou
secao: corrigido
titulo: A busca do agente que não acha nada para de contar como sucesso
---
A busca de produtos do agente que não encontrava nada **terminava bem** e era auditada como sucesso: o painel de capacidades (`fn_agent_tool_usage`) mostrava "nenhuma falha" enquanto o agente respondia "não temos" para todo cliente — o defeito era invisível justamente para quem precisava vê-lo (issue #484). O número não mentia: ele não existia.

Agora a tool **declara** o vazio que não é sucesso (`motivoDoVazio`) e a auditoria grava a chamada como falha, com o motivo — `nao_encontrado`, `sem_estoque` ou `varredura_parcial`, que são vazios diferentes e passam a ser contáveis um por um. Quem acha continua sucesso, e vazio que é **resposta** (um contato sem pedidos, uma agenda sem compromissos na janela) continua sucesso: só o vazio declarado pela própria tool muda de lado, para o conserto não virar alarme geral.
