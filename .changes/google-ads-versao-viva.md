---
impacto: nada_mudou
secao: corrigido
titulo: O envio de vendas para o Google Ads volta a funcionar, e o botão só aparece quando a instalação está pronta
---
A versão 1.35.0 trouxe o envio de conversões para o Google Ads falando uma versão da API que o Google já tinha desativado (v17). Toda venda voltava recusada, sem nova tentativa, e a tela de Conversões mostrava a página de erro do Google no lugar do motivo. Agora o envio usa a v25, que o Google mantém até agosto de 2027. A versão fica num lugar só do código, e um teste impede que ela volte a ficar abaixo das que o Google ainda mantém. Quando o Google responder algo fora do formato de erro dele, a tela mostra um motivo legível, com a pista de que a versão pode ter saído do ar.

A 1.35.0 também dizia que, sem as credenciais do Google Ads no `.env`, o botão "Conectar com Google" não aparecia — e ele aparecia. Agora é verdade: sem `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_OAUTH_CLIENT_ID` e `GOOGLE_ADS_OAUTH_CLIENT_SECRET`, o cartão do Google Ads diz que o envio ainda não está disponível nesta instalação e lista, pelo nome, quais variáveis faltam. Quem já tem as três configuradas não precisa fazer nada.
