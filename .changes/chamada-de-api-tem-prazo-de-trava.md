---
impacto: capacidade_nova
secao: corrigido
titulo: Botões que dependem do banco param de travar a instalação inteira quando o atendimento está ocupado
---

Medido numa instalação real. O botão **Enviar link ao cliente** (do Google Meet) parecia não funcionar: aparecia *"Erro inesperado. Tente novamente."*, sem nenhuma pista, e clicar de novo não resolvia.

O que acontecia por baixo: a operação pede uma reserva no banco para não atropelar um atendimento em curso — e essa espera **não tinha prazo**. O navegador desistia em 10 segundos e mostrava o erro, mas **o pedido continuava vivo no banco**, segurando a fila. Como o botão voltava a funcionar, cada clique empilhava mais um pedido atrás do anterior.

Com dez pedidos empilhados, o banco de dados da instalação foi a **357% de processador** — e nada mais respondia bem, inclusive telas que não tinham nada a ver com aquilo.

Agora toda chamada da aplicação desiste de esperar em 4 segundos e diz o motivo: *"Este atendimento está ocupado neste instante. Aguarde alguns segundos e tente de novo."* Nada fica pendurado, e a frase diz o que fazer.

O conserto vale para **toda** a aplicação, não só para esse botão: sete operações tinham a mesma forma, incluindo **Aprovar e enviar** (da sugestão de resposta), **mesclar contatos**, **conectar canal** e **anonimizar contato** da LGPD. O trabalho de fundo (filas e agendadores) continua podendo esperar o tempo que precisar — lá não há ninguém olhando a tela.

Nada muda para quem opera: sem passo manual, sem mexer em configuração.
