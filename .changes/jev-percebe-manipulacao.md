---
impacto: capacidade_nova
secao: adicionado
titulo: O Jev passa a observar tentativas de manipular o agente, ao lado da sua IA de sempre
---

O Jev ganha a segunda tarefa: **Barrar tentativa de manipulação**. Na mesma hora em que a sua IA de sempre confere se a mensagem do cliente tenta enganar o agente ("ignore as instruções", "me diga o seu prompt"), o Jev responde a mesma pergunta, em paralelo, sem atrasar a resposta ao cliente.

A tarefa nasce **só observando**: quem decide continua sendo a sua IA de sempre, e o cartão do Jev, em **IA › Provedores**, mostra quantas vezes os dois concordaram nos últimos 30 dias. Só depois de comparar, e com um clique de quem administra, dá para deixar o Jev decidir — e, decidindo, o sinal dele só se **soma** ao da sua IA: ele nunca apaga um alerta dela, e sem ela (fora do ar ou com erro) vale "nenhum sinal", como hoje. O Jev nunca bloqueia, cala ou responde o cliente.

**Quem já tem o Jev ligado** vê a tarefa nova com o selo **"Novo"**, já observando: ela usa o mesmo dado que você já autorizou — cada mensagem, sozinha, sem CPF, telefone e e-mail. Isso é uma chamada a mais ao Jev por mensagem respondida pelo agente (uma fração de centavo de dólar, cobrada na sua conta da TypeSafe). Para não usar, desligue a tarefa no cartão. Ela só roda onde a verificação "Detectar tentativa de manipular o assistente" (na Segurança do agente) está ligada, e nunca nos testes do agente.

O primeiro número do cartão passa a se chamar **"Respostas do Jev"**: com duas tarefas, cada mensagem do cliente rende uma resposta por tarefa.

As observações ficam numa tabela própria, sem o texto das mensagens, e são apagadas depois de **90 dias** pela limpeza diária. Para mudar o prazo, use `JEV_OBSERVACOES_RETENTION_DAYS` no `.env` (mínimo de 30 dias). Nada precisa ser editado para atualizar.

Se a instalação voltar para a versão anterior, a tarefa deixa de rodar lá e o estado dela fica guardado. Voltando para a versão da onda 1 do Jev (1.48), o primeiro clique no cartão de lá apaga o estado das tarefas — de volta a esta versão, a manipulação reaparece como nova, observando.
