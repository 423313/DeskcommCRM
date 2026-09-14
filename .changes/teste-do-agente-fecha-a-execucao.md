---
impacto: capacidade_nova
secao: corrigido
titulo: O teste do agente termina de verdade, e quando falha diz por quê
---

Cada execução da aba Teste de um agente deixava uma linha de execução presa em
"rodando", para sempre. Numa instalação com 16 testes, eram 16 linhas paradas.
O motivo era um estado que o banco não reconhecia, gravado sem ninguém conferir
se a gravação tinha dado certo.

Agora a execução fecha como concluída ou falhada, com o tempo que levou.

E quando o teste falha, a causa passa a existir em algum lugar. Antes o erro era
descartado sem deixar rastro: a tela dizia uma frase genérica sobre modelo e
credencial, e não havia nada no log nem na execução para dizer o que realmente
aconteceu. Agora o erro vai para o log do servidor e fica guardado na própria
execução. A mensagem para quem opera continua a mesma, porque o texto do erro é
técnico.

Os contadores de passos e tokens da execução de teste seguem em zero: esse dado
não chega até ali, e preenchê-lo com um palpite seria pior que o zero.
