---
impacto: nada_mudou
secao: corrigido
titulo: Mensagens enviadas pela API ou pelo MCP respeitam o ritmo do número de WhatsApp
---

Quem enviava mensagens com token de API (`POST /api/v1/messages` com `Authorization: Bearer`) ou pelas ferramentas de envio do MCP passava direto para o WhatsApp. Não havia intervalo entre uma mensagem e outra, o limite diário e o aquecimento do número eram ignorados, e esses envios nem entravam na contagem do dia. Um script ou um agente externo em laço podia disparar centenas de mensagens seguidas pelo mesmo número, que é o padrão que leva o WhatsApp a banir o número.

Agora esses envios esperam o intervalo mínimo do número, como o agente do CRM já esperava, e entram na contagem diária. Quando o número atinge o limite do dia, a API responde `429 rate_limited`, informa o motivo e o horário de liberação (`libera_em`) e envia o cabeçalho `Retry-After`. A rota REST por token também passa a ter o mesmo teto de chamadas por minuto que o MCP já tinha.

O envio feito pela tela, por um atendente, não muda. O canal oficial da Meta também não, porque não corre risco de banimento. O operador não precisa fazer nada, mas uma integração que dispara em massa pela API passa a receber `429` e precisa esperar o `Retry-After`.

Contribuição de @bossprt (#1487).
