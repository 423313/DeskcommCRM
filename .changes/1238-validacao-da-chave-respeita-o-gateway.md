---
impacto: nada_mudou
secao: corrigido
titulo: A validação da chave OpenRouter respeita o gateway da instalação
---

Quem define `OPENROUTER_BASE_URL` para um gateway compatível via a tela de
Credenciais dizer "chave inválida" para a credencial que o agente já estava
usando. A validação provava a chave contra `openrouter.ai` fixo, enquanto o
agente publicado, o turno do worker e a prova de crédito da instalação já
usavam a base configurada.

A prova agora é `/key` na base da instalação, com
`https://openrouter.ai/api/v1` de default quando a variável não existe ou está
vazia. Quem não define a variável não tem nada a fazer: o endereço continua o
mesmo.

Crédito: @webtecnica.
