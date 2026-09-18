---
impacto: nada_mudou
secao: corrigido
titulo: O follow-up espera a janela abrir sem desistir do contato
---

Quando um passo de mensagem caía fora do horário permitido de envio — a noite,
o domingo fechado, ou a faixa de horário que você escolheu —, o acompanhamento
já reagendava a mensagem corretamente para a próxima abertura. O problema era o
outro lado: o motor do fluxo não ficava sabendo do adiamento, continuava
perguntando "essa mensagem já saiu?" e, depois de cerca de onze horas
perguntando, desistia do contato. Na tela aparecia o aviso
**"Um fluxo de follow-up parou de tentar"**, e o motivo registrado dizia que a
mensagem nunca tinha sido concluída — o que era falso: ela estava só esperando
o horário que você mesmo configurou. Uma janela que fechasse no sábado à noite
e só reabrisse na segunda já passava desse limite.

Agora o passo diz que está esperando, e diz até quando. O motor guarda o
contato parado até a hora da abertura em vez de gastar tentativas, o dossiê do
acompanhamento mostra a linha
**"Segurou o envio até o horário permitido"** com a data, e a desistência
automática continua existindo para o que ela sempre serviu: um envio que de
fato travou, sem sinal de vida nenhum.

Nada muda para quem opera: nenhuma variável nova, nenhum ajuste, nenhum passo
na atualização. Contatos que já tinham sido dados como perdidos por esse motivo
não voltam sozinhos — o conserto vale dos próximos em diante.
