---
impacto: nada_mudou
secao: corrigido
titulo: O intervalo antes do atendimento passou a valer também na hora de marcar
---

Se você configurou um intervalo antes (ou depois) do atendimento — aquele tempo de respiro entre um compromisso e outro —, a lista de horários livres já o respeitava: o horário colado no vizinho nem aparecia. Na hora de MARCAR (pela IA, por token ou por webhook) não: a conferência olhava só a janela do próprio atendimento, o compromisso vizinho ficava fora dela e o horário era aceito, mesmo invadindo o intervalo que você pediu para guardar. Agora a conferência da escrita lê a ocupação pelo mesmo intervalo que a lista usa, e as duas pontas ficam na mesma régua. Nada para configurar: os agendamentos que já existem seguem como estão.

Crédito: @webtecnica.
