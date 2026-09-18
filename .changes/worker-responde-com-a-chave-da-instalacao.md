---
impacto: nada_mudou
secao: corrigido
titulo: A instalação que escolheu OpenAI deixa de ouvir que falta chave de IA
---

Se a instalação escolheu **OpenAI** como provedor e guardou a chave em `OPENAI_API_KEY`, o boot anunciava `[env] Nenhuma chave de IA configurada` — uma lista que não contava a chave que o produto usa — e a escada de chave usada pelos processos de fundo não sabia de qual provedor era a chave da instalação quando o modelo vinha sem o prefixo do provedor (o id do catálogo, como `gpt-5.6-terra`). Agora o aviso conta a chave da OpenAI e o degrau resolve o modelo no provedor que a organização escolheu.

Nada muda para quem opera: nenhuma variável nova, nenhum ajuste, nenhum passo na atualização. Quem cadastra a chave pela tela (IA › Credenciais) já era atendido e segue igual. O agente publicado já respondia por essa chave; este conserto não muda o atendimento dele. Crédito: @webtecnica.
