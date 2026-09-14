---
impacto: capacidade_nova
secao: adicionado
titulo: O pedido que ninguém confirmou solta o horário
---

Quando um tipo de atendimento pede confirmação, o pedido do cliente já reserva o
horário: ele some da lista de horários livres e ninguém mais consegue marcar ali.
É o que faz o modo "o cliente pede, uma pessoa confirma" funcionar.

Faltava o outro lado disso. Um pedido que ninguém abriu segurava a agenda para
sempre, e o efeito era igualzinho ao de agenda cheia: o próximo cliente ouvia
"não tenho horário" por causa de um pedido esquecido.

Agora existe um prazo. Passado ele sem decisão, o horário volta a ser oferecido.
O padrão é 24 horas, e dá para mudar em Agenda, no mesmo lugar dos outros prazos.

Duas coisas que **não** acontecem quando o prazo vence: o cliente não recebe
nenhum aviso, e o pedido dele continua na fila para ser atendido. O que expira é
a reserva do horário, não o pedido.
