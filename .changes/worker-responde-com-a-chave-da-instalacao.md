---
impacto: nada_mudou
secao: corrigido
titulo: O bot volta a responder sozinho quando a IA da instalação é a OpenAI
---

Se a instalação foi feita escolhendo **OpenAI** como provedor e a chave ficou em
`OPENAI_API_KEY`, o bot podia ficar mudo nas mensagens que chegam — enquanto o
teste do agente e o "Sugerir resposta" respondiam normalmente com a mesma chave.
A mensagem era registrada, o envio automático era pulado e o motivo registrado
dizia que não havia chave de IA configurada. Agora o caminho que responde
sozinho usa a mesma chave que o resto do produto já usava, e o aviso do boot
deixou de anunciar "nenhuma chave de IA" numa instalação que responde por ela.

Nada muda para quem opera: nenhuma variável nova, nenhum ajuste, nenhum passo na
atualização. Quem cadastrou a chave pela tela (IA › Credenciais) já era atendido
e segue igual. Crédito: @webtecnica.
