---
impacto: capacidade_nova
secao: adicionado
titulo: Envio de conversão de volta pro Google Ads
---

Até aqui, mesmo com o clique do Google Ads já sendo capturado (versão
anterior), o sistema não tinha como avisar o Google quando aquele lead virava
venda de verdade — o anúncio continuava otimizando "pessoa que clicou", nunca
"pessoa que comprou".

Agora existe a conexão completa: um botão "Conectar com Google" em
Configurações › Conversões autoriza a organização, e a partir daí, sempre que
um negócio vindo do Google Ads é marcado como ganho, o valor da venda é
reportado de volta para a conta de anúncios — o mesmo laço que já existia para
a Meta. O envio fala a versão v25 da API do Google Ads.

Não muda nada para quem não usa: a conexão precisa ser configurada
explicitamente (autorizar + informar a conta de anúncios + a ação de
conversão), e a instalação precisa ter as credenciais do Google Ads
(`GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_OAUTH_CLIENT_ID`,
`GOOGLE_ADS_OAUTH_CLIENT_SECRET`) configuradas no `.env`. Sem elas, o botão de
conectar não aparece: no lugar dele, o cartão do Google Ads diz que o envio
ainda não está disponível nesta instalação e lista, pelo nome, quais dessas
variáveis faltam.
