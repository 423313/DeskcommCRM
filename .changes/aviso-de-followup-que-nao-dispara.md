---
impacto: capacidade_nova
secao: adicionado
titulo: A Central avisa quando um follow-up publicado não está disparando
---

Um fluxo de follow-up com gatilho automático — silêncio, etapa do funil, atendimento aberto ou
falta a compromisso — só cria acompanhamento se **algum agente publicado tiver esse fluxo ligado**
em "follow-ups que arma". Faltando esse vínculo, nada acontecia e nada avisava: o fluxo aparecia
publicado na tela, com o gatilho configurado, e nenhum contato entrava. Sem erro, sem log, sem
sinal. Quem publicou achava que tinha ligado o follow-up, e a descoberta vinha semanas depois —
pela pergunta "por que ninguém recebeu mensagem?".

Agora a Central de avisos abre um aviso por fluxo nessa situação, dizendo qual fluxo é, quando ele
dispararia e os três passos que consertam. O aviso **se resolve sozinho** assim que o vínculo com o
agente existir — ninguém precisa fechá-lo à mão, e ele não fica pedindo algo que já foi feito.

Fluxos **manuais** e os disparados por **regra em Webhooks** ficam de fora: eles funcionam sem
agente nenhum, e avisar sobre eles seria alarme falso.

A verificação roda de hora em hora. Em quem instala pela VPS ela entra junto com a atualização,
sem nenhuma edição de arquivo — o agendador do kit já vem com ela.
