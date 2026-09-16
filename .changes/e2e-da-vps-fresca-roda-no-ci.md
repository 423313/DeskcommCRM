---
impacto: capacidade_nova
secao: adicionado
titulo: A verificação de VPS recém-instalada passa a rodar no CI
---
Quem instala o produto numa VPS nova ganha uma verificação automática a cada mudança: o CI sobe o WAHA (WhatsApp), o Redis com a mesma tradução REST do Upstash que o `docker-compose.prod.yml` usa, e um dublê HTTP de Resend e Nuvemshop — inclusive o handshake OAuth do Nuvemshop — e roda a especificação `vps-fresh-onboarding` numa instalação limpa, sem credenciais de SaaS e sem dados semeados. Nada muda no seu servidor: é infraestrutura de teste do repositório. Crédito: @webtecnica.
