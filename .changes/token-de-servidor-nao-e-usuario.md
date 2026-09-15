---
impacto: nada_mudou
secao: corrigido
titulo: Integração com token de servidor volta a conseguir escrever
---

Um token de servidor sem escopo de agente era tratado como se fosse uma pessoa
logada. Duas consequências, e nenhuma delas dava pista do que era:

Toda escrita por token respondia **erro interno**. Mandar mensagem, criar
contato, marcar compromisso, criar negócio — o sistema tentava anotar o token
como "quem fez", e o banco recusava porque token não é gente.

E o **modo de teste do canal** não segurava esse token. Uma integração
conseguia mandar mensagem por um número que o operador tinha deixado em modo de
teste justamente para ninguém falar com cliente ainda.

Token de agente de IA nunca foi afetado, e continua igual.
