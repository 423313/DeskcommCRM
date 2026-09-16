---
impacto: nada_mudou
secao: corrigido
titulo: Mover um card para uma etapa de perda sem motivo deixa de dar erro 500
---

Mover um card para uma etapa que fecha o negócio como perdido sem informar o
motivo respondia "Erro inesperado" (500) — e o card não se movia, sem dizer por
quê. Acontecia nos três caminhos que trocam a etapa do negócio: o arrasto no
quadro, o movimento em lote e o movimento feito pelo assistente de IA.

O motivo da perda é exigência do banco desde sempre (a etapa de perda fecha o
negócio, e fechar como perdido sem causa registrada não é permitido). Quem estava
errado era a tela, que deixava a pergunta chegar ao banco e devolvia a recusa como
falha de servidor.

Agora a resposta é a recusa de negócio, com o que fazer: no arrasto, o card volta
para a coluna de origem e a tela avisa "Informe o motivo da perda." — para
registrar a perda, use a ação Perder do próprio card, que já pede o motivo; no
lote, a recusa avisa antes de tentar, em vez de derrubar o lote inteiro por causa
de um card; e o assistente de IA não move o card quando falta o motivo: ele avisa na
Central que o negócio deveria ser marcado como perdido e que o motivo é uma
decisão de quem está no negócio. Negócio que já tem o motivo registrado continua
sendo movido por ele, pela mesma regra do arrasto — não é uma perda nova.

Nenhuma ação é necessária na instalação: a regra do banco não mudou e nenhum dado
foi tocado.
