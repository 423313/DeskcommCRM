---
impacto: capacidade_nova
secao: adicionado
titulo: Perguntar à IA sobre um caso antes de decidir
---

Quando o atendimento automático trava, o sistema abre um caso e chama alguém da equipe. Até
agora essa pessoa só tinha o que a IA escreveu na abertura: um título, um resumo e o que ficou
faltando. Se ela quisesse entender mais, tinha de sair do caso, abrir a conversa no Inbox e ler
tudo de novo — ou decidir sem entender.

Agora dá para **perguntar**, ali mesmo, para a mesma IA que abriu aquele caso: "por que você
não resolveu sozinha?", "o que o cliente já tentou?", "ele já pediu isso antes?". Ela lê o
caso, o que a equipe já decidiu, a conversa com o cliente e a memória do atendimento, e
responde em português. A conversa fica guardada no caso: quem pegar o caso depois vê o que o
colega já perguntou, e não refaz as mesmas perguntas.

Três coisas que valem dizer, porque são escolhas e não acaso:

- **O cliente não vê nada disso.** A IA aqui só lê: não envia mensagem, não muda o caso, não
  move ninguém no funil. Se você pedir uma ação, ela diz qual botão da tela faz aquilo.
- **Quem não pode ver a conversa no Inbox também não vê nada aqui.** Se a sua equipe trabalha
  com atendimento separado por pessoa, a regra é a mesma nas duas telas.
- **Qual modelo responde você escolhe**, em IA › Provedores, no ponto "Conversar sobre o caso
  com a equipe". O gasto aparece em Uso de IA como qualquer outra chamada, e o teto mensal que
  você definiu vale aqui também.

As perguntas e respostas são apagadas junto com o resto quando um cliente pede para ser
esquecido, e o próprio sistema limpa as antigas depois de um ano (você pode encurtar esse prazo
no `.env`, com `CASE_CHAT_RETENTION_DAYS`).

Você não precisa fazer nada: a atualização já traz tudo pronto.
