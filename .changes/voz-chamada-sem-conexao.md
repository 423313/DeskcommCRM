---
impacto: nada_mudou
secao: corrigido
titulo: A chamada de voz pelo WhatsApp liga de verdade depois de parear
---

Quem pareava o número de chamada de voz e clicava em "Chamar" recebia "Não foi
possível completar a chamada. Tente novamente em instantes." e continuava
recebendo, mesmo com o número pareado, até alguém reiniciar o serviço de voz. O
pareamento pedia ao serviço para "re-parear" logo depois de criar a sessão, e
isso deixava a ligação presa a uma conexão já descartada. Agora o pareamento
cria a sessão uma vez só, e o código QR chega do mesmo jeito.

Consertos que vinham no mesmo caminho:

- Celulares brasileiros que o WhatsApp registrou sem o nono dígito eram
  discados com ele, e o telefone do outro lado nunca tocava: a tela ficava em
  "Chamando…" até desistir. O CRM agora pergunta ao WhatsApp qual é o número
  registrado antes de ligar.
- A ligação feita pelo CRM era registrada como recebida. A que o cliente não
  atendia virava um aviso de "chamada perdida" na Central, pedindo para ligar
  de volta a quem você acabou de ligar. Agora ela aparece na linha do tempo
  como "Chamada de voz sem resposta", sem aviso.
- Ao começar a ligação, a tela às vezes mostrava um erro enquanto o telefone
  do outro lado já tocava, e o painel da ligação podia sumir.
- Desvincular o aparelho pelo celular deixava a tela dizendo "pareado" para
  sempre. Agora ela volta a "não pareado" e dá para parear de novo.
- Clicar em "Parear" de novo, com o aparelho recém-vinculado e a tela ainda
  desatualizada, podia desconectar o aparelho. Agora o CRM confere com o
  serviço de voz antes de apagar qualquer coisa.
- Desconectar o número quando o serviço de voz já tinha perdido a sessão dava
  erro sem fim. Agora desconecta.
- O código QR que vencia continuava na tela sem funcionar. Agora a tela avisa
  que venceu e libera o botão para gerar outro.
