---
impacto: nada_mudou
secao: corrigido
titulo: O sinal de presença deixa de poder encher o registro de auditoria
---

O sinal de presença do atendente, que saiu na 1.34.0, faz uma batida por aba a cada 60 segundos. Agora só a PRIMEIRA batida de cada pessoa deixa uma entrada no registro de auditoria — que é a que cria a linha e acorda o roteamento, o único efeito que outra pessoa sente. As batidas seguintes não registram nada, pela mesma régua que já vale para a rodada de cron que não fez nada: audita-se quando houve efeito, nunca se deixa de auditar por comodidade.

Sem isso, uma instalação com oito atendentes de plantão somaria cerca de 3.800 entradas de auditoria por turno de oito horas, sem que ninguém tivesse feito nada — e o registro de auditoria é onde se procura quem fez o quê quando algo dá errado.

Nada a fazer na instalação: o comportamento muda sozinho na atualização, e nenhuma entrada já gravada é tocada.
