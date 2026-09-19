---
impacto: capacidade_nova
secao: adicionado
titulo: Você pode mandar os e-mails do sistema pelo seu próprio servidor
---
Convite de equipe, entrega de dados de LGPD e aviso de prazo podem sair pelo seu próprio servidor de e-mail, em vez de depender de um serviço externo contratado à parte. Quem instala numa VPS deixa de precisar abrir conta em outro lugar para mandar o primeiro convite.

Quem já manda e-mail hoje **não precisa fazer nada**: o caminho anterior continua igual, e nada muda até você decidir preencher a tela nova. Os dois convivem — enquanto a tela de e-mail estiver vazia, a entrega segue pelo serviço que você já usa.

Para ligar: entre em **Admin › E-mail**, preencha o endereço do servidor, a porta, a segurança, o usuário, a senha e o remetente, e use o botão de testar conexão antes de salvar. A partir daí a entrega passa a sair por ele. A senha é guardada cifrada, e a tela nunca a mostra de volta.

Quem prefere configurar pelo arquivo do servidor, sem abrir a tela, tem as variáveis `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` e `SMTP_FROM_NAME` documentadas no `.env.example` — o que estiver na tela vale acima do arquivo.

Crédito: @betoarts.
