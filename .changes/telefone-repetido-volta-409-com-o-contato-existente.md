---
impacto: nada_mudou
secao: corrigido
titulo: Cadastrar um contato com telefone já usado explica o motivo, em vez de "Erro interno"
---

Criar pela tela um contato cujo telefone já pertencia a outro contato da mesma organização
terminava num aviso de "Erro interno. Tente de novo em instantes." — e tentar de novo dava o
mesmo erro, porque não havia nada de errado com o servidor: o telefone já estava em uso.

Agora o aviso diz o que aconteceu: "Já existe um contato com este telefone." (em espanhol,
"Ya existe un contacto con este teléfono."). O cadastro continua recusado, como antes; o que
muda é a explicação.

Por baixo, a resposta de `POST /api/v1/contacts` passou de 500 para 409, com o código
`contact_exists` e o id do contato que já usa o telefone em `details.contact_id`. Por
enquanto nenhuma tela usa esse id — ela só mostra a frase —, e essa rota aceita apenas a
sessão de quem está logado, não token de integração. O e-mail e o CPF também não podem se
repetir nessa tabela, e o 409 só sai quando já existe um contato ativo com aquele telefone:
qualquer outra recusa continua como antes.

Você não precisa fazer nada.

Achado e corrigido por @webtecnica.
