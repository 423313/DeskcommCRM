---
impacto: nada_mudou
secao: corrigido
titulo: O identificador da conexão de WhatsApp nasce num lugar só e cabe no limite
---

O botão "Conectar novo WhatsApp", na Central de Conexões, falhava sempre com "Falha na comunicação
com o WhatsApp (WAHA)". O identificador interno que o sistema manda para o WhatsApp saía com 69
caracteres, e o WhatsApp recusa acima de 54, então a conexão nem chegava a ser criada do outro lado
e o card ficava em "Parado" pedindo reparo. O onboarding escapava porque montava o identificador
curto por conta própria, num segundo lugar do código.

A versão anterior já corrigiu o identificador no banco e arrumou as conexões paradas que ainda
tinham o nome longo. Agora o formato curto é um só, usado pelas duas telas — onboarding e
Conexões —, e o sistema confere o limite antes de falar com o WhatsApp: se o identificador ainda
estiver longo, ele é trocado na hora **apenas** quando o número nunca chegou a ser pareado; num
número que já pareou, a conexão para com um aviso próprio em vez de trocar o identificador — trocar
ali desligaria o sistema do WhatsApp que está no ar e exigiria um QR novo.

Nada muda para quem já tem número conectado.
