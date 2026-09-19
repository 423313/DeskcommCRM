---
impacto: capacidade_nova
secao: adicionado
titulo: O contato que chega por anúncio guarda também o id do anúncio
---

Quando alguém clica num anúncio "Clique para o WhatsApp", a origem do contato já registrava o clique, o título e o link do anúncio. O id do próprio anúncio, porém, era descartado sempre que o clique vinha junto — o caso comum —, e sobrevivia só dentro do registro bruto da plataforma. Agora ele é gravado num campo próprio, `ad_id`, tanto pelo canal oficial quanto pelo WhatsApp por QR: ele aparece na origem do contato pela API de contatos e acompanha o negócio que nasce da conversa. Vale para quem chegar a partir desta versão: a origem de quem já está cadastrado não é reescrita. Você não precisa fazer nada. Contribuição de @rafaelbatistazz (#1221).
