---
impacto: nada_mudou
secao: corrigido
titulo: A visão de ocupação da agenda deixa de ser apagada e recriada a cada atualização
---

A `calendar_selected_external_events` — a view que responde "esse horário está ocupado?" para a Agenda — era derrubada e recriada duas vezes a cada passada do baseline, ou seja, a cada `update.sh`: o objeto deixava de existir no meio do caminho e nascia de novo com identidade nova. Agora ela é substituída no lugar, sem trocar de OID, e o `drop` continua existindo para um caso só — o clone que ainda está na forma antiga, a que expunha o título do evento, e que por isso migra na primeira atualização.

Nada a fazer na instalação: nenhuma tela muda, nenhum dado é tocado. A garantia passa a ser medida a cada versão — `pnpm test:db:update` reaplica o baseline sobre um banco já atualizado e fica vermelho se o OID da view mudar, e monta o clone na forma antiga para conferir que ele ainda migra.
