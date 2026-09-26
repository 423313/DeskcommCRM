---
impacto: capacidade_nova
secao: adicionado
titulo: O Jev passa a observar qual agente deve atender, ao lado do seu roteador de intenção
---

O Jev ganha a terceira tarefa: **Escolher qual agente atende**. Onde há um roteador de intenção ativo (**IA › Roteadores**), a cada mensagem nova do cliente a sua IA de sempre escolhe a intenção — e, com ela, o agente que atende. O Jev responde a mesma pergunta, entre as mesmas intenções, ao mesmo tempo. Enquanto ele só observa, a resposta ao cliente **não espera por ele**: a resposta dele é guardada quando chega.

A tarefa nasce **só observando**: quem decide continua sendo a sua IA de sempre, e o cartão do Jev, em **IA › Provedores**, mostra quantas vezes os dois levariam o cliente ao **mesmo agente** nos últimos 30 dias — duas intenções que apontam para o mesmo agente contam como concordância. Só depois de comparar, e com um clique de quem administra, dá para deixar o Jev decidir. Decidindo, vale a escolha dele, com o mesmo mínimo de confiança do roteador aplicado à certeza dele, e a sua IA de sempre fica de reserva: ela continua sendo perguntada a cada mensagem, ao mesmo tempo que o Jev (e continua custando), e decide quando ele não responde. A resposta ao cliente espera pelo Jev só o que ele demorar a mais que a sua IA de sempre; a pergunta a ele tem um teto de cerca de um segundo e meio. Sem a sua IA de sempre (fora do ar ou sem chave), vale o que vale hoje — o agente que já atendia a conversa, ou o de reserva do roteador —, nunca só o Jev. O Jev nunca bloqueia, cala ou responde o cliente.

Na tela do roteador, **"Testar classificação"** passa a mostrar a escolha da sua IA e a do Jev **lado a lado**, com o agente a que cada uma levaria. O teste não entra na comparação do cartão (é uma frase digitada por quem configura, não um atendimento), mas o custo dele aparece em **IA › Execuções**, como o da sua IA.

**Quem já tem o Jev ligado** vê a tarefa nova com o selo **"Novo"**, já observando: ela usa o mesmo dado que você já autorizou — cada mensagem, sozinha, sem CPF, telefone e e-mail —, junto das intenções que a sua empresa cadastrou no roteador (descrição e exemplos). Isso é uma chamada a mais ao Jev por mensagem recebida nos números com roteador ativo (uma fração de centavo de dólar, cobrada na sua conta da TypeSafe). Para não usar, pause a tarefa no cartão. Sem nenhum roteador ativo, o cartão mostra a tarefa como **"Não roda"**. Diferente da sua IA, que lê também as mensagens anteriores, o Jev lê só a última: numa resposta curta ("sim", "a primeira") ele tende a dizer "nenhuma", e a conversa segue com o agente que já a atendia.

Em **IA › Execuções**, a falha do Jev numa tarefa do atendimento passa a dizer que nada dependia só dele — valeu a sua IA de sempre ou, sem ela, a regra de antes. A frase anterior dizia que ele "só opina", o que deixa de ser verdade quando ele decide o agente.

Se a instalação voltar para a versão da onda 1 do Jev (1.48), a tarefa deixa de rodar e o roteador segue só com a sua IA de sempre. O primeiro clique no cartão de lá apaga o estado das tarefas — de volta a esta versão, a escolha do agente reaparece como nova, observando. Nada precisa ser editado para atualizar.
