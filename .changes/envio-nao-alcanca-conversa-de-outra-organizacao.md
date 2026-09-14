---
impacto: nada_mudou
secao: corrigido
titulo: Token de servidor não alcança mais a conversa de outra empresa
---

A porta de saída de mensagem do sistema conferia só o número da conversa, nunca
a empresa dona dela. Para quem envia pela tela isso nunca foi problema: o banco
já filtra por empresa nesse caminho. Mas quem envia por token de servidor — o
agente de IA por MCP, e agora as integrações — entra por um caminho em que esse
filtro do banco não existe, e o único cuidado possível é o do próprio sistema.
Ele faltava.

Na prática: um token de uma empresa, com o número de uma conversa de outra,
gravava e disparava a mensagem pelo WhatsApp da segunda. Agora a conversa de
outra empresa responde "não encontrada", e nada é gravado.

Quem usa o sistema pela tela não vê diferença nenhuma.
