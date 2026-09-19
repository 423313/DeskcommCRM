---
impacto: nada_mudou
secao: corrigido
titulo: A Central avisa quando o processamento rápido de eventos cai para o cron de segurança
---

Quando o laço rápido do `event_log` não consegue carregar no worker, a instalação deixa de esconder a degradação só no log do contêiner. A Central passa a mostrar um aviso por organização explicando que o cron de segurança continua processando a fila, mas com atraso maior; o aviso é resolvido automaticamente quando o laço volta a carregar.
