---
impacto: nada_mudou
secao: corrigido
titulo: A agenda para de chamar de falha do servidor o erro de quem chamou errado
---

A rota de listagem da agenda (`GET /api/v1/agenda/agendamentos`) respondia
`500 internal_error` para toda recusa que não fosse "falta um recorte": qualquer
erro de quem chamou virava indisponibilidade do servidor aos olhos de quem
integra por API. O caso que apareceu na prática é o `lead_id` preenchido com o id
de um CONTATO — a mesma troca de parâmetros que a #509 mediu. A consulta era
recusada corretamente, mas a resposta dizia que o problema era nosso: um
integrador que monitora o 500 abria chamado, ou acordava alarme, por uma
requisição malformada.

Agora essa recusa sai como `422` com o código próprio
`agenda_listagem_alvo_nao_e_lead`, e a mensagem diz que o `lead_id` mandado não é
um negócio do funil e que a correção é usar o `contact_id`. O `500` continua
guardado para o que é falha nossa, com teste que atravessa a rota de verdade
para separar os dois.

Você não precisa fazer nada para adotar — só quem integra por API e tratava o
500 passa a ver o código certo.

Achado e corrigido por @webtecnica.
