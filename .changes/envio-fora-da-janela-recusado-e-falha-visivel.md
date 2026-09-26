---
impacto: capacidade_nova
secao: alterado
titulo: Envio fora da janela de 24 horas é recusado na hora e a falha de entrega vira gatilho
---

Quem integra por token em canal oficial passa a receber `422 janela_fechada` ao mandar texto livre com a janela de 24 horas fechada, em vez de `201` seguido de recusa silenciosa da plataforma (código 131047). A resposta traz `use: "template"`, `ultima_mensagem_do_cliente` e `codigo_plataforma`; nada é gravado como enviado. Modelo aprovado, canais sem janela (QR) e quem digita na tela continuam iguais.

A falha de entrega passa a ser visível de fora: a recusa que chega pelo webhook de status e a falha de pré-voo do próprio envio emitem o gatilho `message.failed` uma vez por falha, com `message_id`, `conversation_id`, `contact`, `sent_via` e `erro { codigo, titulo }`. A mensagem que fica presa em "enviando" e é marcada como falha depois de 5 minutos emite o mesmo formato, com `erro.codigo = send_timeout`. Quem precisar ser avisado cria uma regra de automação com ação de webhook sobre esse gatilho.

A mudança de resposta vale para quem envia texto livre fora da janela: de `201` para `422`. É a correção do defeito, e a troca é usar modelo aprovado — o mesmo caminho que a tela já sugere.

Contribuição de @webtecnica (#1677).
