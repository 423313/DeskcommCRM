---
impacto: capacidade_nova
secao: corrigido
titulo: "\"Testar agente\" devolve a resposta, e para de gastar crédito em triplo"
---

Testar um agente gastava crédito e não mostrava nada. O painel de resultado
ficava em "Nenhum teste executado ainda" mesmo com o modelo tendo respondido.

A espera do navegador era de 10 segundos, e um teste de agente leva mais que
isso: ele roda o motor inteiro, com as ferramentas e as verificações. Passados
os 10 segundos o navegador desistia — mas o servidor não: ele terminava o
trabalho e devolvia para ninguém.

Pior, ao desistir o navegador tentava de novo, até três vezes. Cada clique em
"Executar teste" podia virar três execuções completas do modelo, as três
cobradas, nenhuma aparecendo na tela.

Agora o teste espera o tempo que precisa, e a resposta aparece.

A regra vale para o produto inteiro, não só para essa tela: quando uma operação
que ESCREVE fica sem resposta, o sistema não a repete mais. Ficar sem resposta
não quer dizer que não aconteceu — quer dizer que não se sabe, e repetir uma
escrita nessa dúvida é o que cobra duas vezes. Buscas e listagens continuam
sendo tentadas de novo normalmente, porque ler de novo não custa nem duplica
nada.
