---
impacto: nada_mudou
secao: corrigido
titulo: Trocar de aba logo depois de digitar na busca para de voltar à aba anterior
---

Quem digitava na busca do Inbox e trocava de aba em seguida, rápido, era devolvido
à aba anterior sem ter pedido. A busca continuava a valer, mas a aba voltava
sozinha — e quem não sabia do problema não tinha como adivinhar a causa.

Acontecia porque o envio da busca esperava um instante depois da última tecla, e
nesse instante ele guardava também qual aba estava aberta na hora da digitação.
Ao ser enviado, levava a aba velha junto.

Agora ele envia apenas o que foi digitado.

Você não precisa fazer nada para adotar. Crédito: @paulolimajr77
