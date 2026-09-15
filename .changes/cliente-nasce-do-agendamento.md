---
impacto: capacidade_nova
secao: adicionado
titulo: O CRM pode reconhecer quem já é cliente pela agenda
---
Nova regra em Configurações › Tipos de agendamento, desligada em toda organização: quando um administrador liga “Clientes pela agenda”, todo contato com horário marcado ganha a etiqueta “cliente” e a data de “Cliente desde” na ficha — o dia em que o primeiro horário foi combinado, nunca uma data futura —, e quem já tinha horário marcado ganha na hora de ligar. Horário cancelado, falta e horário apagado não contam: se não sobrar nenhum, sai a etiqueta que o sistema pôs, e a que a equipe pôs à mão fica. Se alguém da equipe tirar a etiqueta, ela não volta. As automações “Quando um contato ganhar uma tag” disparam uma vez por contato, na primeira vez que ele vira cliente com a regra ligada: não disparam para quem já era cliente ao ligar, nem de novo para quem cancela e marca outra vez, nem ao juntar contatos duplicados. Com a regra ligada, a tela de Funis permite marcar um “funil de clientes”, onde abre o negócio de quem já é cliente e volta a escrever. Atualizar não muda nada em organização nenhuma até alguém ligar a regra. Contribuição de @423313 (PR #867).
