---
impacto: nada_mudou
secao: corrigido
titulo: Quem baixa o projeto para usar ou estudar deixa de receber um erro que não é dele
---

Quem faz uma cópia do projeto (um "fork") para estudar, testar ou contribuir
recebia um erro vermelho na verificação automática logo na primeira vez que a
rodava — e o erro não tinha nada a ver com o que a pessoa tinha feito. Ele
existia porque o projeto confere se as imagens de instalação pertencem ao dono
certo, e numa cópia esse dono é outro por definição.

Agora a conferência entende quando está rodando dentro de uma cópia e não cobra
nada ali, dizendo por escrito que aquele caso não foi medido — em vez de dizer
que passou, que seria mentira, ou que falhou, que era o problema.

Contra o projeto original a conferência continua exatamente como era: se alguém
tentar trocar o dono das imagens num pedido de alteração, o erro aparece.

Para quem já opera um servidor, nada muda: isto acontece inteiramente na esteira
de verificação, antes de qualquer versão ser publicada.
