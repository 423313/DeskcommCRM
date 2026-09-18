---
impacto: nada_mudou
secao: alterado
titulo: O sistema passa a guardar o contexto de cada passagem para uma pessoa
---

Quando o atendimento automático para e chama alguém da equipe, o sistema agora **guarda** o que
aconteceu ali: por que a IA passou, o que ela já tinha tentado, o que o cliente pediu com as
palavras dele, e se ele chegou a ser avisado de que uma pessoa ia responder.

Por enquanto isso é só o lugar onde essa informação vai morar — nada muda na sua tela ainda. As
próximas atualizações mostram esse contexto dentro da conversa, para quem assume não precisar ler
tudo de novo e o cliente não repetir o que já disse.

Duas coisas valem dizer desde já, porque são escolhas e não acaso:

- **Quem não pode ver a conversa também não vê esse contexto.** Se a sua equipe trabalha com
  atendimento separado por pessoa, a regra é a mesma aqui.
- **Isso é apagado junto com o resto** quando um cliente pede para ser esquecido. E o próprio
  sistema limpa os registros antigos depois de cinco anos — menos os de passagens que
  **ninguém assumiu**, que nunca são apagadas por idade: uma passagem em aberto é alguém ainda
  esperando resposta. Se quiser encurtar esse prazo, é `PASSAGEM_RETENTION_DAYS` no `.env`.

Você não precisa fazer nada: a atualização já traz tudo pronto.
