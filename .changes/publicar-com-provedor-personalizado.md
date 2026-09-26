---
impacto: nada_mudou
secao: corrigido
titulo: O agente com o provedor personalizado passa a publicar
---
Quem cadastrou um provedor personalizado compatível com OpenAI (um Ollama exposto, um LiteLLM, um proxy próprio), escolheu o modelo no assistente e clicou em Publicar recebia "Falha ao publicar: model_not_found", mesmo com a credencial validada. Agora a publicação confere o modelo na lista que o próprio endpoint devolveu no teste de conexão: se o modelo está lá, o agente publica; se não está, a recusa continua. Para Anthropic, OpenAI, Google, OpenRouter, DeepSeek e Requesty nada muda. Crédito: @fillipe-felix.
