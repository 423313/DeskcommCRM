---
impacto: nada_mudou
secao: corrigido
titulo: A agenda para de chamar de falha do servidor o erro de quem chamou errado
---

A listagem da agenda respondia "erro do servidor" para toda recusa que não fosse
"falta um recorte". O caso que apareceu na prática é o id de um CONTATO enviado
no lugar do id de um negócio — a mesma troca que a #509 mediu. A consulta era
recusada corretamente, mas a resposta dizia que o problema era do servidor: a
tela tratava como falha nossa, e o monitoramento de erros contava como incidente
uma requisição que só estava com o parâmetro trocado.

Agora essa recusa sai como erro de quem chamou, com um código próprio que diz que
o id mandado não é um negócio do funil e que a correção é usar o do contato. O
"erro do servidor" fica reservado para o que é falha de verdade, com teste que
atravessa a rota para separar os dois.

Você não precisa fazer nada.

Achado e corrigido por @webtecnica.
