---
impacto: nada_mudou
secao: corrigido
titulo: A guarda de primeira mensagem da origem de site passa a filtrar a organização
---

A origem da página só é gravada quando aquela é a PRIMEIRA mensagem do contato. A consulta que responde isso sai pelo client administrativo — o que passa por cima do isolamento entre organizações que o banco aplica sozinho — e ela não filtrava a organização: filtrava o contato e a direção, e só. A resposta era sobre o contato no banco inteiro, não sobre o contato desta organização.

O filtro passou a vir do chamador, com a organização de quem recebeu o webhook — nunca do corpo da requisição. Medido no `tests/unit/origem-do-site.test.ts` em 18/09/2026: 25 testes verdes; removida apenas a linha do filtro, 2 ficam vermelhos, e o caso de duas organizações responde `false` porque a mensagem de entrada mais antiga daquele contato vinha de fora da fronteira. Nada muda na tela de quem opera: o `contact_id` é uuid e não colide entre organizações, então o resultado de hoje já era o certo. O que muda é a consulta deixar de depender disso.
