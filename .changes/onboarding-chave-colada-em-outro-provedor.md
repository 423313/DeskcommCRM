---
impacto: nada_mudou
secao: corrigido
titulo: A chave colada de outro provedor publica o atendente
---

Quem configurava a IA colando a chave da OpenAI ficava com o atendente salvo como rascunho, e a tela pedia uma chave da Anthropic — o provedor padrão da instalação. A chave estava gravada e era utilizável; a publicação é que só procurava credencial do provedor da instalação. Agora, quando não há chave utilizável para esse provedor, a publicação adota a credencial validada que a organização já tem, de qualquer provedor, e leva provedor, modelo e chave juntos — o par não pode ser emprestado pela metade. Quem instalou pelo kit, com chave no ambiente, continua publicando exatamente como antes. E quando a chave foi colada há pouco e o provedor ainda não confirmou, a tela passa a dizer que é isso que falta, em vez de pedir para colar de novo uma chave que já está lá.
