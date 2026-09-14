---
impacto: nada_mudou
secao: corrigido
titulo: O gate que exige conferência de organização passa a cobrir todas as funções privilegiadas
---

Nada muda na tela nem na operação: é proteção do próprio desenvolvimento.

O banco tem funções privilegiadas que rodam **por cima** das regras de isolamento entre organizações. Quando uma delas recebe a organização como argumento, ela precisa conferir se quem chamou pertence de fato àquela organização — senão um usuário logado numa organização a chama com o identificador de outra.

O teste que cobrava isso verificava **duas** funções, escritas à mão numa lista. Função nova nascia fora da lista, e nenhum gate a alcançava: em 2026-09-12 uma função escrita nesta mesma semana nasceu exatamente com esse defeito e a suíte inteira ficou verde — só apareceu porque quem a escreveu sabotou o próprio código de propósito.

Agora a pergunta é feita ao catálogo do Postgres, para **todas** as funções que têm a forma do risco: privilegiada, alcançável por usuário logado e recebendo a organização por argumento. Quem confere por delegação — chamando outra função que confere — é reconhecido, para o gate não acusar quem já faz a coisa certa.

O mesmo caminho já tinha sido percorrido pela pergunta vizinha ("quem pode executar esta função?"): ela também era lista fixa, virou varredura, e naquele dia 8 de 25 funções estavam expostas com todos os gates obrigatórios verdes.
