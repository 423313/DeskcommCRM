---
impacto: nada_mudou
secao: corrigido
titulo: Envio de integração por token deixa de aparecer como se fosse da IA
---
Uma integração que manda mensagem pelo CRM com um token de servidor (o caminho do servidor MCP) tinha o envio registrado como se tivesse saído da IA: o balão da conversa mostrava "IA" e as telas que contam o que a IA falou somavam esse movimento. Na agenda acontecia o mesmo com o compromisso marcado por token, que nascia como "Marcado pelo atendente de IA". Nos dois casos, o dado afirmava uma autoria que não existia.

A partir desta versão, quem envia por token é registrado como o SISTEMA, separado da IA: o balão passa a dizer "Sistema", o compromisso passa a dizer "Marcado pelo sistema", e as contagens de IA deixam de incluir esse envio. Nada muda para quem responde pelo WhatsApp do celular nem para quem digita no CRM.

Não há nada a fazer na atualização. As linhas já gravadas ficam exatamente como estão — não há reescrita de histórico — e só os envios novos recebem o rótulo certo. Envios de automação continuam registrados como antes: movê-los junto mexe na mesma leitura e é decisão de produto à parte.

Contribuição de @webtecnica.
