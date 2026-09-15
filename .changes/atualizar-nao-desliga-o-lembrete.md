---
impacto: nada_mudou
secao: corrigido
titulo: Atualizar o CRM deixa de desligar os lembretes
---

Toda atualização desligava o lembrete de todos os tipos de agendamento em que
alguém o tinha ligado. Sem erro e sem aviso: a tela mostrava o controle
desmarcado como se ninguém o tivesse marcado, e o cliente deixava de receber o
aviso do compromisso.

A correção de histórico que fazia isso era certa quando foi escrita, numa época
em que nada lia esse campo — só que ela voltava a ser aplicada a cada
atualização, e o disparador nasceu no meio do caminho. Agora ela roda uma vez
por banco e para de reescrever a sua escolha.

**Se você já usou lembretes, confira se continuam ligados** em Configurações ›
Agenda, no campo "Avisar o cliente antes do compromisso". Uma atualização
anterior pode tê-los desligado, e esta versão não religa sozinha: religar por
conta própria mandaria mensagem para clientes de quem desligou de propósito.
