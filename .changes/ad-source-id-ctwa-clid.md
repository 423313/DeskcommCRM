---
impacto: nada_mudou
secao: corrigido
titulo: Extratores de atribuição deixam de gravar o id do anúncio como clique de origem
---

Quando uma mensagem com `referral` de anúncio chegava sem `ctwa_clid`, os extratores de atribuição (API oficial e WAHA) utilizavam o id do anúncio (`source_id`) como fallback para `sourceId` (`ad_source_id`), fazendo com que o envio de conversões reportasse o identificador do anúncio à plataforma como se fosse o identificador do clique. Agora os extratores gravam `sourceId` exclusivamente quando o clique (`ctwa_clid` / `ctwaClid`) estiver presente, mantendo o id do anúncio estritamente em `adId` (`ad_id`).
