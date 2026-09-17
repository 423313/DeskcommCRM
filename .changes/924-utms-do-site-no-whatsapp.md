---
impacto: capacidade_nova
secao: corrigido
titulo: A origem da página sobrevive quando o contato chega pelo WhatsApp
---

Quando alguém lia uma campanha no site e tocava no botão que abre o WhatsApp, a
conversa entrava no CRM como WhatsApp e a origem da página morria ali: o card
nascia sem rótulo nenhum, e o relatório de onde vem o negócio perdia justamente
o toque que mais custa — o que veio de anúncio ou de landing page.

Agora o link do botão pode carregar a origem junto (utm_source, utm_medium,
utm_campaign, gclid) e ela é estampada no contato ANTES do card nascer, de modo
que o card já nasce com o rótulo. Mensagem sem código nenhum segue exatamente
como era.

O código vale só na primeira mensagem do contato e nunca sobrescreve uma origem
já gravada, inclusive a de anúncio: quem chegou de campanha paga primeiro mantém
a campanha paga. Ele leva apenas campos de campanha — nenhum dado pessoal — e
tem teto de tamanho. Em Configurações → Conversões há a explicação de como montar
o link, com um exemplo gerado na hora, e a lista de contatos ganhou o filtro de
origem "Site (landing page)".
