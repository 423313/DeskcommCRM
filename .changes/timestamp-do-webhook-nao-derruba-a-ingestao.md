---
impacto: nada_mudou
secao: corrigido
titulo: Mensagem com horário em formato inesperado não se perde mais
---

O aviso que o WhatsApp manda ao CRM traz o horário da mensagem, quase sempre em segundos. Quando ele vinha em outra unidade — milissegundos ou nanossegundos, o que acontece quando há um intermediário entre o WhatsApp e o CRM —, o cálculo do horário estourava e o aviso inteiro falhava: a mensagem do cliente não entrava, e nada na tela dizia por quê. Agora a unidade é reconhecida pela ordem de grandeza, e um horário ausente ou sem sentido vira a hora da chegada em vez de derrubar a entrada. Nenhuma mensagem se perde por causa disso.

Contribuição de @vgamkt (#1130).
