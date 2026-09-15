---
impacto: nada_mudou
secao: corrigido
titulo: Integração com token de servidor volta a conseguir escrever
---

Um token de servidor sem escopo de agente era tratado como se fosse uma pessoa
logada, e o sistema tentava anotar o token como "quem fez". O banco recusava,
porque token não é gente — então mandar mensagem ou marcar compromisso por
token respondia **erro interno**, sem pista do motivo.

Agora o token é reconhecido como integração, e essas escritas voltam a
funcionar. Se você tem um sistema ligado por token, três coisas passam a valer
para ele junto com isso:

**O envio por token respeita o modo de teste do canal.** Enquanto o número
estiver em teste, só os números da lista de teste recebem; para os outros a
mensagem fica como falha, com o motivo "modo de teste do canal". É a mesma
regra que já valia para a IA e para as automações. Para liberar, abra
"Configurar acesso da IA" no número, em Conexões, e deixe-o como "IA aberta ao
público".

**Comparecimento e falta continuam sendo registrados pela equipe.** Por token, a
API recusa com o pedido de confirmação humana na Agenda, em vez de devolver um
erro genérico.

**Mensagem enviada por token não pausa a IA** na conversa, ao contrário da
resposta de um atendente pela tela.

Token de agente de IA nunca foi afetado, e continua igual.
