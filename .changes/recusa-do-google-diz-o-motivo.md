---
impacto: capacidade_nova
secao: corrigido
titulo: A recusa do Google passa a dizer o que aconteceu
---

Quando o Google recusava uma alteração da Agenda, a tela mostrava apenas
**"Google HTTP 400"** — e nada mais. O Google já tinha dito o motivo na resposta
(`invalid`, `insufficientPermissions`, `rateLimitExceeded`…), mas esse motivo era
descartado antes de virar a frase que fica gravada no compromisso: sobrava um
código que não diz o que consertar.

Agora a frase exibida carrega o motivo que o Google mandou, e ele muda conforme o
caso:

- **convite para alguém que não pode ser convidado**, ou dado do compromisso
  recusado na validação → o motivo aparece junto do compromisso, e o que corrigir
  está dito
- **sem permissão sobre aquele calendário** (conta conectada que perdeu o
  acesso) → a tela aponta a reconexão, em vez de um erro genérico
- **cota do Google estourada** → a frase diz que é limite e que basta esperar,
  em vez de sugerir defeito
- **compromisso apagado no Google** → a frase distingue a versão perdida da
  versão alterada

O compromisso que o Google recusou continua marcado com erro e continua sendo
reexaminado pela sincronização, exatamente como antes — o que muda é que a frase
deixa de ser um número solto. Nome e e-mail de convidado **não** entram nessa
frase, porque ela é gravada e mostrada na tela.

Você não precisa fazer nada para adotar. Se algum compromisso estava com erro de
sincronização sem explicação, a próxima tentativa já traz o motivo escrito.
