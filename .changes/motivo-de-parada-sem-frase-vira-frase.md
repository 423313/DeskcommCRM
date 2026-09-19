---
impacto: nada_mudou
secao: corrigido
titulo: A aba Atividade deixa de mostrar código no lugar do motivo da parada
---

Na aba **Atividade**, quando uma ação da automação não era executada, a linha
podia mostrar um identificador de máquina no lugar do motivo:
`membro_indeterminado`, por exemplo. Acontecia quando o cadastro do contato não
dizia quem o atende e a consulta que responderia isso falhava na hora — rede
fora do ar, banco sem responder. A ação registrava o código, a tela não tinha
frase para ele, e o que sobrava para quem atendia era o código, sem explicação e
sem a mensagem do erro, que ficava guardada e não aparecia em lugar nenhum.

Agora todo motivo que as ações produzem tem frase. Os motivos que apareciam como
código passam a aparecer em português — em espanhol também, para quem usa o
produto nesse idioma —, dizendo o que aconteceu e o que fazer a respeito.

A segunda mudança é o **detalhe técnico**. Quando a ação guarda a mensagem crua
da falha, ela agora aparece na mesma linha, rotulada como **"Detalhe técnico:"**
e em corpo menor, DEPOIS da frase. A frase continua sendo a leitura principal; a
mensagem técnica é o que quem dá suporte leva ao time que cuida do servidor, e
sem ela não dava para separar "o servidor caiu, tente de novo" de "o cadastro
está errado, conserte o cadastro".

Nada muda para quem opera: nenhuma configuração nova, nenhum ajuste na
atualização. As execuções que já estavam registradas também passam a mostrar a
frase, porque a tradução acontece na hora de exibir.

Uma verificação automática passa a vigiar isto: motivo novo que uma ação comece
a produzir sem frase em português reprova a esteira, apontando o arquivo e a
linha de quem o emitiu — antes de chegar em quem usa.
