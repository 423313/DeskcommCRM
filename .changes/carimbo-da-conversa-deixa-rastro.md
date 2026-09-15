---
impacto: nada_mudou
secao: corrigido
titulo: A falha ao atualizar a conversa depois de uma mensagem passa a ficar registrada nos três canais
---
Quando uma mensagem é gravada e a atualização da conversa falha logo em seguida, a mensagem existe, mas a conversa não sobe na lista do Inbox e, no canal oficial, a janela de resposta de 24 horas não abre. No canal oficial essa falha não era registrada em lugar nenhum; no canal intermediado ficava só no log do servidor, que se perde quando ele reinicia. Agora os três canais gravam a ocorrência no registro de eventos do banco, com a conversa, o sentido da mensagem e o motivo. Nenhuma tela mostra esse registro ainda: ele serve para quem investiga uma conversa que ficou para trás. O texto da mensagem do cliente não é copiado para ele.
