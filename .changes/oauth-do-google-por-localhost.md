---
impacto: nada_mudou
secao: corrigido
titulo: Conectar o Google Agenda funciona quando o navegador abre por localhost
---

Quem roda o DeskcommCRM na própria máquina abre a aplicação por `localhost`, enquanto o instalador guardou o endereço de rede do computador. O Google compara o endereço de retorno letra por letra, então o consentimento voltava para o endereço errado e a conexão com a Agenda nunca terminava — sem mensagem que explicasse por quê.

Agora, quando o navegador abre por `localhost` (ou `127.0.0.1`), o endereço de retorno acompanha. Só endereços da própria máquina valem essa exceção: qualquer outro host continua perdendo para o endereço oficial da instalação, para que um endereço forjado não consiga desviar o código de autorização que o Google devolve. Numa instalação em servidor nada muda.

Contribuição de @betoarts (#714).
