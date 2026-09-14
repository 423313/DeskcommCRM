---
impacto: capacidade_nova
secao: adicionado
titulo: Outro sistema já pode enviar mensagem pelo seu WhatsApp, usando um token
---

Até agora, enviar uma mensagem pela API exigia estar logado no navegador. Um
sistema externo não conseguia, mesmo com um token válido: a porta respondia
"não autenticado" antes de olhar o token.

Enviar uma mensagem e abrir uma conversa a partir de um telefone passam a
aceitar também um token de servidor, o mesmo que já era usado para consultar
contatos. A organização continua saindo do token, nunca do que foi enviado no
pedido, então um token de uma empresa não alcança a conversa de outra. Token
de leitura continua sem poder enviar.

Quem usa o sistema pela tela não vê diferença nenhuma.
