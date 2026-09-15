---
impacto: nada_mudou
secao: corrigido
titulo: Contato com telefone já cadastrado volta 409 apontando o contato existente, em vez de 500
---

Criar um contato cujo telefone já pertencia a outro contato da mesma organização estourava o
índice único `uniq_contacts_org_phone` e a rota devolvia **500** — "erro interno" para o que é
uma resposta previsível: o telefone já está em uso, e o contato que o usa tem id.

Agora a rota responde **409** com o código `contact_exists` e `details.contact_id` apontando o
contato existente, para a tela (ou o integrador) oferecer abrir ou juntar o contato em vez de
mostrar uma falha. O e-mail e o CPF também têm trava única nessa tabela, então o `23505` sozinho
não diz qual índice bateu: o `contact_exists` só sai quando a releitura do telefone — filtrada
por organização, nunca pelo corpo da requisição — encontra um contato vivo. Qualquer outro
conflito continua no 500 de sempre.

Nada muda para quem já roda: quem tinha telefone repetido já não conseguia criar o contato; o
que muda é a explicação.
