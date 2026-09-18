---
impacto: nada_mudou
secao: corrigido
titulo: A nota de voz gravada no Chrome chega no canal oficial
---

Quem gravava uma nota de voz no CRM pelo Chrome — no computador ou no celular — via o envio dar certo na tela, e o cliente recebia uma mensagem de áudio que não toca: o WhatsApp dele dizia que o áudio não estava mais disponível. No Firefox a mesma gravação sempre funcionou, e é essa diferença que explica o defeito ter durado: o Firefox grava direto no formato de destino e não passava pelo trecho com o erro.

O CRM converte a gravação do Chrome para o formato que o WhatsApp aceita, e a conversão estava certa — o arquivo saía como Ogg com Opus. O que estava errado era a etiqueta gravada junto: `audio/ogg`, sem dizer o codec. O canal oficial não aceita `audio/ogg` genérico para nota de voz, e o áudio chegava ao cliente sem tocar. Agora a etiqueta sai completa, com o codec, e é a mesma que o navegador usa quando ele próprio sabe gravar nesse formato.

Duas coisas que valem saber: notas de voz enviadas antes desta correção continuam quebradas para quem as recebeu — é preciso gravar de novo. E, quando a plataforma recusa a entrega e avisa o CRM, a mensagem aparece como falha, mas ainda sem o motivo; se ela aceita um áudio que depois não toca, o CRM não tem como saber, e a mensagem fica como enviada.

Contribuição de @rafaelbatistazz (#1187).
