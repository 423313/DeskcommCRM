---
impacto: nada_mudou
secao: corrigido
titulo: A IA deixa de afirmar o tamanho de um catálogo que não mediu
---

Quando a varredura do catálogo era cortada e a loja não informava o total, a resposta ao
cliente saía com o número `null` no meio da frase — o agente dizia "o catálogo desta loja
tem null". Era uma afirmação sobre um tamanho que ninguém mediu, justamente no lugar onde a
regra é declarar a dúvida.

O mesmo valia para a lista vazia: "não encontrei" podia ser ouvido como "a loja não tem",
quando o que houve foi uma varredura que não chegou ao fim. Lista vazia só é ausência quando
a varredura terminou.

Agora o tamanho medido continua sendo dito — é ele que explica o corte a quem opera — e o que
não foi medido é dito como desconhecido. Nada muda no que o operador precisa fazer: as mesmas
ferramentas respondem, e a regra de não afirmar ausência sem varredura completa já valia.
