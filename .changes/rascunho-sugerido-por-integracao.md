---
impacto: capacidade_nova
secao: adicionado
titulo: A conversa pode abrir com um texto sugerido por outro sistema, pronto para revisar
---

Quem integra o CRM com outro sistema (ERP, formulário, automação) precisa mandar
uma mensagem que **só pode sair de uma pessoa**: a cobrança vencida, o documento
que falta, o formulário a reenviar. Até aqui havia duas saídas, e as duas ruins —
enviar por token (a conversa mostrava "Sistema", sem dizer que pessoa decidiu) ou
copiar e colar o texto à mão.

Agora o texto fica **guardado no servidor**: a integração cria um rascunho pela
API (`POST /api/v1/conversations/{id}/drafts`) ou pela ferramenta MCP
`crm_create_conversation_draft` e recebe o link da conversa. Ao abrir o link, a
caixa de entrada já mostra o texto no campo de resposta, com a faixa
*"Texto sugerido por {origem}. Revise antes de enviar."* — e
**nada é enviado sem o clique** de quem atende. Quando a mensagem sai, o
rascunho é marcado como usado, com quem o usou.

O rascunho vale 24 horas, é de uso único e é da mesma empresa: um token de uma
organização não cria rascunho na conversa de outra. Se o link vencer, já tiver
sido usado ou apontar para outra conversa, a conversa abre normalmente, sem o
texto e com o aviso dizendo por quê.

Quem opera não precisa fazer nada: a capacidade vem da atualização, e o envio
continua sendo decisão de gente, do jeito que já era.

Contribuição de @webtecnica (#1684).
