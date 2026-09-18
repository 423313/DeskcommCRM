---
impacto: nada_mudou
secao: corrigido
titulo: A tela de atualização para de anunciar uma versão que o servidor não confirmou
---

Quando uma atualização terminava bem mas o servidor não voltava a se comunicar com o sistema — serviço parado, tarefa agendada removida, credencial vencida —, a tela de atualização anunciava como instalada a versão que o pedido pedia, e continuava anunciando por tempo indeterminado. Se o aplicativo não tivesse subido na versão nova, quem abrisse a tela lia a versão nova enquanto o que estava de fato em execução era a antiga, e não havia como desconfiar do que a tela dizia.

Agora a tela só afirma a versão que o servidor confirmou por último. Nos minutos seguintes ao fim de uma atualização bem-sucedida, ela diz que o pedido terminou, que a confirmação ainda não chegou e qual é a última versão que o servidor confirmou — e não oferece de novo a atualização que acabou de ser feita. Passado o prazo sem nenhuma confirmação, a versão-alvo volta a aparecer como pedido em aberto, com o botão de atualizar de volta: se o aplicativo realmente não subiu, você consegue tentar outra vez pela própria tela.

Nada para configurar. Quem tem o servidor reportando normalmente não vê diferença nenhuma: a tela segue mostrando a versão em execução e volta sozinha ao estado de sempre assim que a confirmação chega. Crédito: @webtecnica.
