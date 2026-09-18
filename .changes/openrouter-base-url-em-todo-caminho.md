---
impacto: nada_mudou
secao: corrigido
titulo: O gateway configurado em OPENROUTER_BASE_URL vale também para o agente
---
Quem aponta `OPENROUTER_BASE_URL` para um gateway compatível com a OpenRouter via os pontos do painel funcionarem, mas o agente publicado não: o botão "Sugerir resposta" e o turno do agente mandavam a chave para `openrouter.ai` e morriam com "Missing Authentication header". Agora seguem a variável o agente no app, o turno do agente no worker, a credencial da organização sem endereço preenchido no painel e a prova de crédito da instalação; sem ela, nada muda. A validação da chave na tela de Credenciais ainda consulta `openrouter.ai`. Crédito: @rogercampel.
