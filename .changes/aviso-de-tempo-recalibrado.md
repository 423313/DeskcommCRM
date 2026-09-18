---
impacto: nada_mudou
secao: corrigido
titulo: O aviso de tempo da verificação parou de reclamar de rodada que estava certa
---

O aviso que a verificação automática dá quando ela passa do tempo previsto
estava calibrado com um número apertado demais — ele já reclamava de uma rodada
que tinha terminado bem. O número foi refeito com a medição correta, e agora só
reclama quando há de fato crescimento.

Também entrou uma travinha que impede esse número de ser afrouxado sem
justificativa escrita, e que garante que ele sempre dispare antes de a rodada ser
encerrada — sem isso, o aviso existiria e nunca chegaria a falar.

Para quem opera um servidor, nada muda: isto acontece inteiramente na esteira de
verificação do projeto, antes de qualquer versão ser publicada.
