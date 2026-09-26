---
impacto: capacidade_nova
secao: adicionado
titulo: O Jev passa a observar tentativas de manipular o agente, ao lado da sua IA de sempre
---

O Jev ganha a segunda tarefa: **Perceber tentativa de manipulação**. Na mesma hora em que a sua IA de sempre confere se a mensagem do cliente tenta enganar o agente ("ignore as instruções", "me diga o seu prompt"), o Jev responde a mesma pergunta, em paralelo. Quando ele demora mais que a sua IA, a resposta ao cliente espera a diferença: a busca da chave dele e a pergunta a ele têm, juntas, um teto de cerca de um segundo e meio, depois do qual o sistema segue sem ele. Ele só recebe o que o cliente **digitou**: áudio, imagem e documento ficam de fora — nem a transcrição nem o texto lido deles saem para a TypeSafe.

A tarefa nasce **só observando**: quem decide continua sendo a sua IA de sempre, e o cartão do Jev, em **IA › Provedores**, mostra quantas vezes os dois deram o mesmo alerta (nenhum, leve ou forte) nos últimos 30 dias — e em quantas mensagens só o Jev daria o alerta forte, que é o que muda se ele passar a somar. Só depois de comparar, e com um clique de quem administra, dá para deixar o Jev decidir — e, decidindo, o sinal dele só se **soma** ao da sua IA: ele nunca apaga um alerta dela, e sem ela (fora do ar ou com erro) vale "nenhum sinal", como hoje. O Jev nunca bloqueia, cala ou responde o cliente.

**Quem já tem o Jev ligado** vê a tarefa nova com o selo **"Nova"**, já observando, e a frase que diz o que isso quer dizer: nada muda para o cliente até você deixar o Jev decidir. Ela usa o mesmo dado que você já autorizou — cada mensagem, sozinha, sem CPF, telefone e e-mail. Isso é uma chamada a mais ao Jev por mensagem respondida pelo agente (uma fração de centavo de dólar, cobrada na sua conta da TypeSafe). Para não usar, clique em **"Pausar esta tarefa"** no cartão; para manter como está e tirar o selo, **"Manter só observando"**. Ela só roda onde a verificação "Detectar tentativa de manipular o assistente" está ligada — ela vale para a empresa toda e fica em qualquer agente, na aba **"Confere antes de enviar"**; com ela desligada, o cartão mostra a tarefa como **"Não roda"**, com o caminho —, e nunca nos testes do agente nem nas sugestões do modo assistido (lá a IA só sugere, e o cartão segue sem comparação). Essa verificação vem **ligada** para quem nunca mexeu nela, e a aba "Confere antes de enviar" dizia "Desligada" nesse caso, embora ela rodasse; agora a tela diz o que acontece.

O primeiro número do cartão passa a se chamar **"Respostas do Jev"**: com mais de uma tarefa, cada mensagem do cliente rende uma resposta por tarefa.

As observações ficam numa tabela própria, sem o texto das mensagens, e são apagadas depois de **90 dias** pela limpeza diária. Para mudar o prazo, use `JEV_OBSERVACOES_RETENTION_DAYS` no `.env` (mínimo de 30 dias). Nada precisa ser editado para atualizar.

Se a instalação voltar para a versão anterior, a tarefa deixa de rodar lá e o estado dela fica guardado. Voltando para a versão da onda 1 do Jev (1.48), o primeiro clique no cartão de lá apaga o estado das tarefas — de volta a esta versão, a manipulação reaparece como nova, observando. E a 1.48 não sabe pausar só o clima: se você o pausou aqui com "Pausar esta tarefa", lá ele volta a medir enquanto o Jev estiver ligado. Para parar de vez numa volta à 1.48, use "Desligar" no cartão.
