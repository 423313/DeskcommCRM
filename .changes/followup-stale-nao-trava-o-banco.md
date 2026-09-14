---
impacto: nada_mudou
secao: corrigido
titulo: O acompanhamento que já encerrou deixa de derrubar o banco
---

O banco da instalação podia ir a 100% de processador sem ninguém usando o produto. A causa era um acompanhamento (follow-up) que já tinha acabado: o sistema tentava atualizá-lo, o banco recusava, e o recuso era do tipo que o próprio banco pede "tente de novo". Ele tentava de novo — milhares de vezes por minuto — e o processador não saía do teto.

Isso não muda tela, fluxo nem configuração. Na próxima atualização o recuso deixa de pedir retry, e o banco volta a respirar.

Nada para fazer na VPS além de atualizar quando o aviso aparecer.
