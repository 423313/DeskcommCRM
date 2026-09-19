---
impacto: nada_mudou
secao: corrigido
titulo: A verificação de VPS recém-instalada passa a rodar no CI
---

Nada muda na sua VPS: nenhuma migration, nenhuma variável, nenhuma imagem. O que muda é o que o pipeline mede antes de a release sair — a verificação da instalação fresca (`vps-fresh-onboarding`), que existia e nunca tinha rodado em lugar nenhum, passa a rodar a cada mudança, com WAHA, Redis (a mesma tradução REST do Upstash do `docker-compose.prod.yml`) e um destino HTTP real para Resend e Nuvemshop. O primeiro dono é criado pelo mesmo `scripts/bootstrap-owner.ts` que o `install.sh` roda na sua VPS. Crédito: @webtecnica.
