---
impacto: capacidade_nova
secao: adicionado
titulo: As respostas prontas chegam à integração com as variáveis do próprio integrador
---

Um sistema de fora que usa as respostas prontas da equipe — para montar um texto, ou para um procedimento interno apontar "use o modelo X" — agora tem o que faltava nas três pontas. A lista das respostas prontas passou a devolver só as compartilhadas com a equipe: um token de integração lia também os rascunhos pessoais que cada atendente escreveu para si, e isso acabou. O preenchimento segue a mesma regra: pedir um rascunho pessoal de outra pessoa pelo id responde que ele não existe, e o agente de IA passa a usar só as respostas compartilhadas. Cada resposta traz agora a lista das variáveis que o texto usa, e quem preenche pode mandar os valores que só o sistema de fora sabe — o link do formulário, o valor em aberto, o número do protocolo (`valores: { link_formulario: "…" }`). Variável fora do formato, variável que vem do contato ou do negócio, ou variável que o modelo não usa é recusada dizendo o nome dela, em vez de sair em branco no meio do texto. E o endereço `/app/templates?modelo=<id>` abre aquele modelo direto, para o link que a integração devolve cair na tela certa.

Não há ação para quem opera a VPS.

Contribuição de @webtecnica (#1673).
