---
impacto: capacidade_nova
secao: adicionado
titulo: A presença do atendente passa a existir — e a Equipe mostra quem está aí
---

O produto tinha o **leitor** do sinal de presença e nunca teve o **emissor**:
o cron `attendant-heartbeat` derrubava do plantão quem não emitisse sinal de
vida há 15 min, e nenhum arquivo do repositório emitia sinal nenhum. O único
escritor de `last_heartbeat_at` era o clique na chave de plantão — um carimbo de
clique se fingindo de batida, e a chave se desligava sozinha ~15 min depois de
ligada (medido pelo @paulolimajr77 no PR #720).

Agora cada aba aberta emite uma batida a cada 60 s (`POST
/api/v1/attendants/presence`), e "tem alguém aí?" é respondido na hora da
pergunta, a partir do carimbo: sem cron de expiração e sem coluna booleana de
presença. Fechar a aba não escreve nada no banco — a pessoa some da lista de
presentes dentro do prazo, sozinha. Quem lê: a rota de disponibilidade, a
escalação (e a ferramenta MCP que o agente usa), o aviso ao lead e a tela de
Equipe, com selo presente/ausente e o carimbo.

A presença **não** toca na decisão. A separação é de tipo, não de disciplina: o
predicado do plantão (`estaDePlantao`, em `lib/routing/eligibility.ts`) não
recebe presença como entrada. Quem tira alguém do plantão é a pessoa (a chave)
ou a jornada publicada — nunca o navegador fechando.

Custo: uma escrita por aba a cada 60 s (480 em um turno de 8 h); com a aba
fechada, nenhuma.
