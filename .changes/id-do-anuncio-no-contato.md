---
impacto: capacidade_nova
secao: adicionado
titulo: O contato que chega por anúncio guarda também o id do anúncio
---

Quando alguém clica num anúncio "Clique para o WhatsApp", a origem do contato já registrava o clique, o título e o link do anúncio. O id do próprio anúncio, porém, era descartado sempre que o clique vinha junto — o caso comum —, e sobrevivia só dentro do registro bruto da plataforma. Agora ele é gravado num campo próprio, `ad_id`, pelo canal oficial e pelo WhatsApp por QR, e acompanha o negócio que nasce da conversa. É o dado que permite, depois, descobrir o nome da campanha, do conjunto e do anúncio. Vale para quem chegar a partir desta versão: a origem de quem já está cadastrado não é reescrita. Você não precisa fazer nada. Contribuição de @rafaelbatistazz (#1221).
