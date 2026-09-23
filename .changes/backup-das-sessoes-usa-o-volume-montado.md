---
impacto: nada_mudou
secao: corrigido
titulo: O backup das sessões do WhatsApp passa a levar a pasta do servidor e para de gravar arquivo vazio como se fosse backup
---

Na 1.42.0 o `backup.sh` passou a usar o volume real das sessões do WhatsApp, mas dois casos ainda saíam errados. Quem guarda as sessões numa pasta do próprio servidor (montagem do tipo bind, por exemplo `- /srv/waha:/app/.sessions`) continuava recebendo um `waha-*.tgz` vazio, porque o Docker só informa o nome da montagem quando ela é um volume nomeado; agora é a pasta do servidor que vai para o backup. E um arquivo vazio deixou de ser anunciado como `✓ sessões WhatsApp salvas`: se a montagem não tem sessão gravada, nenhum `waha-*.tgz` é criado e o passo avisa, em amarelo, que o pareamento do WhatsApp não entrou no backup. O banco é salvo normalmente e a atualização segue.

Contribuição de @webtecnica (#1474), construído sobre o #1429 de @matheuspedro360.
