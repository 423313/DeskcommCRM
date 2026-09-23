---
impacto: nada_mudou
secao: corrigido
titulo: O agente responde com modelos Google pela OpenRouter e não manda mais mensagem em branco
---

Quem usa a OpenRouter com um modelo que não é da OpenAI, como o `google/gemini-2.5-flash-lite`, via o agente falhar com "Invalid JSON response": o CRM chamava na OpenRouter um endereço que ela não atende para todo modelo. Agora o agente, o botão "Teste", os recursos de IA com a chave da organização e os com a chave da instalação usam o endereço que a OpenRouter atende para qualquer modelo.

O agente também deixa de mandar ao cliente uma mensagem em branco quando o modelo escreve só espaços ou quebras de linha: o texto volta ao modelo para ele escrever a resposta de verdade.

Nada para fazer.

Diagnóstico e conserto de @vgamkt no #1130.
